// Core Application Types for SwarmStation

// Import types from electron-api-types
import { SDKMessage } from './electron-api-types';

// Repository Types
export interface Repository {
  name: string;
  nameWithOwner: string;
  owner?: string;
  primaryLanguage?: {
    name: string;
  } | null;
  language?: string;
  isPrivate?: boolean;
  openIssuesCount?: number;
}

// Issue Types
export interface Issue {
  number: number;
  title: string;
  body?: string;
  labels?: Label[];
  state: string;
  createdAt: string;
  updatedAt?: string;
  author: {
    login: string;
  };
  assignees?: Assignee[];
}

export interface Label {
  name: string;
  color?: string;
}

export interface Assignee {
  login: string;
  id?: number;
  avatar_url?: string;
  url?: string;
}

// Agent Types
export interface Agent {
  issueNumber: number;
  status: AgentStatus;
  task: string;
  details: string;
  issue: Issue;
  startTime: number;
  endTime?: number;
  progress: number;
  lastUpdate?: string;
  lastUpdateTime?: number;
  hasFeedback?: boolean;
}

export type AgentStatus = 
  | 'starting' 
  | 'working' 
  | 'running'
  | 'completed' 
  | 'failed' 
  | 'stopped' 
  | 'stopping'
  | 'interrupted';

// Agent Log Types
export interface AgentLog {
  type: LogType;
  content: string;
  timestamp: number;
  message?: SDKMessage; // Optional SDK message for 'sdk' type logs
}

export interface SDKAgentLog extends AgentLog {
  type: 'sdk';
  message: SDKMessage;
}

export interface StructuredAgentLog {
  agentId: number;
  type: string;
  data: string;
  timestamp: string;
  status?: AgentStatus;
  progress?: number;
}

export type LogType = 'command' | 'output' | 'error' | 'success' | 'sdk';

export interface CompletedAgentLog {
  logs: AgentLog[];
  agent: Agent;
  completedAt: string;
}

// Pull Request Types
export interface PullRequest {
  id: number;
  number: number | null;
  title: string;
  url: string | null;
  state?: string;
  issue: number | { number: number };
  checks: string[];
  createdAt: string;
  body?: string;
}

// Activity Log Types
export interface ActivityLogItem {
  message: string;
  time: string;
}

// CLI Status Types
export interface CLIStatus {
  git: boolean;
  gh: boolean;
  ghAuthenticated: boolean;
  ghUser: string | null;
}

// Modal Types
export type ModalMode = 'create' | 'edit';

// Issue Creation Types
export interface IssueFormData {
  title: string;
  description: string;
  labels?: string[];
  issueNumber?: number;
}

export interface BulkIssue {
  title: string;
  body: string;
  labels: string[];
}

// Notification Types (imported from Notification component)
export interface NotificationProps {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration: number;
  onClose: (id: string) => void;
}

// State Management Types
export interface AppState {
  // Persisted state
  repositories: Repository[];
  selectedRepo: string;
  issues: Issue[];
  activityLog: ActivityLogItem[];
  agents: Record<number, Agent>;
  agentLogs: Record<number, AgentLog[]>;
  completedAgentLogs: Record<number, CompletedAgentLog>;
  
  // Non-persisted state
  selectedIssues: number[];
  loading: boolean;
  error: string;
  deletingIssues: Set<number>;
  isCreatingIssues: boolean;
  cliStatus: CLIStatus;
  showRepoSetupModal: boolean;
  showIssueModal: boolean;
  showBulkIssueCreatorModal: boolean;
  modalMode: ModalMode;
  editingIssue: Issue | null;
  initialLoading: boolean;
  repositoriesLoading: boolean;
  workflowActiveTab: TabName;
  notifications: NotificationProps[];
  showDeleteConfirm: boolean;
  issuesToDelete: number[];
  pullRequests: PullRequest[];
}

// Tab Types (imported from WorkflowPanel)
export type TabName = 'agents' | 'prs' | 'orchestration';

// Error Types
export interface APIError {
  error: string;
  message?: string;
}

// Response Types
export type IssueListResponse = Issue[] | APIError;
export type RepositoryListResponse = Repository[] | APIError;

// Utility Types
export type AsyncFunction<T = void> = () => Promise<T>;
export type Callback<T> = (data: T) => void;
export type Unsubscribe = () => void;