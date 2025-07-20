import { exec, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';
import { BrowserWindow } from 'electron';
import {
  ClaudeSDK,
  AgentInfo,
  AgentLog,
  ParsedIssue,
  IssueDetails,
  AgentStatusResult,
  AgentSummary,
  LogFileResult,
  AgentStatusUpdate,
  AgentOutput,
  AgentLogUpdate,
  SDKMessage,
  ClaudeService
} from './claude-service-types';
import { createSafeWorktreePath, sanitizePath, sanitizeBranchName } from './utils/sanitizer';
import { GitMutex } from './git-mutex';
import { findExecutable } from './executable-finder';
import { Logger } from './utils/logger';

const execPromise = util.promisify(exec);

// Wrapper for exec that includes process verification
async function execWithVerification(command: string, options?: any): Promise<{ stdout: string; stderr: string }> {
  const startTime = Date.now();
  Logger.debug('EXEC', `Running command: ${command}`);
  
  try {
    const result = await execPromise(command, options);
    const duration = Date.now() - startTime;
    Logger.debug('EXEC', `Command completed in ${duration}ms: ${command}`);
    
    // For git worktree operations, verify the result
    if (command.includes('git worktree')) {
      // Small delay to ensure filesystem updates
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (command.includes('remove')) {
        // Verify worktree was actually removed
        const workspace = command.match(/"([^"]+)"/)?.[1];
        if (workspace && fs.existsSync(workspace)) {
          Logger.warn('EXEC_VERIFICATION', `Worktree directory still exists after removal: ${workspace}`);
        }
      }
    }
    
    // Ensure stdout and stderr are strings
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString()
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    Logger.error('EXEC', `Command failed after ${duration}ms: ${command}`, error);
    throw error;
  }
}

// Log rotation constants
const MAX_LOGS_PER_AGENT = 500; // Keep last 500 log entries per agent
const LOG_ROTATION_INTERVAL = 100; // Check for rotation every 100 new logs

// We'll load the SDK dynamically when needed
let claudeSDK: ClaudeSDK | null = null;

// Mutex for agent deployment to prevent race conditions
const deploymentMutex = new Map<string, Promise<void>>();

async function withMutex<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing operation on this key
  const existingLock = deploymentMutex.get(key);
  if (existingLock) {
    Logger.debug('MUTEX', `Waiting for existing operation on ${key}`);
    await existingLock;
  }
  
  // Create our own lock
  let releaseLock: () => void;
  const ourLock = new Promise<void>(resolve => {
    releaseLock = resolve;
  });
  
  deploymentMutex.set(key, ourLock);
  
  try {
    // Execute the function
    const result = await fn();
    return result;
  } finally {
    // Release the lock
    releaseLock!();
    deploymentMutex.delete(key);
  }
}

/**
 * Validate staged files before PR creation
 */
async function validateStagedFiles(worktreePath: string, issueNumber: number): Promise<void> {
  try {
    const { stdout } = await execPromise('git diff --cached --name-only', { cwd: worktreePath });
    const stagedFiles = stdout.trim().split('\n').filter(f => f);
    
    const unnecessaryFiles = stagedFiles.filter(file => {
      const basename = path.basename(file);
      return ['CLAUDE.md', '.claude.md', '.gitignore'].includes(basename);
    });
    
    if (unnecessaryFiles.length > 0) {
      Logger.warn('PR-VALIDATION', `Agent ${issueNumber} staged unnecessary files: ${unnecessaryFiles.join(', ')}`);
      
      // Unstage the unnecessary files
      for (const file of unnecessaryFiles) {
        try {
          await execPromise(`git reset HEAD "${file}"`, { cwd: worktreePath });
          Logger.debug('PR-VALIDATION', `Unstaged ${file} from agent ${issueNumber}'s commit`);
        } catch (e) {
          Logger.error('PR-VALIDATION', `Failed to unstage ${file}`, e);
        }
      }
    }
  } catch (error) {
    Logger.error('PR-VALIDATION', 'Failed to validate staged files', error);
  }
}

async function loadClaudeSDK(): Promise<ClaudeSDK> {
  if (!claudeSDK) {
    try {
      const module = await import('@anthropic-ai/claude-code');
      claudeSDK = module as ClaudeSDK;
      
      // If we're in a packaged app, ensure the SDK knows about it
      if (process.resourcesPath) {
        Logger.debug('SDK', `Running in packaged app, resources path: ${process.resourcesPath}`);
      }
    } catch (error) {
      Logger.error('SDK', 'Failed to load Claude SDK', error);
      throw new Error('Failed to load Claude SDK. Make sure @anthropic-ai/claude-code is installed.');
    }
  }
  return claudeSDK;
}

let mainWindow: BrowserWindow | null = null;
const agents = new Map<string, AgentInfo>(); // issueNumber -> agent info

function setWindow(window: BrowserWindow | null): void {
  mainWindow = window;
  
  // Clean up orphaned resources on startup
  if (window) {
    setTimeout(() => {
      cleanupOrphanedResources().catch(error => {
        Logger.error('STARTUP', 'Failed to cleanup orphaned resources', error);
      });
    }, 1000); // Delay to let app initialize
  }
}

/**
 * Clean up orphaned worktrees and branches from previous sessions
 */
async function cleanupOrphanedResources(): Promise<void> {
  Logger.info('STARTUP', 'Starting orphaned resource cleanup...');
  
  try {
    // Get list of all worktrees
    const { stdout: worktreeList } = await execPromise(`${gitExecutable || 'git'} worktree list --porcelain`);
    const worktrees = worktreeList.split('\n\n').filter(Boolean);
    
    let cleanedCount = 0;
    
    for (const worktreeInfo of worktrees) {
      const lines = worktreeInfo.split('\n');
      const worktreePath = lines[0]?.replace('worktree ', '');
      const branch = lines[2]?.replace('branch refs/heads/', '');
      
      // Check if this is an issue worktree
      if (worktreePath && branch && branch.startsWith('issue-')) {
        const issueNumberMatch = branch.match(/issue-(\d+)/);
        if (issueNumberMatch) {
          const issueNumber = parseInt(issueNumberMatch[1], 10);
          
          // Check if we have an active agent for this issue
          const agentKey = issueNumber.toString();
          if (!agents.has(agentKey)) {
            Logger.info('STARTUP', `Found orphaned worktree for issue ${issueNumber}, cleaning up...`);
            
            try {
              // Remove the worktree
              await GitMutex.withLock(process.cwd(), async () => {
                await execWithVerification(`git worktree remove "${worktreePath}" --force`);
              }, `worktree remove for orphaned ${branch}`);
              Logger.info('STARTUP', `Removed orphaned worktree: ${worktreePath}`);
              
              // Try to delete the branch
              try {
                await GitMutex.withLock(process.cwd(), async () => {
                  await execPromise(`git branch -D ${branch}`);
                }, `branch delete for orphaned ${branch}`);
                Logger.info('STARTUP', `Removed orphaned branch: ${branch}`);
              } catch (branchError) {
                // Branch might be pushed, that's ok
                Logger.debug('STARTUP', `Could not delete branch ${branch}: ${(branchError as Error).message}`);
              }
              
              cleanedCount++;
            } catch (error) {
              Logger.error('STARTUP', `Failed to cleanup worktree ${worktreePath}`, error);
            }
          }
        }
      }
    }
    
    // Also check for orphaned directories in the worktrees folder
    const projectPath = process.cwd();
    const worktreeBase = path.join(projectPath, 'worktrees');
    
    try {
      const entries = await fs.promises.readdir(worktreeBase, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('issue-')) {
          const issueNumberMatch = entry.name.match(/issue-(\d+)/);
          if (issueNumberMatch) {
            const issueNumber = parseInt(issueNumberMatch[1], 10);
            const agentKey = issueNumber.toString();
            
            if (!agents.has(agentKey)) {
              const orphanedPath = path.join(worktreeBase, entry.name);
              Logger.info('STARTUP', `Found orphaned directory: ${orphanedPath}`);
              
              try {
                await fs.promises.rm(orphanedPath, { recursive: true, force: true });
                Logger.info('STARTUP', `Removed orphaned directory: ${orphanedPath}`);
                cleanedCount++;
              } catch (error) {
                Logger.error('STARTUP', 'Failed to remove orphaned directory', error);
              }
            }
          }
        }
      }
    } catch (error) {
      // Worktrees directory might not exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        Logger.error('STARTUP', 'Error checking worktrees directory', error);
      }
    }
    
    // Prune worktree list
    try {
      await execWithVerification('git worktree prune');
      Logger.info('STARTUP', 'Pruned worktree list');
    } catch (error) {
      Logger.error('STARTUP', 'Failed to prune worktree list', error);
    }
    
    Logger.info('STARTUP', `Orphaned resource cleanup complete. Cleaned ${cleanedCount} resources.`);
    
    // Notify frontend
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('system-message', {
        type: 'info',
        message: `Cleaned up ${cleanedCount} orphaned worktrees from previous sessions`
      });
    }
  } catch (error) {
    Logger.error('STARTUP', 'Error during orphaned resource cleanup', error);
  }
}

// Import git executable reference
const gitExecutable = 'git'; // This will be updated by git-service
let ghExecutable: string | null = null; // Will be set on first use

// Helper function to copy hidden configuration files
async function copyConfigFiles(sourceDir: string, targetDir: string): Promise<void> {
  const configPatterns = [
    '.env',
    '.env.*',
    '.claude',
    '.cursor',
    '.vscode',
    '.idea'
  ];

  try {
    const files = await fs.promises.readdir(sourceDir);

    for (const file of files) {
      // Check if file matches any config pattern
      const shouldCopy = configPatterns.some(pattern => {
        if (pattern.includes('*')) {
          const prefix = pattern.replace('*', '');
          return file.startsWith(prefix);
        }
        return file === pattern;
      });

      if (shouldCopy) {
        const sourcePath = path.join(sourceDir, file);
        const targetPath = path.join(targetDir, file);

        try {
          const stats = await fs.promises.stat(sourcePath);

          if (stats.isDirectory()) {
            // Recursively copy directories
            await fs.promises.cp(sourcePath, targetPath, { recursive: true });
            Logger.debug('CLAUDE-SERVICE', `Copied directory: ${file}`);
          } else {
            // Copy individual files
            await fs.promises.copyFile(sourcePath, targetPath);
            Logger.debug('CLAUDE-SERVICE', `Copied file: ${file}`);
          }
        } catch (copyError) {
          Logger.warn('CLAUDE-SERVICE', `Failed to copy ${file}: ${(copyError as Error).message}`);
        }
      }
    }
  } catch (error) {
    Logger.warn('CLAUDE-SERVICE', `Error copying config files: ${(error as Error).message}`);
  }
}

// Helper to categorize issue types for optimized prompts
function categorizeIssue(title: string, body: string): { type: string; complexity: 'simple' | 'complex' } {
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();
  
  // Documentation tasks
  if (titleLower.includes('.md') || titleLower.includes('readme') || 
      titleLower.includes('documentation') || titleLower.includes('docs') ||
      (titleLower.includes('create') && titleLower.includes('file'))) {
    // Check if it's just creating a single file
    const fileMatches = body.match(/\.(md|txt|json|yml|yaml)/gi);
    const isSimpleCreate = bodyLower.includes('create') && fileMatches && fileMatches.length <= 2;
    return { type: 'documentation', complexity: isSimpleCreate ? 'simple' : 'complex' };
  }
  
  // Configuration tasks
  if (titleLower.includes('config') || titleLower.includes('.json') || 
      titleLower.includes('.yml') || titleLower.includes('.yaml')) {
    return { type: 'configuration', complexity: 'simple' };
  }
  
  // Bug fixes
  if (titleLower.includes('fix') || titleLower.includes('bug') || 
      titleLower.includes('error') || titleLower.includes('issue')) {
    return { type: 'bugfix', complexity: 'complex' };
  }
  
  // Feature implementation
  if (titleLower.includes('add') || titleLower.includes('implement') || 
      titleLower.includes('feature') || titleLower.includes('create')) {
    return { type: 'feature', complexity: 'complex' };
  }
  
  // Refactoring
  if (titleLower.includes('refactor') || titleLower.includes('improve') || 
      titleLower.includes('optimize')) {
    return { type: 'refactor', complexity: 'complex' };
  }
  
  return { type: 'general', complexity: 'complex' };
}

async function checkCLI(): Promise<boolean> {
  // SDK doesn't require Claude CLI to be installed
  // Always return true since SDK is embedded
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('claude-cli-status', { installed: true });
  }
  return true;
}

async function checkClaudeAvailable(): Promise<boolean> {
  try {
    await execPromise('claude --version');
    return true;
  } catch (error) {
    return false;
  }
}


async function parseIssuesFromText(text: string): Promise<ParsedIssue[]> {
  try {
    const { query } = await loadClaudeSDK();
    
    // CRITICAL FIX: Use the system claude executable for SDK operations
    let pathToClaudeCodeExecutable: string | undefined;
    try {
      const { execSync } = require('child_process');
      pathToClaudeCodeExecutable = execSync('which claude', { encoding: 'utf8' }).trim();
      Logger.debug('PARSER', `Using system claude executable: ${pathToClaudeCodeExecutable}`);
    } catch (e) {
      Logger.error('PARSER', 'Failed to find claude executable', e);
    }
    
    const prompt = `Parse the following text and extract GitHub issues from it.

The text may contain one or more issues in any format:
- Single line descriptions
- Bullet points or numbered lists
- Natural language paragraphs
- Mixed formats

For each issue you identify, create a structured GitHub issue with:
1. title: A clear, concise, actionable title (50-80 chars ideal)
2. body: A detailed description including:
   - What needs to be done
   - Any context or requirements mentioned
   - Acceptance criteria if applicable
3. labels: Relevant labels based on the content:
   - "bug" for fixes/errors
   - "enhancement" for new features
   - "documentation" for docs/readme updates
   - "performance" for optimization tasks
   - "refactor" for code cleanup
   - Add other relevant labels (frontend, backend, testing, etc.)

Text to parse:
${text}

You must respond with ONLY a JSON array, no other text. Example format:
[
  {
    "title": "Create README.md",
    "body": "Create a comprehensive README...",
    "labels": ["documentation"]
  }
]`;

    const abortController = new AbortController();
    const queryOptions: any = {
      maxTurns: 1,
      permissionMode: 'bypassPermissions',
      outputFormat: 'stream-json',  // Try stream-json format
      cwd: process.cwd(),
      // Specify Sonnet 4 for faster parsing
      model: 'claude-3-5-sonnet-20241022',
      // Use the system claude executable
      pathToClaudeCodeExecutable: pathToClaudeCodeExecutable || undefined
    };
    
    const queryIterator = query({
      prompt,
      abortController,
      options: queryOptions
    });

    Logger.debug('PARSER', 'Using Claude SDK to intelligently parse issues...');
    
    // Collect all messages and extract the final result
    let assistantResponse = '';
    let errorMessage = '';
    
    for await (const message of queryIterator) {
      Logger.debug('PARSER', `Received message type: ${message.type}`);
      
      // Handle different message types based on the SDK documentation
      if (message.type === 'assistant' && message.message?.content) {
        // Accumulate assistant responses
        const content = message.message.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('');
        Logger.debug('PARSER', `Assistant content: ${content.substring(0, 200)}...`);
        assistantResponse += content;
      } else if (message.type === 'result') {
        // Check if the operation succeeded
        if (message.subtype === 'error' || message.error) {
          errorMessage = message.error || 'Failed to parse issues';
          Logger.error('PARSER', `Claude returned error: ${errorMessage}`);
        }
        // The result field contains the final output for 'json' format
        if ((message as any).result) {
          Logger.debug('PARSER', `Result field: ${(message as any).result.substring(0, 200)}...`);
          assistantResponse = (message as any).result;
        }
      }
    }

    if (errorMessage) {
      Logger.error('PARSER', `Error from Claude: ${errorMessage}`);
      return [];
    }

    if (!assistantResponse) {
      Logger.error('PARSER', 'No response received from Claude SDK');
      return [];
    }

    // Parse the JSON result
    try {
      Logger.debug('PARSER', `Raw response to parse: ${assistantResponse}`);
      
      // Try multiple cleaning strategies
      let cleanedResponse = assistantResponse.trim();
      
      // Remove markdown code blocks (```json ... ```)
      cleanedResponse = cleanedResponse.replace(/^```(?:json)?\s*\n?/i, '');
      cleanedResponse = cleanedResponse.replace(/\n?```\s*$/i, '');
      
      // Remove any leading/trailing whitespace again
      cleanedResponse = cleanedResponse.trim();
      
      // If it starts with ``` without json, remove it
      if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.substring(3);
      }
      if (cleanedResponse.endsWith('```')) {
        cleanedResponse = cleanedResponse.substring(0, cleanedResponse.length - 3);
      }
      
      Logger.debug('PARSER', `Cleaned response: ${cleanedResponse}`);
      
      const parsed = JSON.parse(cleanedResponse);
      
      if (!Array.isArray(parsed)) {
        Logger.error('PARSER', `Expected array, got: ${typeof parsed}`);
        return [];
      }
      
      Logger.info('PARSER', `Successfully parsed ${parsed.length} issue(s)`);
      
      // Ensure each issue has required fields with proper formatting
      return parsed.map(issue => ({
        title: issue.title || 'Untitled Issue',
        body: issue.body || 'No description provided.',
        labels: Array.isArray(issue.labels) ? issue.labels : []
      }));
    } catch (parseError) {
      Logger.error('PARSER', 'Failed to parse JSON', parseError);
      Logger.error('PARSER', `Raw response: ${assistantResponse}`);
      
      // As a fallback, try to extract JSON array from the response
      const jsonMatch = assistantResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const fallbackParsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(fallbackParsed)) {
            Logger.info('PARSER', 'Fallback parsing succeeded');
            return fallbackParsed.map(issue => ({
              title: issue.title || 'Untitled Issue',
              body: issue.body || 'No description provided.',
              labels: Array.isArray(issue.labels) ? issue.labels : []
            }));
          }
        } catch (fallbackError) {
          Logger.error('PARSER', 'Fallback parsing also failed', fallbackError);
        }
      }
      
      return [];
    }
  } catch (error) {
    Logger.error('CLAUDE-SERVICE', 'Failed to parse issues from text', error);
    throw error;
  }
}

async function preDeploymentCleanup(issueNumber: number, worktreePath: string): Promise<void> {
  Logger.info('PRE-DEPLOY', `Starting pre-deployment cleanup for issue ${issueNumber}`);
  
  try {
    // Check if agent already exists and clean it up
    const existingAgent = agents.get(issueNumber.toString());
    if (existingAgent) {
      Logger.info('PRE-DEPLOY', `Found existing agent for issue ${issueNumber}, cleaning up...`);
      await cleanupWorktree(issueNumber);
    }
    
    // Ensure directory doesn't exist
    try {
      const stats = await fs.promises.stat(worktreePath);
      if (stats.isDirectory()) {
        Logger.info('PRE-DEPLOY', `Directory exists at ${worktreePath}, removing...`);
        await fs.promises.rm(worktreePath, { recursive: true, force: true });
      }
    } catch (err) {
      // Directory doesn't exist, which is what we want
      const error = err as NodeJS.ErrnoException;
      if (error.code !== 'ENOENT') {
        throw err;
      }
    }
    
    Logger.info('PRE-DEPLOY', `Pre-deployment cleanup completed for issue ${issueNumber}`);
  } catch (error) {
    Logger.error('PRE-DEPLOY', 'Error during cleanup', error);
    // Don't throw - we'll try to continue with deployment
  }
}

async function deployAgent(issueNumber: number, repo: string, additionalContext: string = ''): Promise<void> {
  const agentKey = issueNumber.toString();
  
  // Use mutex to prevent race conditions
  return withMutex(agentKey, async () => {
    Logger.info('DEPLOY', `Starting deployment for issue ${issueNumber} in repo ${repo}`);
    
    // Check if agent already exists and is running (inside mutex for safety)
    if (agents.has(agentKey)) {
      const existingAgent = agents.get(agentKey)!;
      if (existingAgent.status === 'working' || existingAgent.status === 'starting') {
        throw new Error(`Agent for issue #${issueNumber} is already running`);
      }
    }

  try {
    // Send initial status to frontend immediately
    if (mainWindow && !mainWindow.isDestroyed()) {
      Logger.debug('DEPLOY', 'Sending initial status to frontend');
      mainWindow.webContents.send('agent-status-update', {
        issueNumber,
        status: 'starting',
        details: 'Preparing workspace...'
      } as AgentStatusUpdate);
    }

    // Ensure we're working from a clean, synced state
    Logger.info('DEPLOY', 'Fetching latest from origin...');
    try {
      await execPromise('git fetch origin');
      
      // Check if local main is ahead of origin
      const { stdout: statusOutput } = await execPromise('git status -sb');
      if (statusOutput.includes('ahead of')) {
        Logger.warn('DEPLOY', 'WARNING: Local main is ahead of origin/main. Agent may include unintended commits.');
        
        // Optional: Ask user to push first
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('agent-status-update', {
            issueNumber,
            status: 'starting',
            details: 'Warning: Local changes detected. Consider pushing to GitHub first.'
          } as AgentStatusUpdate);
        }
      }
    } catch (error) {
      Logger.warn('DEPLOY', `Could not fetch from origin: ${error}`);
    }

    // Set up workspace path with validation
    const projectPath = process.cwd();
    
    // Create safe worktree path to prevent path traversal
    const worktreePath = createSafeWorktreePath(projectPath, issueNumber);
    const worktreeBase = path.dirname(worktreePath);
    
    // Additional validation
    try {
      sanitizePath(worktreePath, projectPath);
    } catch (error) {
      throw new Error(`Invalid worktree path: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Pre-deployment cleanup
    await preDeploymentCleanup(issueNumber, worktreePath);
    
    // Create worktrees directory if it doesn't exist
    await fs.promises.mkdir(worktreeBase, { recursive: true });
    Logger.debug('DEPLOY', `Worktree base directory ensured at: ${worktreeBase}`);

    // Update status
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-status-update', {
        issueNumber,
        status: 'starting',
        details: 'Creating workspace...'
      } as AgentStatusUpdate);
    }

    // Create git worktree with sanitized branch name
    const branchName = sanitizeBranchName(`issue-${issueNumber}`);
    try {
      // Remove existing worktree if it exists
      if (fs.existsSync(worktreePath)) {
        try {
          await GitMutex.withLock(projectPath, async () => {
            await execWithVerification(`git worktree remove "${worktreePath}" --force`);
          }, `worktree remove for pre-deploy issue ${issueNumber}`);
          Logger.info('PRE-DEPLOY', `Removed existing worktree at ${worktreePath}`);
        } catch (e) {
          Logger.debug('PRE-DEPLOY', `Could not remove worktree: ${(e as Error).message}`);
        }
      } else {
        Logger.debug('PRE-DEPLOY', `No existing worktree at ${worktreePath}`);
      }
      
      // Prune worktree list
      await execWithVerification('git worktree prune');
      
      // Check if branch already exists
      let branchExists = false;
      try {
        await execPromise(`git rev-parse --verify ${branchName}`);
        branchExists = true;
        Logger.info('DEPLOY', `Branch ${branchName} already exists, will use existing branch`);
      } catch (e) {
        // Branch doesn't exist, which is what we want
      }
      
      // Create new worktree
      Logger.info('DEPLOY', `Creating worktree at ${worktreePath} with branch ${branchName}`);
      
      try {
        // Wrap git worktree add in mutex to prevent concurrent modifications
        await GitMutex.withLock(projectPath, async () => {
          if (branchExists) {
            // Use existing branch
            await execPromise(`git worktree add "${worktreePath}" ${branchName}`);
          } else {
            // Create new branch from origin/main to avoid including local commits
            await execPromise(`git worktree add -b ${branchName} "${worktreePath}" origin/main`);
          }
        }, `worktree add for issue ${issueNumber}`);
        Logger.info('DEPLOY', 'Worktree created successfully');
      } catch (createError) {
        const errMsg = (createError as Error).message;
        
        // Handle specific error cases
        if (errMsg.includes('already exists')) {
          // Try to force-create if branch name conflict
          Logger.info('DEPLOY', 'Branch name conflict, attempting force create...');
          await GitMutex.withLock(projectPath, async () => {
            await execPromise(`git worktree add -B ${branchName} "${worktreePath}" origin/main`);
          }, `worktree force-add for issue ${issueNumber}`);
          Logger.info('DEPLOY', 'Worktree force-created successfully');
        } else {
          throw createError;
        }
      }
      
      // Verify worktree was created
      if (!fs.existsSync(worktreePath)) {
        throw new Error('Worktree directory was not created');
      }
    } catch (worktreeError) {
      const error = worktreeError as Error;
      Logger.error('DEPLOY', 'Failed to create worktree', error);
      throw new Error(`Failed to create worktree: ${error.message}`);
    }

    // Copy configuration files from main repository to worktree
    Logger.info('DEPLOY', 'Copying configuration files...');
    await copyConfigFiles(projectPath, worktreePath);

    // Update .gitignore in worktree to ensure SDK output is ignored
    const gitignorePath = path.join(worktreePath, '.gitignore');
    try {
      const gitignoreContent = await fs.promises.readFile(gitignorePath, 'utf-8').catch(() => '');
      const sdkIgnores = [
        '',
        '# Claude SDK output',
        '.claude-output-*.log',
        '.claude-sdk/',
        '# Sensitive files',
        '.env',
        '.env.*',
        '*.key',
        '*.pem'
      ];
      
      const needsUpdate = sdkIgnores.some(ignore => 
        ignore && !gitignoreContent.includes(ignore)
      );
      
      if (needsUpdate) {
        const updatedContent = gitignoreContent + '\n' + sdkIgnores.join('\n');
        await fs.promises.writeFile(gitignorePath, updatedContent);
        Logger.info('DEPLOY', 'Updated .gitignore with SDK output patterns');
      }
    } catch (error) {
      Logger.warn('DEPLOY', `Could not update .gitignore: ${error}`);
    }

    // Create .claude.md instructions file (hidden to prevent commits)
    Logger.info('DEPLOY', 'Creating .claude.md instructions...');
    const claudeMdPath = path.join(worktreePath, '.claude.md');
    const claudeInstructions = `# Instructions for Claude

## Working Directory
You are working in a git worktree at: ${worktreePath}

## Task
${additionalContext ? `### Previous Attempt Feedback
${additionalContext}

Please address the above feedback while fixing the issue.

` : ''}### Issue to Fix
You need to fix GitHub issue #${issueNumber}.

## Important Guidelines
1. Make all changes in this worktree directory
2. Use git commands as needed
3. Create atomic, well-described commits
4. Push your changes when ready
5. Create a pull request when complete

## Git Configuration
- You're on branch: ${branchName}
- Main branch: main or master
- Remote: origin

Good luck!
`;
    await fs.promises.writeFile(claudeMdPath, claudeInstructions);

    // Verify git status
    try {
      const { stdout: gitStatus } = await execPromise('git status', { cwd: worktreePath });
      Logger.debug('DEPLOY', 'Git status:', gitStatus);
    } catch (error) {
      Logger.error('DEPLOY', 'Failed to get git status', error);
    }

    // Fetch issue details
    Logger.info('DEPLOY', `Fetching issue details for #${issueNumber}`);
    let issueTitle: string, issueBody: string;
    try {
      // Ensure gh executable is found
      if (!ghExecutable) {
        ghExecutable = await findExecutable('gh');
        if (!ghExecutable) {
          throw new Error('GitHub CLI (gh) not found. Please install it first.');
        }
      }
      
      const issueDetails = await execPromise(`"${ghExecutable}" issue view ${issueNumber} --json title,body,number`, {
        cwd: worktreePath
      });
      const issue: IssueDetails = JSON.parse(issueDetails.stdout);
      issueTitle = issue.title;
      issueBody = issue.body;
      const { sanitizeLogEntry } = require('./utils/sanitizer');
      Logger.debug('DEPLOY', `Issue title: ${sanitizeLogEntry(issueTitle)}`);
      Logger.debug('DEPLOY', `Issue body: ${sanitizeLogEntry(issueBody)}`);
    } catch (error) {
      Logger.error('DEPLOY', 'Failed to fetch issue details', error);
      throw new Error(`Failed to fetch issue details: ${(error as Error).message}`);
    }

    // Categorize the issue for optimized handling
    const issueCategory = categorizeIssue(issueTitle, issueBody);
    Logger.info('DEPLOY', `Issue categorized as: ${issueCategory.type} (${issueCategory.complexity})`);
    
    // Build the prompt for Claude - use specialized prompts based on task type
    const branchSuffix = additionalContext ? '-v2' : '';
    let prompt: string;
    
    if (issueCategory.type === 'documentation' && issueCategory.complexity === 'simple' && !additionalContext) {
      // Ultra-streamlined prompt for simple documentation
      prompt = `I need you to create a documentation file for issue #${issueNumber}.

Task: ${issueTitle}
Details: ${issueBody}

Steps:
1. git checkout -b fix-issue-${issueNumber}
2. Create the requested file with appropriate, professional content
3. git add . -- ':!.claude.md' ':!CLAUDE.md' ':!.gitignore'
4. git commit -m "docs: ${issueTitle}"
5. git push -u origin fix-issue-${issueNumber}
6. gh pr create --title "Fix #${issueNumber}: ${issueTitle}" --body "Fixes #${issueNumber}"

Focus only on creating the requested file. Be professional and concise.`;
    } else if (issueCategory.type === 'configuration' && issueCategory.complexity === 'simple' && !additionalContext) {
      // Streamlined prompt for configuration files
      prompt = `Update configuration as requested in issue #${issueNumber}.

Issue: ${issueTitle}
Details: ${issueBody}

Execute:
1. git checkout -b fix-issue-${issueNumber}
2. Create/update the configuration file
3. git add . -- ':!.claude.md' ':!CLAUDE.md' ':!.gitignore' && git commit -m "config: ${issueTitle}"
4. git push -u origin fix-issue-${issueNumber}
5. gh pr create --title "Fix #${issueNumber}: ${issueTitle}" --body "Fixes #${issueNumber}"

Start now.`;
    } else if (issueCategory.type === 'documentation' && !additionalContext) {
      // Standard documentation prompt
      prompt = `Complete the documentation task in issue #${issueNumber}.

TASK: ${issueTitle}
DETAILS: ${issueBody}

Steps:
1. git checkout -b fix-issue-${issueNumber}
2. Create/update the requested documentation
3. git add . -- ':!.claude.md' ':!CLAUDE.md' ':!.gitignore'
4. git commit -m "docs: ${issueTitle}"
5. git push -u origin fix-issue-${issueNumber}
6. gh pr create --title "Fix #${issueNumber}: ${issueTitle}" --body "Fixes #${issueNumber}"

Focus only on what was explicitly requested. Start now.`;
    } else {
      // Use the standard prompt for complex tasks
      prompt = `Fix GitHub issue #${issueNumber}: ${issueTitle}

Issue: ${issueBody}

${additionalContext ? `IMPORTANT - PR Review Feedback:
${additionalContext}

Please address the feedback above while fixing the issue. The previous attempt had issues that need to be corrected.

` : ''}Steps:
1. git checkout -b fix-issue-${issueNumber}${branchSuffix}
2. Make changes to fix the issue${additionalContext ? ' AND address the PR feedback' : ''}
3. git add . -- ':!.claude.md' ':!CLAUDE.md' ':!.gitignore' && git commit -m "${issueCategory.type === 'bugfix' ? 'fix' : issueCategory.type === 'feature' ? 'feat' : 'chore'}: ${issueTitle}${additionalContext ? ' (addresses review feedback)' : ''}"
4. git push -u origin fix-issue-${issueNumber}${branchSuffix}
5. gh pr create --title "Fix #${issueNumber}: ${issueTitle}${additionalContext ? ' (v2)' : ''}" --body "Fixes #${issueNumber}${additionalContext ? '\n\nThis PR addresses the review feedback from the previous attempt.' : ''}"

Start now.`;
    }

    Logger.info('DEPLOY', `Starting Claude with prompt for issue ${issueNumber}`);

    // Send initial logs to frontend (sanitized)
    if (mainWindow && !mainWindow.isDestroyed()) {
      const { sanitizeLogEntry } = require('./utils/sanitizer');
      mainWindow.webContents.send('agent-output', {
        issueNumber,
        data: sanitizeLogEntry(`Working on issue #${issueNumber}: ${issueTitle}`)
      } as AgentOutput);
      mainWindow.webContents.send('agent-output', {
        issueNumber,
        data: sanitizeLogEntry(`Issue description: ${issueBody}`)
      } as AgentOutput);
    }

    // Send status update before spawning
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-status-update', {
        issueNumber,
        status: 'starting',
        details: 'Starting Claude to work on issue...'
      } as AgentStatusUpdate);
    }

    // Execute Claude using the SDK
    Logger.info('DEPLOY', `Starting Claude SDK for agent ${issueNumber}`);
    
    // Load the SDK dynamically
    const { query } = await loadClaudeSDK();
    
    // CRITICAL FIX: The SDK tries to execute cli.js from inside app.asar
    // We need to override the pathToClaudeCodeExecutable option
    // First, let's find the actual claude executable that works
    let pathToClaudeCodeExecutable: string | undefined;
    try {
      const { execSync } = require('child_process');
      // Use the same claude that our diagnostics showed works
      pathToClaudeCodeExecutable = execSync('which claude', { encoding: 'utf8' }).trim();
      Logger.debug('FIX', `Using system claude executable: ${pathToClaudeCodeExecutable}`);
    } catch (e) {
      Logger.error('FIX', 'Failed to find claude executable');
    }
    
    // Create an abort controller for cancellation
    const abortController = new AbortController();
    
    // Start the SDK query
    Logger.info('DEPLOY', `Starting SDK query with prompt for issue ${issueNumber}`);
    
    // Configure options - 100 turns for everything
    const queryOptions: any = {
      maxTurns: 100,  // Standard for all tasks
      permissionMode: 'bypassPermissions',
      outputFormat: 'stream-json',
      cwd: worktreePath,
      // CRITICAL: Use the system claude executable instead of the one in app.asar
      pathToClaudeCodeExecutable: pathToClaudeCodeExecutable || undefined,
      // Use the packaged node and let it find claude through PATH
      env: {
        // Include the full PATH that includes homebrew and other locations
        PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:' + (process.env.PATH || ''),
        HOME: process.env.HOME,
        USER: process.env.USER,
        // Claude might store config here
        XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '', '.config'),
        // Terminal settings
        TERM: 'xterm-256color'
      }
    };
    Logger.debug('DEPLOY', `Claude SDK queryOptions for agent ${issueNumber}:`, JSON.stringify(queryOptions, null, 2));
    
    // Add task-specific system prompts but keep full tool access
    switch (issueCategory.type) {
      case 'documentation':
        queryOptions.systemPrompt = `You are creating documentation. Focus on the requested files. Be direct and professional.`;
        break;
      
      case 'configuration':
        queryOptions.systemPrompt = `You are updating configuration files. Make the requested changes accurately.`;
        break;
      
      case 'bugfix':
        queryOptions.systemPrompt = `You are fixing a bug. Focus on resolving the specific issue. Test your fix if possible.`;
        break;
      
      case 'feature':
        queryOptions.systemPrompt = `You are implementing a new feature. Follow best practices and ensure it integrates well.`;
        break;
        
      default:
        // No specific system prompt for general tasks
        break;
    }
    
    const queryIterator = query({
      prompt,
      abortController,
      options: queryOptions
    });
    
    const agentInfo: AgentInfo = {
      issueNumber,
      repo,
      abortController,
      status: 'working',
      startTime: new Date(),
      logs: [],
      workspace: worktreePath,
      worktree: true,
      queryIterator
    };

    // Use string key for consistent tracking
    agents.set(agentKey, agentInfo);
    Logger.info('DEPLOY', `Agent registered with key: ${agentKey}, total agents: ${agents.size}`);
    
    // Send initial status
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-status-update', {
        issueNumber,
        status: 'working',
        details: 'Claude SDK is starting...'
      } as AgentStatusUpdate);
      mainWindow.webContents.send('agent-log-update', {
        issueNumber,
        message: {
          type: 'system',
          subtype: 'init',
          session_id: `issue-${issueNumber}`,
          model: 'claude-code',
          permissionMode: 'bypassPermissions',
          cwd: worktreePath,
          tools: [],
          mcp_servers: [],
          apiKeySource: 'SDK'
        }
      } as AgentLogUpdate);
    }
    
    // Process the SDK stream
    try {
      Logger.debug('DEPLOY', `Processing SDK stream for agent ${issueNumber}`);
      
      for await (const message of queryIterator) {
        // Extract meaningful content from the message
        let logContent = '';
        
        if (message.type === 'assistant' && message.message) {
          // Extract text content from assistant messages
          const textContent = message.message.content
            ?.filter((c: any) => c.type === 'text')
            ?.map((c: any) => c.text)
            ?.join('') || '';
          if (textContent) {
            logContent = textContent.substring(0, 200) + (textContent.length > 200 ? '...' : '');
            Logger.debug('AGENT', `Issue #${issueNumber} - Claude: ${logContent}`);
            
            // Also send as agent output for the UI
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('agent-output', {
                issueNumber,
                data: textContent
              } as AgentOutput);
            }
          }
        } else if (message.type === 'user' && message.message) {
          // Check if this is a tool result and extract tool info
          const messageStr = JSON.stringify(message);
          
          // Look for tool results in the message
          if (messageStr.includes('tool_result')) {
            // Try to extract meaningful tool result info
            const content: any = message.message.content?.[0];
            if (content && content.type === 'tool_result') {
              const toolContent = content.content || '';
              
              // Log specific tool results
              if (toolContent.includes('File created successfully')) {
                const fileMatch = toolContent.match(/at: (.+)$/);
                if (fileMatch) {
                  Logger.info('AGENT', `Issue #${issueNumber} - Created file: ${fileMatch[1]}`);
                }
              } else if (toolContent.includes('git') || toolContent.includes('branch')) {
                // Git command results
                const shortContent = toolContent.substring(0, 100).replace(/\n/g, ' ');
                Logger.debug('AGENT', `Issue #${issueNumber} - Git: ${shortContent}${toolContent.length > 100 ? '...' : ''}`);
              } else if (toolContent.includes('github.com/') && toolContent.includes('/pull/')) {
                // PR creation - validate files before it's too late
                Logger.info('AGENT', `Issue #${issueNumber} - Created PR: ${toolContent}`);
                
                // Validate that no unnecessary files were committed
                await validateStagedFiles(worktreePath, issueNumber);
              } else if (toolContent.length < 200) {
                // Short results - show in full
                Logger.debug('AGENT', `Issue #${issueNumber} - Tool result: ${toolContent.replace(/\n/g, ' ')}`);
              }
            }
          }
        } else if (message.type === 'tool_code') {
          // Log tool execution with details
          const toolInfo: any = message;
          if (toolInfo.tool_name) {
            let toolLog = `[Issue #${issueNumber}] Executing: ${toolInfo.tool_name}`;
            
            // Add specific details for common tools
            let toolDetail = '';
            if (toolInfo.tool_name === 'Bash' && toolInfo.input?.command) {
              toolDetail = toolInfo.input.command;
              toolLog += ` - ${toolDetail}`;
            } else if (toolInfo.tool_name === 'Write' && toolInfo.input?.file_path) {
              toolDetail = `Writing to ${toolInfo.input.file_path}`;
              toolLog += ` - ${toolInfo.input.file_path}`;
            } else if (toolInfo.tool_name === 'Read' && toolInfo.input?.file_path) {
              toolDetail = `Reading ${toolInfo.input.file_path}`;
              toolLog += ` - ${toolInfo.input.file_path}`;
            }
            
            Logger.debug('AGENT', toolLog);
            
            // Send tool execution to frontend
            if (mainWindow && !mainWindow.isDestroyed() && toolDetail) {
              mainWindow.webContents.send('agent-output', {
                issueNumber,
                data: `> ${toolInfo.tool_name}: ${toolDetail}`
              } as AgentOutput);
            }
          }
        } else if (message.type === 'result') {
          // Log completion
          Logger.info('AGENT', `Issue #${issueNumber} - Result: ${message.subtype} - ${message.error || 'Success'}`);
        } else {
          // Log other message types briefly
          Logger.debug('AGENT', `Issue #${issueNumber} - ${message.type}`);
        }
        
        // Add log with rotation
        agentInfo.logs.push({ type: 'sdk', data: message, timestamp: new Date() });
        
        // Rotate logs if needed to prevent memory exhaustion
        if (agentInfo.logs.length > MAX_LOGS_PER_AGENT && agentInfo.logs.length % LOG_ROTATION_INTERVAL === 0) {
          Logger.debug('LOG_ROTATION', `Agent ${issueNumber}: Rotating logs (current: ${agentInfo.logs.length}, keeping last: ${MAX_LOGS_PER_AGENT})`);
          agentInfo.logs = agentInfo.logs.slice(-MAX_LOGS_PER_AGENT);
        }
        
        // Send structured message to frontend (sanitized)
        if (mainWindow && !mainWindow.isDestroyed()) {
          const { sanitizeLogEntry } = require('./utils/sanitizer');
          mainWindow.webContents.send('agent-log-update', {
            issueNumber,
            message: sanitizeLogEntry(message)
          } as AgentLogUpdate);
          
          // Update agent status based on message type
          if (message.type === 'assistant' && agentInfo.status === 'working') {
            // First assistant message means we're past initialization
            mainWindow.webContents.send('agent-status-update', {
              issueNumber,
              status: 'working',
              details: 'Agent is working on the issue...'
            } as AgentStatusUpdate);
          } else if (message.type === 'tool_code') {
            // Extract tool name for status
            const toolName = message.tool_name || 'tool';
            mainWindow.webContents.send('agent-status-update', {
              issueNumber,
              status: 'working',
              details: `Running ${toolName}...`
            } as AgentStatusUpdate);
          }
        }
        
        // Handle result message
        if (message.type === 'result') {
          Logger.info('DEPLOY', `Claude finished with result for issue ${issueNumber}: ${message.subtype}`);
          agentInfo.status = message.subtype === 'success' ? 'completed' : 'failed';
          agentInfo.endTime = new Date();
          
          if (message.subtype !== 'success') {
            agentInfo.error = `Task failed: ${message.error || 'Unknown error'}`;
          }
        }
      }
      
      Logger.info('DEPLOY', `SDK stream completed for agent ${issueNumber}`);
      
      // Ensure agent is marked as completed
      if (agentInfo.status === 'working') {
        agentInfo.status = 'completed';
        agentInfo.endTime = new Date();
      }
      
      // Send final status
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent-status-update', {
          issueNumber,
          status: agentInfo.status,
          details: agentInfo.status === 'completed' ? 'Agent completed successfully' : `Agent failed: ${agentInfo.error}`
        } as AgentStatusUpdate);
      }
      
      // Auto-cleanup successful agents after a delay
      if (agentInfo.status === 'completed') {
        Logger.info('DEPLOY', `Agent ${issueNumber} completed successfully, scheduling cleanup in 5 seconds`);
        setTimeout(async () => {
          try {
            Logger.info('AUTO_CLEANUP', `Cleaning up completed agent ${issueNumber}`);
            await cleanupWorktree(issueNumber);
          } catch (cleanupError) {
            Logger.error('AUTO_CLEANUP', `Failed to cleanup agent ${issueNumber}`, cleanupError);
          }
        }, 5000); // 5 second delay to allow UI to update
      }
      
    } catch (error) {
      const err = error as any;
      Logger.error('DEPLOY', `FATAL: Claude process exited unexpectedly for agent ${issueNumber}`);
      Logger.error('DEPLOY', `Exit Code: ${err.code}`);
      Logger.error('DEPLOY', `Stderr: ${err.stderr}`);
      Logger.error('DEPLOY', `Stdout: ${err.stdout}`);
      Logger.error('DEPLOY', 'Full Error', err);

      agentInfo.status = 'failed';
      agentInfo.endTime = new Date();
      agentInfo.error = `Claude process exited with code ${err.code}. Stderr: ${err.stderr}`;
      
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent-status-update', {
          issueNumber,
          status: 'failed',
          details: `Agent error: Claude process exited. See logs for details.`
        } as AgentStatusUpdate);
      }
      
      throw err;
    }
    
  } catch (error) {
    Logger.error('DEPLOY', `Failed to deploy agent for issue ${issueNumber}`, error);
    
    // Clean up on error
    const agentKey = issueNumber.toString();
    const agent = agents.get(agentKey);
    if (agent) {
      agent.status = 'failed';
      agent.endTime = new Date();
      agent.error = (error as Error).message;
    }
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-status-update', {
        issueNumber,
        status: 'failed',
        details: `Deployment failed: ${(error as Error).message}`
      } as AgentStatusUpdate);
    }
    
    throw error;
  }
  }); // End of withMutex
}

function getAgentStatus(issueNumber: number): AgentStatusResult | null {
  const agentKey = issueNumber.toString();
  const agent = agents.get(agentKey);
  if (!agent) return null;

  return {
    issueNumber: agent.issueNumber,
    status: agent.status,
    startTime: agent.startTime,
    endTime: agent.endTime,
    error: agent.error
  };
}

function getAllAgents(): AgentSummary[] {
  Logger.debug('GET_ALL_AGENTS', `Returning ${agents.size} agents`);
  const allAgents = Array.from(agents.values()).map(agent => ({
    issueNumber: agent.issueNumber,
    repo: agent.repo,
    status: agent.status,
    startTime: agent.startTime,
    endTime: agent.endTime,
    markedForCleanup: agent.markedForCleanup || false
  }));
  Logger.debug('GET_ALL_AGENTS', `Agent statuses: ${allAgents.map(a => `#${a.issueNumber}: ${a.status}`).join(', ')}`);
  return allAgents;
}

function getAgentLogs(issueNumber: number, limit?: number): AgentLog[] {
  const agentKey = issueNumber.toString();
  const agent = agents.get(agentKey);
  if (!agent) return [];
  
  const { sanitizeLogEntry } = require('./utils/sanitizer');
  
  // Return limited logs if requested
  let logs = agent.logs;
  if (limit && limit > 0 && logs.length > limit) {
    logs = logs.slice(-limit);
  }
  
  // Sanitize logs before returning
  return logs.map(log => ({
    ...log,
    data: sanitizeLogEntry(log.data)
  }));
}

async function cleanupWorktree(issueNumber: number): Promise<void> {
  const agentKey = issueNumber.toString();
  const agent = agents.get(agentKey);
  if (!agent || !agent.worktree) return;

  Logger.info('CLEANUP', `Starting cleanup for issue ${issueNumber}`);
  const workspace = agent.workspace;
  
  // Use sanitized branch name for cleanup
  const branchName = sanitizeBranchName(`issue-${issueNumber}`);
  
  let cleanupSuccess = true;
  const errors: string[] = [];

  try {
    // Step 1: Try to remove worktree from git (with retry)
    let worktreeRemoved = false;
    
    // Check if worktree exists before trying to remove
    if (!fs.existsSync(workspace)) {
      Logger.debug('CLEANUP', 'Worktree directory does not exist, skipping git removal');
      worktreeRemoved = true;
    } else {
      for (let attempt = 1; attempt <= 3 && !worktreeRemoved; attempt++) {
        try {
          await GitMutex.withLock(process.cwd(), async () => {
            await execWithVerification(`git worktree remove "${workspace}" --force`);
          }, `worktree remove for cleanup issue ${issueNumber}`);
          Logger.info('CLEANUP', 'Worktree removed from git');
          worktreeRemoved = true;
        } catch (error) {
          const errMsg = (error as Error).message;
          if (attempt === 3) {
            Logger.warn('CLEANUP', `Failed to remove worktree from git after 3 attempts: ${errMsg}`);
            errors.push(`Git worktree removal failed: ${errMsg}`);
          
          // If it's because the worktree is already gone, that's fine
          if (errMsg.includes('not a working tree') || errMsg.includes('No such file')) {
            Logger.debug('CLEANUP', 'Worktree already removed, continuing...');
          } else {
            cleanupSuccess = false;
          }
        } else {
          Logger.debug('CLEANUP', `Attempt ${attempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
        }
      }
    }
    }

    // Step 2: Ensure the directory is deleted (with verification)
    if (fs.existsSync(workspace)) {
      try {
        await fs.promises.rm(workspace, { recursive: true, force: true });
        Logger.info('CLEANUP', 'Workspace directory deleted');
        
        // Verify deletion
        await new Promise(resolve => setTimeout(resolve, 200)); // Small delay
        if (fs.existsSync(workspace)) {
          Logger.warn('CLEANUP', 'Directory still exists after deletion attempt');
          errors.push('Directory deletion incomplete');
          cleanupSuccess = false;
        }
      } catch (error) {
        const errMsg = (error as Error).message;
        Logger.warn('CLEANUP', `Failed to delete workspace directory: ${errMsg}`);
        errors.push(`Directory deletion failed: ${errMsg}`);
        cleanupSuccess = false;
      }
    } else {
      Logger.debug('CLEANUP', 'Workspace directory already gone');
    }

    // Step 3: Prune worktree list
    try {
      await execWithVerification('git worktree prune');
      Logger.info('CLEANUP', 'Worktree pruned');
    } catch (error) {
      Logger.debug('CLEANUP', `Failed to prune worktree: ${(error as Error).message}`);
      // This is not critical, so we don't mark as failed
    }

    // Step 4: Try to delete the branch (might fail if it's been pushed)
    try {
      await GitMutex.withLock(process.cwd(), async () => {
        await execPromise(`git branch -D ${branchName}`);
      }, `branch delete for cleanup issue ${issueNumber}`);
      Logger.info('CLEANUP', 'Local branch deleted');
    } catch (error) {
      const errMsg = (error as Error).message;
      if (errMsg.includes('not found')) {
        Logger.debug('CLEANUP', 'Branch already deleted');
      } else {
        Logger.debug('CLEANUP', `Failed to delete local branch: ${errMsg}`);
        // This is often expected if branch was pushed, so we don't mark as failed
      }
    }

    if (cleanupSuccess) {
      Logger.info('CLEANUP', `Cleanup completed successfully for issue ${issueNumber}`);
    } else {
      Logger.warn('CLEANUP', `Cleanup completed with errors for issue ${issueNumber}: ${errors.join(', ')}`);
    }
  } catch (error) {
    Logger.error('CLEANUP', 'Unexpected error during cleanup', error);
    errors.push(`Unexpected error: ${(error as Error).message}`);
    // Don't throw - cleanup errors shouldn't break the flow
  }

  // Remove agent from tracking regardless of cleanup success
  agents.delete(agentKey);
  Logger.debug('CLEANUP', `Agent removed from tracking, remaining agents: ${agents.size}`);
  
  // Log final status
  if (!cleanupSuccess && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-status-update', {
      issueNumber,
      status: 'stopped',
      details: `Cleanup completed with warnings: ${errors.join(', ')}`
    } as AgentStatusUpdate);
  }
}

async function stopAgent(issueNumber: number): Promise<void> {
  // Always use string key
  const agentKey = issueNumber.toString();
  
  // Use mutex to prevent race conditions during stop
  return withMutex(agentKey, async () => {
    const agent = agents.get(agentKey);

    if (!agent) {
      Logger.error('CLAUDE_SERVICE', `No agent found for issue ${issueNumber}. Available agents: ${Array.from(agents.keys()).join(', ')}`);
      throw new Error(`No agent found for issue ${issueNumber}`);
    }

    Logger.info('CLAUDE_SERVICE', `Stopping agent for issue ${issueNumber}`);

  // Abort the SDK query if it's still running
  if (agent.abortController && !agent.abortController.signal.aborted) {
    agent.abortController.abort();
    Logger.info('CLAUDE_SERVICE', `Aborted SDK query for issue ${issueNumber}`);
    
    // Wait a bit for the abort to take effect
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify the SDK process has stopped by checking if the iterator is still active
    if (agent.queryIterator) {
      try {
        // Try to consume one more message with a short timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Process still running')), 500)
        );
        
        // Convert AsyncIterable to AsyncIterator
        const iterator = agent.queryIterator[Symbol.asyncIterator]();
        const result = await Promise.race([
          iterator.next(),
          timeoutPromise
        ]) as IteratorResult<any> | undefined;
        
        if (!result || !result.done) {
          Logger.warn('PROCESS_VERIFICATION', `SDK process for issue ${issueNumber} may still be running after abort`);
        } else {
          Logger.debug('PROCESS_VERIFICATION', `SDK process for issue ${issueNumber} confirmed stopped`);
        }
      } catch (error) {
        // Timeout or error means process likely stopped
        Logger.debug('PROCESS_VERIFICATION', `SDK process for issue ${issueNumber} appears to have stopped`);
      }
    }
  }

  // Update agent status
  agent.status = 'stopped';
  agent.endTime = new Date();

  // Clean up the worktree
  await cleanupWorktree(issueNumber);

  // Send status update
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-status-update', {
      issueNumber,
      status: 'stopped',
      details: 'Agent stopped by user'
    } as AgentStatusUpdate);
  }
  }); // End of withMutex
}

function run(command: string): void {
  exec(command, (error, stdout, stderr) => {
    if (error) {
      Logger.error('TEST', error.message);
      return;
    }
    if (stderr) {
      Logger.error('TEST', `Stderr: ${stderr}`);
      return;
    }
    Logger.debug('TEST', `Output: ${stdout}`);
  });
}

async function forceCleanupIssue(issueNumber: number): Promise<void> {
  Logger.info('FORCE_CLEANUP', `Starting force cleanup for issue ${issueNumber}`);
  
  const projectPath = process.cwd();
  const worktreeBase = path.join(projectPath, '.claude-worktrees');
  const worktreePath = path.join(worktreeBase, `issue-${issueNumber}`);
  const branchName = `issue-${issueNumber}`;

  // Step 1: Stop agent if running
  const agentKey = issueNumber.toString();
  const agent = agents.get(agentKey);
  if (agent) {
    if (agent.abortController && !agent.abortController.signal.aborted) {
      agent.abortController.abort();
    }
    agents.delete(agentKey);
    Logger.info('FORCE_CLEANUP', 'Agent stopped and removed');
  }

  // Step 2: Force remove worktree
  if (fs.existsSync(worktreePath)) {
    try {
      await GitMutex.withLock(projectPath, async () => {
        await execPromise(`git worktree remove "${worktreePath}" --force`);
      }, `worktree remove for force-cleanup issue ${issueNumber}`);
      Logger.info('FORCE_CLEANUP', 'Worktree removed');
    } catch (error) {
      Logger.debug('FORCE_CLEANUP', `Failed to remove worktree: ${(error as Error).message}`);
    }
  } else {
    Logger.debug('FORCE_CLEANUP', 'Worktree directory does not exist');
  }

  // Step 3: Delete directory
  try {
    await fs.promises.rm(worktreePath, { recursive: true, force: true });
    Logger.info('FORCE_CLEANUP', 'Directory deleted');
  } catch (error) {
    Logger.debug('FORCE_CLEANUP', `Failed to delete directory: ${(error as Error).message}`);
  }

  // Step 4: Prune worktrees
  try {
    await execPromise('git worktree prune');
    Logger.info('FORCE_CLEANUP', 'Worktrees pruned');
  } catch (error) {
    Logger.debug('FORCE_CLEANUP', `Failed to prune worktrees: ${(error as Error).message}`);
  }

  // Step 5: Delete branch
  try {
    await GitMutex.withLock(projectPath, async () => {
      await execPromise(`git branch -D ${branchName}`);
    }, `branch delete for force-cleanup issue ${issueNumber}`);
    Logger.info('FORCE_CLEANUP', 'Branch deleted');
  } catch (error) {
    Logger.debug('FORCE_CLEANUP', `Failed to delete branch: ${(error as Error).message}`);
  }

  Logger.info('FORCE_CLEANUP', 'Force cleanup completed');
}

async function cleanupAllAgents(): Promise<void> {
  Logger.info('CLEANUP_ALL', 'Starting cleanup of all agents');
  const agentNumbers = Array.from(agents.keys());
  
  for (const agentKey of agentNumbers) {
    try {
      const issueNumber = parseInt(agentKey);
      await forceCleanupIssue(issueNumber);
    } catch (error) {
      Logger.error('CLEANUP_ALL', `Failed to cleanup agent ${agentKey}`, error);
    }
  }
  
  Logger.info('CLEANUP_ALL', 'All agents cleaned up');
}

async function deployAgentWithContext(issueNumber: number, repo: string, context: string): Promise<void> {
  // This is just a wrapper that ensures context is provided
  return deployAgent(issueNumber, repo, context);
}

// Read agent logs directly from memory
async function readAgentLogFile(issueNumber: number): Promise<LogFileResult> {
  const agent = agents.get(issueNumber.toString());
  
  if (!agent) {
    return { success: false, error: 'Agent not found' };
  }
  
  // Return the SDK logs stored in memory
  const content = agent.logs
    .map(log => {
      if (log.type === 'sdk' && log.data) {
        return JSON.stringify(log.data, null, 2);
      }
      return log.data;
    })
    .join('\n');
  
  return { success: true, content };
}

const claudeService: ClaudeService = {
  setWindow,
  checkCLI,
  checkClaudeAvailable,
  deployAgent,
  deployAgentWithContext,
  getAgentStatus,
  getAllAgents,
  stopAgent,
  run,
  getAgentLogs,
  cleanupWorktree,
  forceCleanupIssue,
  cleanupAllAgents,
  readAgentLogFile,
  parseIssuesFromText
};

export = claudeService;