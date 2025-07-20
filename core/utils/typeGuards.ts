import { AgentLog, CompletedAgentLog, Agent } from '../types';
import { Logger } from './logger';

/**
 * Type guard to check if a value is a valid AgentLog
 */
export function isAgentLog(value: unknown): value is AgentLog {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    'content' in value &&
    'timestamp' in value &&
    typeof (value as any).timestamp === 'number'
  );
}

/**
 * Type guard to check if a value is a valid AgentLog array
 */
export function isAgentLogArray(value: unknown): value is AgentLog[] {
  return Array.isArray(value) && value.every(isAgentLog);
}

/**
 * Type guard to check if a value is a valid CompletedAgentLog
 */
export function isCompletedAgentLog(value: unknown): value is CompletedAgentLog {
  return (
    typeof value === 'object' &&
    value !== null &&
    'logs' in value &&
    'agent' in value &&
    'completedAt' in value &&
    isAgentLogArray((value as any).logs) &&
    typeof (value as any).completedAt === 'string'
  );
}

/**
 * Type guard to check if a value is a valid Agent
 */
export function isAgent(value: unknown): value is Agent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'issueNumber' in value &&
    'status' in value &&
    'task' in value &&
    'details' in value &&
    'issue' in value &&
    'startTime' in value &&
    'progress' in value &&
    typeof (value as any).issueNumber === 'number' &&
    typeof (value as any).startTime === 'number' &&
    typeof (value as any).progress === 'number'
  );
}

/**
 * Filter out system keys from an object
 */
export function filterSystemKeys<T extends Record<string, any>>(obj: T): T {
  const filtered = {} as T;
  Object.entries(obj).forEach(([key, value]) => {
    if (!key.startsWith('__')) {
      filtered[key as keyof T] = value;
    }
  });
  return filtered;
}

/**
 * Check if a key is a valid numeric issue number
 */
export function isValidIssueKey(key: string): boolean {
  return !key.startsWith('__') && !isNaN(parseInt(key));
}

/**
 * Clean and validate a record of agent logs
 */
export function cleanAgentLogsRecord(
  logs: Record<string, unknown>
): Record<number, AgentLog[]> {
  const cleaned: Record<number, AgentLog[]> = {};
  
  Object.entries(logs).forEach(([key, value]) => {
    if (!isValidIssueKey(key)) {
      Logger.warn('TYPE_GUARDS',(`Skipping invalid key in agent logs: ${key}`);
      return;
    }
    
    const issueNumber = parseInt(key);
    if (isAgentLogArray(value)) {
      cleaned[issueNumber] = value;
    } else {
      Logger.warn('TYPE_GUARDS',(`Invalid logs array for issue ${issueNumber}:`, value);
    }
  });
  
  return cleaned;
}

/**
 * Clean and validate a record of completed agent logs
 */
export function cleanCompletedAgentLogsRecord(
  logs: Record<string, unknown>
): Record<number, CompletedAgentLog> {
  const cleaned: Record<number, CompletedAgentLog> = {};
  
  Object.entries(logs).forEach(([key, value]) => {
    if (!isValidIssueKey(key)) {
      Logger.warn('TYPE_GUARDS',(`Skipping invalid key in completed logs: ${key}`);
      return;
    }
    
    const issueNumber = parseInt(key);
    if (isCompletedAgentLog(value)) {
      cleaned[issueNumber] = value;
    } else {
      Logger.warn('TYPE_GUARDS',(`Invalid completed log entry for issue ${issueNumber}:`, value);
    }
  });
  
  return cleaned;
}

/**
 * Clean and validate a record of agents
 */
export function cleanAgentsRecord(
  agents: Record<string, unknown>
): Record<number, Agent> {
  const cleaned: Record<number, Agent> = {};
  
  Object.entries(agents).forEach(([key, value]) => {
    if (!isValidIssueKey(key)) {
      Logger.warn('TYPE_GUARDS',(`Skipping invalid key in agents: ${key}`);
      return;
    }
    
    const issueNumber = parseInt(key);
    if (isAgent(value)) {
      cleaned[issueNumber] = value;
    } else {
      Logger.warn('TYPE_GUARDS',(`Invalid agent entry for issue ${issueNumber}:`, value);
    }
  });
  
  return cleaned;
}