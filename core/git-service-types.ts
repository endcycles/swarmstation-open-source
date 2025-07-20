// Types for Git Service

import { BrowserWindow } from 'electron';

// GitHub API Response Types
export interface Repository {
  name: string;
  nameWithOwner: string;
  description?: string;
  isPrivate: boolean;
  url: string;
  defaultBranchRef?: {
    name: string;
  };
  primaryLanguage?: {
    name: string;
    color: string;
  };
  stargazerCount?: number;
  issues?: {
    totalCount: number;
  };
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED';
  author?: {
    login: string;
  };
  createdAt: string;
  updatedAt: string;
  labels?: {
    nodes: Array<{
      name: string;
      color: string;
    }>;
  };
  url?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  author?: {
    login: string;
  };
  createdAt: string;
  updatedAt: string;
  url?: string;
  headRefName?: string;
  baseRefName?: string;
  mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';
  isDraft?: boolean;
}

// Git Status Types
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  changes: string[];
  untracked: string[];
}

// CLI Check Result
export interface CLICheckResult {
  git: boolean;
  gh: boolean;
  ghAuth: boolean;
  error?: string;
}

// Module Types
export interface GitService {
  setWindow: (window: BrowserWindow | null) => void;
  checkCLI: () => Promise<CLICheckResult>;
  getStatus: () => Promise<GitStatus>;
  listRepositories: () => Promise<Repository[]>;
  listIssues: (repo: string) => Promise<Issue[]>;
  listPullRequests: (repo: string) => Promise<PullRequest[]>;
  createIssue: (repo: string, title: string, body: string) => Promise<Issue>;
  updateIssue: (repo: string, issueNumber: number, title: string, body: string) => Promise<Issue>;
  closeIssue: (repo: string, issueNumber: number) => Promise<Issue>;
  addLabels: (repo: string, issueNumber: number, labels: string[]) => Promise<void>;
  removeLabels: (repo: string, issueNumber: number, labels: string[]) => Promise<void>;
  createBranch: (branchName: string) => Promise<void>;
  createPullRequest: (title: string, body: string) => Promise<PullRequest>;
  mergePullRequest: (prNumber: number) => Promise<void>;
  closePullRequest: (prNumber: number) => Promise<void>;
  getPullRequest: (prNumber: number) => Promise<PullRequest>;
}