import { exec, execFile } from 'child_process';
import * as path from 'path';
import * as util from 'util';
import { BrowserWindow } from 'electron';
import { Logger } from './utils/logger';

const execPromise = util.promisify(exec);
const execFilePromise = util.promisify(execFile);

// Cache for repository labels to avoid repeated API calls
const labelCache = new Map<string, Array<{name: string; color: string}>>();
const labelCacheTimeout = 5 * 60 * 1000; // 5 minutes
const labelCacheTimestamps = new Map<string, number>();

// Find gh executable path
let ghExecutable = 'gh';
if (process.platform === 'win32') {
  const ghPath = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'GitHub CLI', 'gh.exe');
  if (require('fs').existsSync(ghPath)) {
    ghExecutable = ghPath;
  }
}

/**
 * Cache repository labels for faster issue creation
 */
async function cacheRepoLabels(repo: string): Promise<void> {
  const now = Date.now();
  const lastCached = labelCacheTimestamps.get(repo) || 0;
  
  // Skip if cache is still fresh
  if (now - lastCached < labelCacheTimeout && labelCache.has(repo)) {
    return;
  }

  try {
    Logger.debug('CACHE', `Fetching labels for ${repo}...`);
    const { stdout } = await execFilePromise(ghExecutable, [
      'label', 'list',
      '--repo', repo,
      '--json', 'name,color',
      '--limit', '100'
    ]);
    
    const labels = JSON.parse(stdout);
    labelCache.set(repo, labels);
    labelCacheTimestamps.set(repo, now);
    Logger.info('CACHE', `Cached ${labels.length} labels for ${repo}`);
  } catch (error) {
    Logger.error('CACHE', `Failed to cache labels for ${repo}`, error);
    // Don't throw - issue creation should still work without cache
  }
}

/**
 * Get cached labels for a repository
 */
export function getCachedLabels(repo: string): Array<{name: string; color: string}> {
  return labelCache.get(repo) || [];
}

/**
 * Create issue with optimized performance
 * - Single gh command for issue + labels
 * - No full refresh required
 * - Returns parsed issue data
 */
export async function createIssueOptimized(
  repo: string, 
  title: string, 
  body: string, 
  labels?: string[]
): Promise<any> {
  // Ensure labels are cached
  await cacheRepoLabels(repo);
  
  // Validate inputs
  const { sanitizeRepoName, sanitizeIssueTitle, sanitizeIssueBody } = require('./utils/sanitizer');
  const safeRepo = sanitizeRepoName(repo);
  const safeTitle = sanitizeIssueTitle(title);
  const safeBody = sanitizeIssueBody(body);
  
  // Build command arguments
  const args = [
    'issue', 'create',
    '--repo', safeRepo,
    '--title', safeTitle,
    '--body', safeBody
  ];
  
  // Add labels in a single command if provided
  if (labels && labels.length > 0) {
    // Validate labels against cache if available
    const cachedLabels = getCachedLabels(repo);
    const validLabels = labels.filter(label => {
      // If we have a cache, validate against it
      if (cachedLabels.length > 0) {
        return cachedLabels.some(cl => cl.name.toLowerCase() === label.toLowerCase());
      }
      // If no cache, assume label is valid
      return true;
    });
    
    if (validLabels.length > 0) {
      args.push('--label', validLabels.join(','));
    }
  }
  
  Logger.debug('OPTIMIZED', 'Creating issue with single command...');
  const startTime = Date.now();
  
  try {
    const { stdout } = await execFilePromise(ghExecutable, args);
    
    // Parse the issue URL to get the number
    const match = stdout.match(/\/issues\/(\d+)/);
    const issueNumber = match ? parseInt(match[1], 10) : null;
    
    const duration = Date.now() - startTime;
    Logger.info('OPTIMIZED', `Issue created in ${duration}ms`);
    
    // Construct the issue object without needing another API call
    const newIssue = {
      number: issueNumber,
      title: safeTitle,
      body: safeBody,
      labels: labels?.map(name => ({ name })) || [],
      state: 'open',
      createdAt: new Date().toISOString(),
      url: stdout.trim()
    };
    
    return newIssue;
  } catch (error) {
    Logger.error('OPTIMIZED', 'Failed to create issue', error);
    throw error;
  }
}

/**
 * Create multiple issues in parallel for better performance
 */
export async function createIssuesBatch(
  repo: string,
  issues: Array<{title: string; body: string; labels?: string[]}>
): Promise<any[]> {
  // Pre-cache labels once for all issues
  await cacheRepoLabels(repo);
  
  Logger.info('BATCH', `Creating ${issues.length} issues in parallel...`);
  const startTime = Date.now();
  
  // Create all issues in parallel with concurrency limit
  const BATCH_SIZE = 5; // GitHub API rate limiting consideration
  const results = [];
  
  for (let i = 0; i < issues.length; i += BATCH_SIZE) {
    const batch = issues.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(issue => 
        createIssueOptimized(repo, issue.title, issue.body, issue.labels)
          .catch(error => ({ error, issue }))
      )
    );
    results.push(...batchResults);
  }
  
  const duration = Date.now() - startTime;
  const successCount = results.filter(r => !r.error).length;
  Logger.info('BATCH', `Created ${successCount}/${issues.length} issues in ${duration}ms`);
  
  return results;
}

/**
 * Pre-warm caches for a repository
 */
export async function prewarmRepository(repo: string): Promise<void> {
  Logger.debug('PREWARM', `Pre-warming caches for ${repo}...`);
  await Promise.all([
    cacheRepoLabels(repo),
    // Add other cache operations here as needed
  ]);
}

/**
 * Clear all caches (useful for testing or when switching repos)
 */
export function clearCaches(): void {
  labelCache.clear();
  labelCacheTimestamps.clear();
  Logger.debug('CACHE', 'All caches cleared');
}

// Export optimized functions
export default {
  createIssueOptimized,
  createIssuesBatch,
  getCachedLabels,
  prewarmRepository,
  clearCaches
};