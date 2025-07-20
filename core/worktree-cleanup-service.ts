import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './utils/logger';

interface StaleWorktree {
  path: string;
  branch: string;
  issueNumber: number;
  ageInDays: number;
}

interface CleanupServiceOptions {
  projectPath: string;
  staleThresholdDays?: number;
  checkInterval?: number;
  claudeService: any;
  gitService: any;
}

export class WorktreeCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private projectPath: string;
  private staleThresholdDays: number;
  private checkInterval: number;
  private claudeService: any;
  private gitService: any;
  
  constructor(options: CleanupServiceOptions) {
    this.projectPath = options.projectPath;
    this.staleThresholdDays = options.staleThresholdDays || 7;
    this.checkInterval = options.checkInterval || 60 * 60 * 1000; // 1 hour default
    this.claudeService = options.claudeService;
    this.gitService = options.gitService;
  }
  
  start(): void {
    if (this.cleanupInterval) return;
    
    Logger.info('CLEANUP-SERVICE', 'Starting periodic cleanup service');
    
    // Run cleanup every interval
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.checkInterval);
    
    // Initial cleanup after 5 minutes
    setTimeout(() => {
      this.performCleanup();
    }, 5 * 60 * 1000);
  }
  
  async performCleanup(): Promise<void> {
    if (this.isRunning) {
      Logger.debug('CLEANUP-SERVICE', 'Cleanup already in progress, skipping');
      return;
    }
    
    this.isRunning = true;
    Logger.info('CLEANUP-SERVICE', 'Starting periodic cleanup');
    
    try {
      const staleWorktrees = await this.findStaleWorktrees();
      Logger.info('CLEANUP-SERVICE', `Found ${staleWorktrees.length} stale worktrees`);
      
      for (const worktree of staleWorktrees) {
        try {
          Logger.info('CLEANUP-SERVICE', `Removing stale worktree: ${worktree.branch} (${worktree.ageInDays.toFixed(1)} days old)`);
          await this.claudeService.cleanupWorktree(worktree.issueNumber);
        } catch (error) {
          Logger.error('CLEANUP-SERVICE', `Failed to cleanup ${worktree.branch}`, error);
        }
      }
    } catch (error) {
      Logger.error('CLEANUP-SERVICE', 'Periodic cleanup failed', error);
    } finally {
      this.isRunning = false;
    }
  }
  
  async findStaleWorktrees(): Promise<StaleWorktree[]> {
    const now = Date.now();
    const stale: StaleWorktree[] = [];
    
    try {
      const worktrees = await this.gitService.listWorktrees(this.projectPath);
      
      for (const worktree of worktrees) {
        // Skip main branch
        if (worktree.branch === 'main' || worktree.branch === 'master') continue;
        
        // Extract issue number from branch name
        const match = worktree.branch.match(/issue-(\d+)/);
        if (!match) continue;
        
        const issueNumber = parseInt(match[1]);
        
        // Check if agent is active
        const agent = this.claudeService.getAgentStatus(issueNumber);
        if (agent && agent.status === 'running') {
          Logger.debug('CLEANUP-SERVICE', `Skipping active agent worktree: ${worktree.branch}`);
          continue;
        }
        
        // Check worktree age
        try {
          const stat = await fs.promises.stat(worktree.path);
          const ageInDays = (now - stat.mtime.getTime()) / (1000 * 60 * 60 * 24);
          
          if (ageInDays > this.staleThresholdDays) {
            stale.push({
              ...worktree,
              issueNumber,
              ageInDays
            });
          }
        } catch (error) {
          // If we can't stat the directory, it's probably stale
          Logger.warn('CLEANUP-SERVICE', `Failed to stat ${worktree.path}`, error);
          stale.push({
            ...worktree,
            issueNumber,
            ageInDays: 999
          });
        }
      }
    } catch (error) {
      Logger.error('CLEANUP-SERVICE', 'Failed to list worktrees', error);
    }
    
    return stale;
  }
  
  stop(): void {
    if (this.cleanupInterval) {
      Logger.info('CLEANUP-SERVICE', 'Stopping periodic cleanup service');
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  // Allow manual trigger of cleanup
  async manualCleanup(): Promise<void> {
    Logger.info('CLEANUP-SERVICE', 'Manual cleanup triggered');
    await this.performCleanup();
  }
}