/**
 * Git mutex implementation to prevent concurrent git operations
 * that can cause "could not lock config file" errors
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from './utils/logger';

const execPromise = promisify(exec);

export class GitMutex {
  private static locks = new Map<string, Promise<void>>();
  
  /**
   * Execute a git operation with mutex protection
   * @param repoPath The repository path
   * @param operation The async operation to execute
   * @param operationName Optional name for logging
   * @returns The result of the operation
   */
  static async withLock<T>(
    repoPath: string,
    operation: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    // Normalize the repo path to use as a key
    const lockKey = repoPath;
    
    // Wait for any existing operation on this repository
    const existingLock = this.locks.get(lockKey);
    if (existingLock) {
      Logger.debug('GIT-MUTEX', `Waiting for existing git operation to complete${operationName ? ` before ${operationName}` : ''}`);
      await existingLock;
    }
    
    // Create a new lock promise
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    
    // Store the lock
    this.locks.set(lockKey, lockPromise);
    
    try {
      Logger.debug('GIT-MUTEX', `Acquired lock${operationName ? ` for ${operationName}` : ''}`);
      
      // Execute the operation
      const result = await operation();
      
      Logger.debug('GIT-MUTEX', `Operation completed${operationName ? ` for ${operationName}` : ''}`);
      return result;
    } finally {
      // Release the lock
      releaseLock!();
      
      // Remove the lock from the map
      this.locks.delete(lockKey);
      
      Logger.debug('GIT-MUTEX', `Released lock${operationName ? ` for ${operationName}` : ''}`);
    }
  }
  
  /**
   * Check if there's currently a lock for a repository
   * @param repoPath The repository path
   * @returns True if locked, false otherwise
   */
  static isLocked(repoPath: string): boolean {
    return this.locks.has(repoPath);
  }
  
  /**
   * Wait for all locks to be released
   * Useful for cleanup operations
   */
  static async waitForAllLocks(): Promise<void> {
    const allLocks = Array.from(this.locks.values());
    if (allLocks.length > 0) {
      Logger.debug('GIT-MUTEX', `Waiting for ${allLocks.length} git operations to complete`);
      await Promise.all(allLocks);
    }
  }
}