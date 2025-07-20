/**
 * PR Recovery utilities for handling failed PR creation/detection
 */

import { Agent, Issue, PullRequest } from '../types';

export interface PRRecoveryTask {
  issueNumber: number;
  agentId: number;
  attempts: number;
  lastAttempt: Date;
  error?: string;
  status: 'pending' | 'retrying' | 'failed' | 'recovered';
}

export interface PRRecoveryState {
  tasks: Map<number, PRRecoveryTask>;
  isRunning: boolean;
}

const MAX_PR_RECOVERY_ATTEMPTS = 5;
const PR_RECOVERY_DELAY = 10000; // 10 seconds between attempts
const PR_RECOVERY_TIMEOUT = 300000; // 5 minutes total timeout

/**
 * Check if an agent has completed but no PR exists
 */
export function findOrphanedAgents(
  agents: Record<number, Agent>,
  pullRequests: PullRequest[]
): number[] {
  const orphaned: number[] = [];
  
  for (const [issueNumber, agent] of Object.entries(agents)) {
    if (agent.status === 'completed') {
      // Check if PR exists for this issue
      const hasPR = pullRequests.some(pr => {
        const prIssue = typeof pr.issue === 'number' ? pr.issue : pr.issue?.number;
        return prIssue === parseInt(issueNumber) && pr.number; // Must have actual PR number
      });
      
      if (!hasPR) {
        orphaned.push(parseInt(issueNumber));
      }
    }
  }
  
  return orphaned;
}

/**
 * Attempt to recover PR for a completed agent
 */
export async function recoverPR(
  issueNumber: number,
  selectedRepo: string,
  electronAPI: any
): Promise<{ success: boolean; pr?: PullRequest; error?: string }> {
  try {
    // First, check if PR was actually created on GitHub
    const allPRs = await electronAPI.github.listPullRequests(selectedRepo);
    
    // Look for PR that references this issue
    const matchingPR = allPRs.find((pr: any) => {
      const body = pr.body || '';
      const title = pr.title || '';
      return (
        body.includes(`#${issueNumber}`) ||
        title.includes(`#${issueNumber}`) ||
        body.includes(`Fixes #${issueNumber}`) ||
        body.includes(`Closes #${issueNumber}`)
      );
    });
    
    if (matchingPR) {
      // PR exists on GitHub, return it
      return {
        success: true,
        pr: {
          id: matchingPR.number,
          number: matchingPR.number,
          title: matchingPR.title,
          url: matchingPR.url,
          state: matchingPR.state,
          issue: issueNumber,
          checks: [],
          createdAt: matchingPR.createdAt,
          body: matchingPR.body
        }
      };
    }
    
    // PR doesn't exist, check agent logs for branch info
    const agentLogs = await electronAPI.claude.getAgentLogs(issueNumber);
    
    // Look for branch creation in logs
    let branchName: string | null = null;
    for (const log of agentLogs) {
      const content = typeof log === 'string' ? log : log.content || '';
      
      // Look for branch creation patterns
      const branchMatch = content.match(/git checkout -b ([\w\-\/]+)|Switched to a new branch '([\w\-\/]+)'/);
      if (branchMatch) {
        branchName = branchMatch[1] || branchMatch[2];
        break;
      }
    }
    
    if (branchName) {
      // Try to create PR manually
      try {
        const pr = await electronAPI.github.createPullRequest(
          `Fix #${issueNumber}`,
          `Fixes #${issueNumber}\n\nAutomated fix by SwarmStation agent (recovered).`
        );
        
        return {
          success: true,
          pr: {
            id: pr.number,
            number: pr.number,
            title: pr.title,
            url: pr.url,
            state: 'OPEN',
            issue: issueNumber,
            checks: [],
            createdAt: pr.createdAt,
            body: pr.body
          }
        };
      } catch (createError: any) {
        // Check if PR already exists error
        if (createError.message?.includes('already exists')) {
          // Try to find it again
          await new Promise(resolve => setTimeout(resolve, 2000));
          return recoverPR(issueNumber, selectedRepo, electronAPI);
        }
        throw createError;
      }
    }
    
    return {
      success: false,
      error: 'Could not find branch information in agent logs'
    };
    
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Unknown error during PR recovery'
    };
  }
}

/**
 * Create a PR recovery manager
 */
export class PRRecoveryManager {
  private state: PRRecoveryState = {
    tasks: new Map(),
    isRunning: false
  };
  
  private electronAPI: any;
  private onRecovered?: (issueNumber: number, pr: PullRequest) => void;
  private onFailed?: (issueNumber: number, error: string) => void;
  private addActivity?: (message: string) => void;
  
  constructor(options: {
    electronAPI: any;
    onRecovered?: (issueNumber: number, pr: PullRequest) => void;
    onFailed?: (issueNumber: number, error: string) => void;
    addActivity?: (message: string) => void;
  }) {
    this.electronAPI = options.electronAPI;
    this.onRecovered = options.onRecovered;
    this.onFailed = options.onFailed;
    this.addActivity = options.addActivity;
  }
  
  /**
   * Add issues to recovery queue
   */
  addToRecovery(issueNumbers: number[]): void {
    for (const issueNumber of issueNumbers) {
      if (!this.state.tasks.has(issueNumber)) {
        this.state.tasks.set(issueNumber, {
          issueNumber,
          agentId: issueNumber,
          attempts: 0,
          lastAttempt: new Date(),
          status: 'pending'
        });
        this.addActivity?.(`Added issue #${issueNumber} to PR recovery queue`);
      }
    }
    
    // Start recovery process if not running
    if (!this.state.isRunning) {
      this.startRecovery();
    }
  }
  
  /**
   * Start the recovery process
   */
  private async startRecovery(): Promise<void> {
    if (this.state.isRunning) return;
    
    this.state.isRunning = true;
    this.addActivity?.('Starting PR recovery process...');
    
    while (this.state.tasks.size > 0) {
      // Get pending tasks
      const pendingTasks = Array.from(this.state.tasks.values())
        .filter(task => task.status === 'pending' || task.status === 'retrying')
        .filter(task => task.attempts < MAX_PR_RECOVERY_ATTEMPTS);
      
      if (pendingTasks.length === 0) {
        // No more tasks to process
        break;
      }
      
      // Process tasks one by one
      for (const task of pendingTasks) {
        await this.processTask(task);
        
        // Wait between attempts
        await new Promise(resolve => setTimeout(resolve, PR_RECOVERY_DELAY));
      }
    }
    
    this.state.isRunning = false;
    this.addActivity?.('PR recovery process completed');
  }
  
  /**
   * Process a single recovery task
   */
  private async processTask(task: PRRecoveryTask): Promise<void> {
    task.status = 'retrying';
    task.attempts++;
    task.lastAttempt = new Date();
    
    this.addActivity?.(`Attempting PR recovery for issue #${task.issueNumber} (attempt ${task.attempts}/${MAX_PR_RECOVERY_ATTEMPTS})`);
    
    try {
      // Get selected repo from localStorage or state
      const selectedRepo = localStorage.getItem('swarmstation_selectedRepo');
      if (!selectedRepo) {
        throw new Error('No repository selected');
      }
      
      const result = await recoverPR(task.issueNumber, JSON.parse(selectedRepo), this.electronAPI);
      
      if (result.success && result.pr) {
        task.status = 'recovered';
        this.state.tasks.delete(task.issueNumber);
        this.addActivity?.(`Successfully recovered PR for issue #${task.issueNumber}`);
        this.onRecovered?.(task.issueNumber, result.pr);
      } else {
        task.error = result.error;
        
        if (task.attempts >= MAX_PR_RECOVERY_ATTEMPTS) {
          task.status = 'failed';
          this.addActivity?.(`Failed to recover PR for issue #${task.issueNumber} after ${MAX_PR_RECOVERY_ATTEMPTS} attempts: ${result.error}`);
          this.onFailed?.(task.issueNumber, result.error || 'Max attempts reached');
          this.state.tasks.delete(task.issueNumber);
        }
      }
    } catch (error: any) {
      task.error = error.message;
      
      if (task.attempts >= MAX_PR_RECOVERY_ATTEMPTS) {
        task.status = 'failed';
        this.addActivity?.(`Failed to recover PR for issue #${task.issueNumber}: ${error.message}`);
        this.onFailed?.(task.issueNumber, error.message);
        this.state.tasks.delete(task.issueNumber);
      }
    }
  }
  
  /**
   * Get current recovery status
   */
  getStatus(): { total: number; pending: number; failed: number; recovered: number } {
    const tasks = Array.from(this.state.tasks.values());
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending' || t.status === 'retrying').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      recovered: tasks.filter(t => t.status === 'recovered').length
    };
  }
  
  /**
   * Stop recovery process
   */
  stop(): void {
    this.state.isRunning = false;
    this.state.tasks.clear();
    this.addActivity?.('PR recovery process stopped');
  }
}