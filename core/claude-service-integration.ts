/**
 * Integration module for enhanced Claude service
 * Combines optimized issue creation with improved agent deployment
 */

import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Issue } from './types';
import { classifyTask, generateEnhancedPrompt, getAllowedTools } from './agent-enhancer';
import { Logger } from './utils/logger';

const execPromise = promisify(exec);

// Existing claude-service functions to enhance
const originalClaudeService = require('./claude-service');

/**
 * Enhanced deployAgent with task classification
 */
export async function deployAgentEnhanced(
  issueNumber: number, 
  repo: string, 
  additionalContext?: string
) {
  Logger.info('ENHANCED', `Deploying agent for issue #${issueNumber} with classification`);
  
  try {
    // Fetch issue details first
    const { stdout: issueData } = await execPromise(
      `gh issue view ${issueNumber} --repo ${repo} --json number,title,body,labels`
    );
    const issue: Issue = JSON.parse(issueData);
    
    // Classify the task
    const classification = classifyTask(issue);
    Logger.info('ENHANCED', `Task classified as: ${classification.taskType} (${classification.priority})`);
    
    // Generate enhanced prompts
    const worktreePath = path.join(process.cwd(), '.claude-worktrees', `issue-${issueNumber}`);
    const { systemPrompt, taskPrompt } = generateEnhancedPrompt(issue, classification, worktreePath);
    
    // Get allowed tools for this task type
    const allowedTools = getAllowedTools(classification.taskType);
    
    // Prepare enhanced context
    const enhancedContext = {
      systemPrompt,
      taskPrompt,
      allowedTools,
      classification,
      additionalContext
    };
    
    // Call original deployAgent with enhanced context
    // This would need modification in the actual claude-service.ts
    Logger.debug('ENHANCED', 'Deploying with enhanced context', {
      taskType: classification.taskType,
      priority: classification.priority,
      deliverables: classification.expectedDeliverables.length,
      protectedFiles: classification.protectedFiles.length
    });
    
    // For now, call the original function
    // In a real implementation, we'd modify claude-service.ts to accept these parameters
    return await originalClaudeService.deployAgent(issueNumber, repo, additionalContext);
    
  } catch (error) {
    Logger.error('ENHANCED', 'Failed to deploy enhanced agent', error);
    throw error;
  }
}

/**
 * Validate agent work before PR creation
 */
export async function validateAgentWork(
  issueNumber: number,
  worktreePath: string
): Promise<{ isValid: boolean; issues: string[] }> {
  const issues: string[] = [];
  
  try {
    // Check git status
    const { stdout: gitStatus } = await execPromise('git status --porcelain', { cwd: worktreePath });
    
    if (!gitStatus.trim()) {
      issues.push('No changes detected - agent may not have completed the task');
    }
    
    // Check for common problems
    const modifiedFiles = gitStatus.split('\n').map(line => line.substring(3).trim());
    
    // Check if CLAUDE.md or .claude.md was modified (common mistake)
    if (modifiedFiles.includes('CLAUDE.md') || modifiedFiles.includes('.claude.md')) {
      issues.push('CLAUDE.md/.claude.md was modified - this is a protected file');
    }
    
    // Check if expected files exist
    // This would be enhanced with actual deliverables from classification
    
    return {
      isValid: issues.length === 0,
      issues
    };
  } catch (error) {
    Logger.error('VALIDATE', 'Error validating agent work', error);
    return {
      isValid: false,
      issues: ['Failed to validate: ' + (error as Error).message]
    };
  }
}

/**
 * Monitor agent health with task-specific thresholds
 */
export function getHealthCheckThresholds(taskType: string) {
  const thresholds = {
    documentation: {
      maxIdleTime: 5 * 60 * 1000,     // 5 minutes
      maxTotalTime: 15 * 60 * 1000,   // 15 minutes
      minProgressInterval: 60 * 1000   // 1 minute
    },
    bug: {
      maxIdleTime: 10 * 60 * 1000,    // 10 minutes
      maxTotalTime: 30 * 60 * 1000,   // 30 minutes
      minProgressInterval: 2 * 60 * 1000 // 2 minutes
    },
    feature: {
      maxIdleTime: 15 * 60 * 1000,    // 15 minutes
      maxTotalTime: 45 * 60 * 1000,   // 45 minutes
      minProgressInterval: 3 * 60 * 1000 // 3 minutes
    },
    default: {
      maxIdleTime: 10 * 60 * 1000,    // 10 minutes
      maxTotalTime: 30 * 60 * 1000,   // 30 minutes  
      minProgressInterval: 2 * 60 * 1000 // 2 minutes
    }
  };
  
  return (thresholds as any)[taskType] || thresholds.default;
}

// Export enhanced functions
export default {
  ...originalClaudeService,
  deployAgent: deployAgentEnhanced,
  validateAgentWork,
  getHealthCheckThresholds
};