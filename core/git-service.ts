import { exec, execFile } from 'child_process';
import * as util from 'util';
import * as fs from 'fs';
import { BrowserWindow } from 'electron';
import type { 
  GitService, 
  Repository, 
  Issue, 
  PullRequest, 
  GitStatus, 
  CLICheckResult 
} from './git-service-types';
import { withGitHubRetry } from './utils/retryUtils';
import { sanitizeLogEntry } from './utils/sanitizer';
import { Logger } from './utils/logger';

const execPromise = util.promisify(exec);

// Common paths for macOS tools
const COMMON_PATHS = [
  '/usr/bin',
  '/usr/local/bin',
  '/opt/homebrew/bin',  // Homebrew on Apple Silicon
  '/usr/local/opt/homebrew/bin',  // Alternative Homebrew location
  '/opt/local/bin',  // MacPorts
  process.env.HOME + '/.local/bin'  // User local bin
];

let mainWindow: BrowserWindow | null = null;
let checkInterval: NodeJS.Timeout | null = null;
let ghExecutable = 'gh'; // Will be updated by checkCLI
let gitExecutable = 'git'; // Will be updated by checkCLI

// Cache for existing labels per repository
const labelCache = new Map<string, Set<string>>();

function setWindow(window: BrowserWindow | null): void {
  mainWindow = window;
  // Start automatic checking when window is set
  startAutomaticChecking();
}

function startAutomaticChecking(): void {
  // Check immediately
  checkCLI();

  // Then check every 5 seconds until both are found
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  // Don't set up automatic interval - only check when explicitly requested
  // The UI will have a refresh button for manual checks
}

// Helper to find executable in common paths
function findExecutable(name: string): string | null {
  Logger.debug('GIT-SERVICE', `Finding executable: ${name}`);

  // First try which with shell environment
  try {
    const result = require('child_process').execSync(`which ${name}`, {
      encoding: 'utf8',
      shell: '/bin/zsh',  // Use zsh which is default on macOS
      env: { ...process.env, PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin' }
    }).trim();
    if (result) {
      Logger.info('GIT-SERVICE', `Found ${name} via which: ${result}`);
      return result;
    }
  } catch (e) {
    Logger.debug('GIT-SERVICE', `which ${name} failed: ${(e as Error).message}`);
  }

  // Check common paths
  for (const dir of COMMON_PATHS) {
    const fullPath = `${dir}/${name}`;
    try {
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          Logger.info('GIT-SERVICE', `Found ${name} at: ${fullPath}`);
          return fullPath;
        }
      }
    } catch (e) {
      // Continue checking
    }
  }

  Logger.warn('GIT-SERVICE', `${name} not found in any location`);
  return null;
}

async function checkCLI(): Promise<CLICheckResult> {
  const status: CLICheckResult & { claude?: boolean; ghUser?: string | null } = {
    git: false,
    gh: false,
    ghAuth: false  // Explicitly set to false
  };

  // Check for git
  const gitPath = findExecutable('git');
  status.git = !!gitPath;
  if (gitPath) gitExecutable = gitPath;
  Logger.debug('GIT-SERVICE', `Git check: ${status.git}`, gitPath);

  // Check for gh
  const ghPath = findExecutable('gh');
  status.gh = !!ghPath;
  if (ghPath) ghExecutable = ghPath;
  Logger.debug('GIT-SERVICE', `GH check: ${status.gh}`, ghPath);

  if (status.gh) {
    // Check gh authentication
    try {
      const { stdout: authStatus, stderr } = await execPromise(`${ghPath} auth status`);
      status.ghAuth = true;
      Logger.debug('GIT-SERVICE', 'GH auth status:', authStatus);
      Logger.debug('GIT-SERVICE', 'GH auth stderr:', stderr);
      
      // Extract username from auth status (check both stdout and stderr as gh might output to stderr)
      const fullOutput = authStatus + stderr;
      const userMatch = fullOutput.match(/Logged in to github\.com as ([^\s]+)/);
      if (userMatch) {
        status.ghUser = userMatch[1];
      }
    } catch (authError: any) {
      Logger.debug('GIT-SERVICE', `GH auth check error: ${authError.message}`);
      
      // gh auth status returns non-zero exit code even when authenticated
      // Check if the error output contains authentication info
      if (authError.stderr || authError.stdout) {
        const errorOutput = (authError.stderr || '') + (authError.stdout || '');
        Logger.debug('GIT-SERVICE', 'GH auth error output:', errorOutput);
        
        if (errorOutput.includes('Logged in to github.com')) {
          status.ghAuth = true;
          const userMatch = errorOutput.match(/Logged in to github\.com as ([^\s]+)/);
          if (userMatch) {
            status.ghUser = userMatch[1];
          }
        }
      }
    }
  }

  // Check for claude
  const claudePath = findExecutable('claude');
  status.claude = !!claudePath;
  Logger.debug('GIT-SERVICE', `Claude check: ${status.claude}`, claudePath);

  // Let's be more verbose about what we're finding
  if (!claudePath) {
    Logger.debug('GIT-SERVICE', 'Claude not found in PATH or common locations');
    Logger.debug('GIT-SERVICE', 'Checked paths:', COMMON_PATHS);
  }

  // Send status to renderer with mapping for frontend compatibility
  if (mainWindow && !mainWindow.isDestroyed()) {
    const frontendStatus = {
      git: !!status.git,
      gh: !!status.gh,
      ghAuthenticated: !!status.ghAuth,  // Ensure boolean value
      ghUser: status.ghUser || null,
      claude: !!status.claude
    };
    Logger.debug('CLI-STATUS', 'Backend status:', status);
    Logger.debug('CLI-STATUS', 'Sending to frontend:', frontendStatus);
    mainWindow.webContents.send('cli-status', frontendStatus);
  } else {
    Logger.debug('CLI-STATUS', 'No window to send status to');
  }

  return status;
}

async function listRepositories(): Promise<Repository[]> {
  return withGitHubRetry(async () => {
    const { stdout } = await execPromise(`${ghExecutable} repo list --json name,nameWithOwner,description,isPrivate,updatedAt --limit 100`);
    const repos = JSON.parse(stdout) as Repository[];

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('repositories-loaded', repos);
    }

    return repos;
  }, 'List repositories', (message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('github-retry', {
        operation: 'listRepositories',
        message
      });
    }
  }).catch(error => {
    Logger.error('GIT-SERVICE', 'Failed to list repositories', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('github-error', {
        operation: 'listRepositories',
        error: (error as Error).message
      });
    }
    throw error;
  });
}

async function listIssues(repo: string): Promise<Issue[]> {
  return withGitHubRetry(async () => {
    const { stdout } = await execPromise(
      `${ghExecutable} issue list --repo ${repo} --json number,title,body,labels,assignees,state,createdAt,updatedAt --limit 100`
    );
    const issues = JSON.parse(stdout) as Issue[];

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('issues-loaded', { repo, issues });
    }

    return issues;
  }, `List issues for ${repo}`, (message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('github-retry', {
        operation: 'listIssues',
        repo,
        message
      });
    }
  }).catch(error => {
    Logger.error('GIT-SERVICE', `Failed to list issues for ${repo}`, error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('github-error', {
        operation: 'listIssues',
        repo,
        error: (error as Error).message
      });
    }
    throw error;
  });
}

async function createIssue(repo: string, title: string, body: string): Promise<Issue> {
  try {
    // Validate and sanitize inputs
    const { sanitizeRepoName, sanitizeIssueTitle, sanitizeIssueBody, sanitizeLogEntry } = require('./utils/sanitizer');
    const safeRepo = sanitizeRepoName(repo);
    const safeTitle = sanitizeIssueTitle(title);
    const safeBody = sanitizeIssueBody(body);
    Logger.debug('GIT-SERVICE', 'Creating issue with gh CLI:', { 
      repo: safeRepo, 
      title: sanitizeLogEntry(safeTitle), 
      body: sanitizeLogEntry(safeBody) 
    });

    // Use execFile with array of arguments to prevent command injection
    const execFilePromise = util.promisify(execFile);

    // gh issue create outputs the URL of the created issue
    const { stdout, stderr } = await execFilePromise(ghExecutable, [
      'issue', 'create',
      '--repo', safeRepo,
      '--title', safeTitle,
      '--body', safeBody
    ]);

    Logger.debug('GIT-SERVICE', 'gh issue create output:', { stdout, stderr });

    // Parse the issue number from the URL
    // Output format: https://github.com/owner/repo/issues/123
    const match = stdout.match(/\/issues\/(\d+)/);
    const issueNumber = match ? parseInt(match[1]) : 0;

    const issue: Issue = {
      number: issueNumber,
      title: title,
      body: body,
      state: 'OPEN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      url: stdout.trim()
    };

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('issue-created', { repo, issue });
    }

    return issue;
  } catch (error) {
    Logger.error('GIT-SERVICE', `Failed to create issue in ${repo}`, error);
    Logger.error('GIT-SERVICE', 'Command output', {
      stdout: sanitizeLogEntry((error as any).stdout || ''), 
      stderr: sanitizeLogEntry((error as any).stderr || '')
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('github-error', {
        operation: 'createIssue',
        repo,
        error: (error as Error).message
      });
    }
    throw error;
  }
}

async function updateIssue(repo: string, issueNumber: number, title: string, body: string): Promise<Issue> {
  try {
    // Validate and sanitize inputs
    const { sanitizeRepoName, sanitizeIssueTitle, sanitizeIssueBody, sanitizeIssueNumber } = require('./utils/sanitizer');
    const safeRepo = sanitizeRepoName(repo);
    const safeIssueNumber = sanitizeIssueNumber(issueNumber);
    const safeTitle = sanitizeIssueTitle(title);
    const safeBody = sanitizeIssueBody(body);
    
    Logger.debug('GIT-SERVICE', 'Updating issue with gh CLI:', { 
      repo: safeRepo, 
      issueNumber: safeIssueNumber, 
      title: sanitizeLogEntry(safeTitle), 
      body: sanitizeLogEntry(safeBody) 
    });

    // Use execFile with array of arguments to prevent command injection
    const execFilePromise = util.promisify(execFile);

    // Update title and body using gh CLI
    const { stdout, stderr } = await execFilePromise(ghExecutable, [
      'issue', 'edit', String(safeIssueNumber),
      '--repo', safeRepo,
      '--title', safeTitle,
      '--body', safeBody
    ]);

    Logger.debug('GIT-SERVICE', 'gh issue edit output:', { stdout, stderr });

    const issue: Issue = {
      number: issueNumber,
      title: title,
      body: body,
      state: 'OPEN', // Assume it's still open
      createdAt: '', // We don't have this info
      updatedAt: new Date().toISOString()
    };

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('issue-updated', { repo, issue });
    }

    return issue;
  } catch (error) {
    Logger.error('GIT-SERVICE', `Failed to update issue #${issueNumber} in ${repo}`, error);
    Logger.error('GIT-SERVICE', 'Command output', {
      stdout: sanitizeLogEntry((error as any).stdout || ''), 
      stderr: sanitizeLogEntry((error as any).stderr || '')
    });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('github-error', {
        operation: 'updateIssue',
        repo,
        issueNumber,
        error: (error as Error).message
      });
    }
    throw error;
  }
}

async function getStatus(): Promise<GitStatus> {
  try {
    const { stdout: statusOutput } = await execPromise(`${gitExecutable} status --porcelain`);
    const { stdout: branchOutput } = await execPromise(`${gitExecutable} branch --show-current`);
    
    // Parse status output
    const changes: string[] = [];
    const untracked: string[] = [];
    
    if (statusOutput) {
      const lines = statusOutput.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('??')) {
          untracked.push(line.substring(3));
        } else if (line.trim()) {
          changes.push(line);
        }
      }
    }

    // Get ahead/behind info
    let ahead = 0;
    let behind = 0;
    try {
      const { stdout: aheadBehind } = await execPromise(`${gitExecutable} rev-list --left-right --count HEAD...@{u}`);
      const [a, b] = aheadBehind.trim().split('\t').map(n => parseInt(n) || 0);
      ahead = a;
      behind = b;
    } catch (e) {
      // No upstream branch
    }

    return {
      branch: branchOutput.trim(),
      ahead,
      behind,
      changes,
      untracked
    };
  } catch (error) {
    throw error;
  }
}

async function createBranch(branchName: string): Promise<void> {
  try {
    // Sanitize branch name to prevent command injection
    const { sanitizeBranchName } = require('./utils/sanitizer');
    const safeBranchName = sanitizeBranchName(branchName);
    
    const execFilePromise = util.promisify(execFile);
    await execFilePromise(gitExecutable, ['checkout', '-b', safeBranchName]);
  } catch (error) {
    throw error;
  }
}

async function createPullRequest(title: string, body: string): Promise<PullRequest> {
  try {
    const execFilePromise = util.promisify(execFile);
    
    const { stdout } = await execFilePromise(ghExecutable, [
      'pr', 'create',
      '--title', title,
      '--body', body
    ]);
    
    // Parse PR number from URL
    const match = stdout.match(/\/pull\/(\d+)/);
    const prNumber = match ? parseInt(match[1]) : 0;

    return {
      number: prNumber,
      title,
      body,
      state: 'OPEN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      url: stdout.trim()
    };
  } catch (error) {
    throw error;
  }
}

async function listPullRequests(repo: string): Promise<PullRequest[]> {
  return withGitHubRetry(async () => {
    const { stdout } = await execPromise(
      `${ghExecutable} pr list --repo ${repo} --json number,title,body,state,createdAt,updatedAt,headRefName,baseRefName,mergeable,isDraft,url --limit 100`
    );
    return JSON.parse(stdout) as PullRequest[];
  }, `List PRs for ${repo}`, (message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('github-retry', {
        operation: 'listPullRequests',
        repo,
        message
      });
    }
  }).catch(error => {
    Logger.error('GIT-SERVICE', `Failed to list PRs for ${repo}`, error);
    Logger.error('GIT-SERVICE', 'Error details', {
      message: error.message,
      code: error.code,
      stderr: error.stderr,
      stdout: error.stdout
    });
    throw error;
  });
}

async function getPullRequest(prNumber: number): Promise<PullRequest> {
  try {
    const { stdout } = await execPromise(
      `${ghExecutable} pr view ${prNumber} --json number,title,body,state,createdAt,updatedAt,headRefName,baseRefName,mergeable,isDraft,url`
    );
    return JSON.parse(stdout) as PullRequest;
  } catch (error) {
    throw error;
  }
}

async function mergePullRequest(prNumber: number): Promise<void> {
  try {
    // First attempt normal merge
    await execPromise(`${ghExecutable} pr merge ${prNumber} --merge`);
  } catch (error) {
    const errorMessage = (error as any).stderr || (error as Error).message;
    
    // Handle specific error cases
    if (errorMessage.includes('not mergeable') || errorMessage.includes('merge conflicts')) {
      Logger.info('MERGE', `PR #${prNumber} has conflicts. Attempting automatic resolution...`);
      
      try {
        // Get PR details
        const { stdout: prInfo } = await execPromise(
          `${ghExecutable} pr view ${prNumber} --json headRefName,headRepository,headRepositoryOwner`
        );
        const pr = JSON.parse(prInfo);
        
        // Try rebase merge instead
        Logger.info('MERGE', `Attempting rebase merge for PR #${prNumber}...`);
        await execPromise(`${ghExecutable} pr merge ${prNumber} --rebase`);
        Logger.info('MERGE', `Successfully merged PR #${prNumber} with rebase`);
        return;
      } catch (rebaseError) {
        Logger.info('MERGE', 'Rebase failed, trying squash merge...');
        
        try {
          // Try squash merge as last resort
          await execPromise(`${ghExecutable} pr merge ${prNumber} --squash`);
          Logger.info('MERGE', `Successfully merged PR #${prNumber} with squash`);
          return;
        } catch (squashError) {
          // If all merge strategies fail, close the PR and reopen the issue
          Logger.error('MERGE', `All merge strategies failed for PR #${prNumber}`);
          
          try {
            // Get issue number from PR
            const { stdout: prDetails } = await execPromise(
              `${ghExecutable} pr view ${prNumber} --json body`
            );
            const prBody = JSON.parse(prDetails).body || '';
            const issueMatch = prBody.match(/(?:Fixes|Closes|Resolves)\s+#(\d+)/i);
            
            if (issueMatch) {
              const issueNumber = parseInt(issueMatch[1]);
              
              // Close the PR with explanation
              await execPromise(
                `${ghExecutable} pr close ${prNumber} --comment "Auto-closing due to unresolvable merge conflicts. Issue #${issueNumber} remains open for retry."`
              );
              
              // Add comment to issue
              await execPromise(
                `${ghExecutable} issue comment ${issueNumber} --body "PR #${prNumber} had merge conflicts and was auto-closed. Please deploy a new agent to retry with a clean branch."`
              );
              
              throw new Error(`PR #${prNumber} had unresolvable conflicts and was closed. Issue #${issueNumber} remains open.`);
            }
          } catch (cleanupError) {
            Logger.error('MERGE', 'Error during cleanup', cleanupError);
          }
          
          throw new Error(`Cannot merge PR #${prNumber}: ${errorMessage}`);
        }
      }
    }
    
    // Re-throw other errors
    throw error;
  }
}

async function closePullRequest(prNumber: number): Promise<void> {
  try {
    await execPromise(`${ghExecutable} pr close ${prNumber}`);
  } catch (error) {
    throw error;
  }
}

async function closeIssue(repo: string, issueNumber: number): Promise<Issue> {
  try {
    await execPromise(`${ghExecutable} issue close ${issueNumber} --repo ${repo}`);
    return {
      number: issueNumber,
      title: '',
      body: '',
      state: 'CLOSED',
      createdAt: '',
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    throw error;
  }
}

async function fetchExistingLabels(repo: string): Promise<Set<string>> {
  // Check cache first
  if (labelCache.has(repo)) {
    return labelCache.get(repo)!;
  }

  try {
    Logger.debug('GIT-SERVICE', `Fetching existing labels for ${repo}`);
    const { stdout } = await execPromise(
      `${ghExecutable} label list --repo ${repo} --json name --limit 100`
    );
    
    const labels = JSON.parse(stdout) as Array<{ name: string }>;
    const labelSet = new Set(labels.map(l => l.name));
    
    // Cache the result
    labelCache.set(repo, labelSet);
    
    Logger.info('GIT-SERVICE', `Found ${labelSet.size} existing labels for ${repo}`);
    return labelSet;
  } catch (error) {
    Logger.error('GIT-SERVICE', `Failed to fetch labels for ${repo}`, error);
    return new Set();
  }
}

async function createMissingLabels(repo: string, labels: string[]): Promise<void> {
  const existingLabels = await fetchExistingLabels(repo);
  const missingLabels = labels.filter(label => !existingLabels.has(label));
  
  if (missingLabels.length === 0) {
    Logger.debug('GIT-SERVICE', 'All labels already exist');
    return;
  }
  
  Logger.info('GIT-SERVICE', `Creating ${missingLabels.length} missing labels: ${missingLabels.join(', ')}`);
  
  for (const label of missingLabels) {
    try {
      // Default color for new labels
      const color = 'c5def5';
      const execFilePromise = util.promisify(execFile);
      
      await execFilePromise(ghExecutable, [
        'label', 'create', label,
        '--repo', repo,
        '--color', color
      ]);
      Logger.info('GIT-SERVICE', `Created label: ${label}`);
      
      // Update cache
      existingLabels.add(label);
    } catch (error) {
      Logger.error('GIT-SERVICE', `Failed to create label "${label}"`, error);
      // Continue with other labels even if one fails
    }
  }
}

async function addLabels(repo: string, issueNumber: number, labels: string[]): Promise<void> {
  try {
    // Ensure all labels exist first
    await createMissingLabels(repo, labels);
    
    // Add labels to issue
    const execFilePromise = util.promisify(execFile);
    
    const args = ['issue', 'edit', String(issueNumber), '--repo', repo];
    labels.forEach(label => {
      args.push('--add-label', label);
    });
    
    await execFilePromise(ghExecutable, args);
    Logger.info('GIT-SERVICE', `Added labels to issue #${issueNumber}: ${labels.join(', ')}`);
  } catch (error) {
    Logger.error('GIT-SERVICE', `Failed to add labels to issue #${issueNumber}`, error);
    throw error;
  }
}

async function removeLabels(repo: string, issueNumber: number, labels: string[]): Promise<void> {
  try {
    const execFilePromise = util.promisify(execFile);
    
    const args = ['issue', 'edit', String(issueNumber), '--repo', repo];
    labels.forEach(label => {
      args.push('--remove-label', label);
    });
    
    await execFilePromise(ghExecutable, args);
  } catch (error) {
    throw error;
  }
}

// Export the service
const gitService: GitService = {
  setWindow,
  checkCLI,
  getStatus,
  listRepositories,
  listIssues,
  listPullRequests,
  createIssue,
  updateIssue,
  closeIssue,
  addLabels,
  removeLabels,
  createBranch,
  createPullRequest,
  mergePullRequest,
  closePullRequest,
  getPullRequest
};

module.exports = gitService;