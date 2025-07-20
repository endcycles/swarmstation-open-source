// Electron API Types for SwarmStation

import { Repository, Issue, CLIStatus, StructuredAgentLog, AgentStatus } from './app-types';

// Main Electron API Interface
export interface ElectronAPI {
  claude: ClaudeAPI;
  github: GitHubAPI;
  system: SystemAPI;
  updater: UpdaterAPI;
  shell: ShellAPI;
}

// Claude API
export interface ClaudeAPI {
  // Command execution
  runCommand: (command: string) => Promise<CommandResult>;
  
  // Agent management
  deployAgent: (issueNumber: number, repo: string) => Promise<void>;
  deployAgentWithContext: (issueNumberOrTask: number | string, repo: string, context: string) => Promise<void>;
  stopAgent: (issueNumber: number) => Promise<void>;
  getAgentStatus: (issueNumber: number) => Promise<AgentStatusResult | null>;
  getAllAgents: () => Promise<AgentInfo[]>;
  
  // Issue parsing
  parseIssuesFromText: (text: string) => Promise<ParsedIssue[]>;
  
  // Event listeners
  onOutput: (callback: (data: OutputData) => void) => Unsubscribe;
  onAgentStatus: (callback: (issueNumber: number, status: string, details?: string | AgentDetails) => void) => Unsubscribe;
  onAgentLog: (callback: (issueNumber: number, log: string | StructuredAgentLog) => void) => Unsubscribe;
  onAgentLogUpdate: (callback: (issueNumber: number, message: SDKMessage) => void) => Unsubscribe;
  onAgentAlreadyCompleted: (callback: (issueNumber: number, message: string) => void) => Unsubscribe;
  onRawOutput: (callback: (issueNumber: number, output: string) => void) => Unsubscribe;
  
  // Log file access
  readAgentLogFile: (issueNumber: number) => Promise<LogFileResult>;
}

// GitHub API
export interface GitHubAPI {
  // Repository operations
  getStatus: () => Promise<GitStatus>;
  listRepos: () => Promise<Repository[]>;
  
  // Issue operations
  listIssues: (repo: string) => Promise<Issue[]>;
  createIssue: (repo: string, title: string, body: string) => Promise<CreatedIssue>;
  updateIssue: (repo: string, issueNumber: number, title: string, body: string) => Promise<UpdatedIssue>;
  closeIssue: (repo: string, issueNumber: number) => Promise<OperationResult>;
  
  // Label operations
  addLabels: (repo: string, issueNumber: number, labels: string[]) => Promise<OperationResult>;
  removeLabels: (repo: string, issueNumber: number, labels: string[]) => Promise<OperationResult>;
  
  // Pull request operations
  listPullRequests: (repo: string) => Promise<GitHubPullRequest[]>;
  createBranch: (branchName: string) => Promise<BranchResult>;
  createPullRequest: (title: string, body: string) => Promise<CreatePRResult>;
  mergePullRequest: (prNumber: number) => Promise<MergeResult>;
  closePullRequest: (prNumber: number) => Promise<ClosePRResult>;
  
  // Event listeners
  onRepoUpdate: (callback: (data: RepoUpdateData) => void) => Unsubscribe;
  onIssueUpdate: (callback: (data: IssueUpdateData) => void) => Unsubscribe;
}

// System API
export interface SystemAPI {
  checkDependencies: () => Promise<CLIStatus>;
  openWorkspace: () => Promise<string>;
  onDependencyCheck: (callback: (status: DependencyStatus) => void) => Unsubscribe;
  onCLIStatus: (callback: (status: CLIStatus) => void) => Unsubscribe;
}

// Updater API
export interface UpdaterAPI {
  checkForUpdates: () => Promise<UpdateCheckResult>;
  downloadUpdate: () => Promise<DownloadResult>;
  installUpdate: () => Promise<InstallResult>;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => Unsubscribe;
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => Unsubscribe;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => Unsubscribe;
  onUpdateStatus: (callback: (status: string) => void) => Unsubscribe;
}

// Shell API
export interface ShellAPI {
  openExternal: (url: string) => Promise<void>;
}

// Claude API Types
export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}

export interface AgentStatusResult {
  issueNumber: number;
  status: AgentStatus;
  startTime: number;
  endTime?: number;
  error?: string;
}

export interface AgentInfo {
  issueNumber: number;
  repo: string;
  status: AgentStatus;
  startTime: number;
  endTime?: number;
  markedForCleanup?: boolean;
}

export interface AgentDetails {
  pr_url?: string;
  branch?: string;
  message?: string;
  [key: string]: string | undefined;
}

export interface OutputData {
  type: 'stdout' | 'stderr' | 'info' | 'error';
  message: string;
  timestamp?: number;
}

// GitHub API Types
export interface GitStatus {
  clean: boolean;
  output: string;
  error?: string;
}

export interface OperationResult {
  success: boolean;
  error?: string;
}

export interface UpdatedIssue extends OperationResult {
  issueNumber: number;
  title: string;
  body: string;
}

export interface BranchResult extends OperationResult {
  branch?: string;
}

export interface CreatePRResult extends OperationResult {
  url?: string;
  number?: number;
}

export interface MergeResult extends OperationResult {
  message?: string;
  warning?: string;
}

export interface ClosePRResult extends OperationResult {
  message?: string;
}

export interface RepoUpdateData {
  type: 'added' | 'removed' | 'updated';
  repo: Repository;
  timestamp: number;
}

export interface IssueUpdateData {
  type: 'created' | 'updated' | 'closed' | 'reopened';
  issue: Issue;
  repo: string;
  timestamp: number;
}

// System API Types
export interface DependencyStatus {
  git: boolean;
  gh: boolean;
  claude: boolean;
  node: boolean;
  npm: boolean;
  versions?: {
    git?: string;
    gh?: string;
    claude?: string;
    node?: string;
    npm?: string;
  };
}

// Updater API Types
export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  error?: string;
}

export interface DownloadResult {
  success: boolean;
  error?: string;
  bytesDownloaded?: number;
  totalBytes?: number;
}

export interface InstallResult {
  success: boolean;
  error?: string;
  requiresRestart?: boolean;
}

// Helper Types
export type Unsubscribe = () => void;

export interface ParsedIssue {
  title: string;
  body: string;
  labels: string[];
}

export interface CreatedIssue {
  number: number;
  title: string;
  url: string;
}

export interface LogFileResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  url: string;
  state: string;
  body?: string;
  createdAt: string;
}

export interface SDKMessage {
  type: 'system' | 'user' | 'assistant' | 'result' | 'error';
  subtype?: string;
  message?: {
    content?: MessageContent[];
    [key: string]: unknown;
  };
  model?: string;
  permissionMode?: string;
  error?: string;
  num_turns?: number;
  total_cost_usd?: number;
  timestamp?: string;
}

export interface MCPServer {
  name: string;
  version?: string;
  [key: string]: unknown;
}

export interface MessageContent {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  image?: {
    url: string;
    format?: string;
  };
  tool_use?: {
    id: string;
    name: string;
    input: unknown;
  };
  tool_result?: {
    tool_use_id: string;
    content: unknown;
  };
}

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseName?: string;
  releaseDate?: string;
}

export interface DownloadProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

// Global Window Declaration
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}