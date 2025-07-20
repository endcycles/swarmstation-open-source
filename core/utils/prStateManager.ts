/**
 * Pull Request state management utilities
 * Handles deduplication, synchronization, and consistency
 */

import { PullRequest } from '../types';

interface PRIdentifier {
  number?: number;
  url?: string;
  issue?: number;
}

/**
 * Extract PR number from URL
 */
export function extractPRNumberFromUrl(url: string): number | null {
  const match = url.match(/\/pull\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract issue number from PR body/title
 */
export function extractIssueFromPR(pr: { title?: string; body?: string }): number | null {
  const text = `${pr.title || ''} ${pr.body || ''}`;
  
  // Look for various patterns
  const patterns = [
    /(?:Fixes|Closes|Resolves)\s*#(\d+)/i,
    /Issue\s*#(\d+)/i,
    /#(\d+)/
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  
  return null;
}

/**
 * Create a unique key for PR deduplication
 */
export function getPRKey(pr: PRIdentifier): string {
  if (pr.number) {
    return `pr-${pr.number}`;
  }
  if (pr.url) {
    const number = extractPRNumberFromUrl(pr.url);
    if (number) {
      return `pr-${number}`;
    }
  }
  if (pr.issue) {
    return `issue-${pr.issue}`;
  }
  return `unknown-${Date.now()}`;
}

/**
 * Merge PR data, preferring newer/more complete data
 */
export function mergePRData(existing: PullRequest, update: Partial<PullRequest>): PullRequest {
  return {
    ...existing,
    ...update,
    // Always keep the earliest ID
    id: existing.id,
    // Prefer actual PR number over placeholder
    number: update.number || existing.number,
    // Prefer actual URL over null
    url: update.url || existing.url,
    // Merge checks array
    checks: update.checks || existing.checks,
    // Keep the original creation time
    createdAt: existing.createdAt,
    // Update state to latest
    state: update.state || existing.state,
  };
}

/**
 * Deduplicate and merge PR list
 */
export function deduplicatePRs(prs: PullRequest[]): PullRequest[] {
  const prMap = new Map<string, PullRequest>();
  
  for (const pr of prs) {
    const key = getPRKey(pr);
    const existing = prMap.get(key);
    
    if (existing) {
      // Merge data, preferring more complete information
      prMap.set(key, mergePRData(existing, pr));
    } else {
      prMap.set(key, pr);
    }
  }
  
  return Array.from(prMap.values());
}

/**
 * Synchronize local PRs with GitHub PRs
 */
export function syncPRsWithGitHub(
  localPRs: PullRequest[],
  githubPRs: PullRequest[]
): PullRequest[] {
  const prMap = new Map<string, PullRequest>();
  
  // First add all GitHub PRs (source of truth)
  for (const githubPR of githubPRs) {
    const key = getPRKey(githubPR);
    prMap.set(key, githubPR);
  }
  
  // Then check local PRs
  for (const localPR of localPRs) {
    const key = getPRKey(localPR);
    const githubPR = prMap.get(key);
    
    if (githubPR) {
      // Merge local data with GitHub data
      prMap.set(key, mergePRData(localPR, githubPR));
    } else if (!localPR.number) {
      // Keep pending local PRs that don't have a number yet
      prMap.set(key, localPR);
    }
    // Discard local PRs with numbers that aren't on GitHub (likely deleted)
  }
  
  return Array.from(prMap.values());
}

/**
 * Check if PR already exists for an issue
 */
export function prExistsForIssue(prs: PullRequest[], issueNumber: number): boolean {
  return prs.some(pr => {
    const prIssue = typeof pr.issue === 'number' ? pr.issue : pr.issue?.number;
    return prIssue === issueNumber;
  });
}

/**
 * Update PR with new information
 */
export function updatePR(
  prs: PullRequest[],
  identifier: PRIdentifier,
  update: Partial<PullRequest>
): PullRequest[] {
  const key = getPRKey(identifier);
  
  return prs.map(pr => {
    if (getPRKey(pr) === key) {
      return mergePRData(pr, update);
    }
    return pr;
  });
}

/**
 * Add sequence numbers to PR updates for ordering
 */
let updateSequence = 0;

export interface SequencedPRUpdate {
  sequence: number;
  timestamp: number;
  update: Partial<PullRequest>;
  identifier: PRIdentifier;
}

export function createSequencedUpdate(
  identifier: PRIdentifier,
  update: Partial<PullRequest>
): SequencedPRUpdate {
  return {
    sequence: ++updateSequence,
    timestamp: Date.now(),
    update,
    identifier
  };
}

/**
 * Apply sequenced updates in order
 */
export function applySequencedUpdates(
  prs: PullRequest[],
  updates: SequencedPRUpdate[]
): PullRequest[] {
  // Sort by sequence number
  const sortedUpdates = [...updates].sort((a, b) => a.sequence - b.sequence);
  
  let result = prs;
  for (const { identifier, update } of sortedUpdates) {
    result = updatePR(result, identifier, update);
  }
  
  return result;
}