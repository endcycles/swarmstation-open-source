// Types for Claude Service

import { BrowserWindow } from 'electron';

// Re-define AgentStatus locally to avoid cross-directory imports
export type AgentStatus = 
  | 'starting' 
  | 'working' 
  | 'running'
  | 'completed' 
  | 'failed' 
  | 'stopped' 
  | 'stopping'
  | 'interrupted';

// Claude SDK Types
export interface ClaudeSDK {
  query: (options: QueryOptions) => AsyncIterable<SDKMessage>;
}

export interface QueryOptions {
  prompt: string;
  abortController: AbortController;
  options: {
    maxTurns: number;
    permissionMode: 'bypassPermissions' | 'requestPermissions';
    outputFormat: 'stream-json' | 'json';
    cwd: string;
  };
}

export interface SDKMessage {
  type: 'system' | 'user' | 'assistant' | 'result' | 'error' | 'tool_code';
  subtype?: string;
  message?: {
    content?: Array<{
      type: 'text';
      text: string;
    }>;
  };
  tool_name?: string;
  session_id?: string;
  model?: string;
  permissionMode?: string;
  cwd?: string;
  tools?: string[];
  mcp_servers?: string[];
  apiKeySource?: string;
  num_turns?: number;
  total_cost_usd?: number;
  timestamp?: string;
  error?: string;
}

// Agent Management Types
export interface AgentInfo {
  issueNumber: number;
  repo: string;
  abortController: AbortController;
  status: AgentStatus;
  startTime: Date;
  endTime?: Date;
  logs: AgentLog[];
  workspace: string;
  worktree: boolean;
  queryIterator: AsyncIterable<SDKMessage>;
  error?: string;
  markedForCleanup?: boolean;
}

export interface AgentLog {
  type: 'sdk' | 'stdout' | 'stderr' | 'error';
  data: SDKMessage | string;
  timestamp: Date;
}

// API Response Types
export interface ParsedIssue {
  title: string;
  body: string;
  labels: string[];
}

export interface IssueDetails {
  number: number;
  title: string;
  body: string;
}

export interface AgentStatusResult {
  issueNumber: number;
  status: AgentStatus;
  startTime: Date;
  endTime?: Date;
  error?: string;
}

export interface AgentSummary {
  issueNumber: number;
  repo: string;
  status: AgentStatus;
  startTime: Date;
  endTime?: Date;
  markedForCleanup?: boolean;
}

export interface LogFileResult {
  success: boolean;
  content?: string;
  error?: string;
}

// Event Types
export interface AgentStatusUpdate {
  issueNumber: number;
  status: AgentStatus;
  details?: string;
}

export interface AgentOutput {
  issueNumber: number;
  data: string;
}

export interface AgentLogUpdate {
  issueNumber: number;
  message: SDKMessage;
}

// Module Types
export interface ClaudeService {
  setWindow: (window: BrowserWindow | null) => void;
  checkCLI: () => Promise<boolean>;
  checkClaudeAvailable: () => Promise<boolean>;
  deployAgent: (issueNumber: number, repo: string, additionalContext?: string) => Promise<void>;
  deployAgentWithContext: (issueNumber: number, repo: string, context: string) => Promise<void>;
  getAgentStatus: (issueNumber: number) => AgentStatusResult | null;
  getAllAgents: () => AgentSummary[];
  stopAgent: (issueNumber: number) => Promise<void>;
  run: (command: string) => void;
  getAgentLogs: (issueNumber: number) => AgentLog[];
  cleanupWorktree: (issueNumber: number) => Promise<void>;
  forceCleanupIssue: (issueNumber: number) => Promise<void>;
  cleanupAllAgents: () => Promise<void>;
  readAgentLogFile: (issueNumber: number) => Promise<LogFileResult>;
  parseIssuesFromText: (text: string) => Promise<ParsedIssue[]>;
}