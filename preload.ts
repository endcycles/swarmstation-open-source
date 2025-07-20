import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Type definitions for IPC communication
type UnsubscribeFunction = () => void;

interface ClaudeAPI {
  runCommand: (command: string) => Promise<void>;
  deployAgent: (issueNumber: number, repo: string) => Promise<void>;
  deployAgentWithContext: (issueNumber: number, repo: string, context: string) => Promise<void>;
  parseIssuesFromText: (text: string) => Promise<any[]>;
  isClaudeAvailable: () => Promise<boolean>;
  getAgentStatus: (issueNumber: number) => Promise<any>;
  getAllAgents: () => Promise<any[]>;
  stopAgent: (issueNumber: number) => Promise<void>;
  readAgentLogFile: (issueNumber: number) => Promise<any>;
  
  // Event listeners
  onOutput: (callback: (data: any) => void) => UnsubscribeFunction;
  onAgentStatus: (callback: (issueNumber: number, status: string, details?: string) => void) => UnsubscribeFunction;
  onAgentLog: (callback: (issueNumber: number, data: any) => void) => UnsubscribeFunction;
  onAgentLogUpdate: (callback: (issueNumber: number, message: any) => void) => UnsubscribeFunction;
  onRawOutput: (callback: (issueNumber: number, output: string) => void) => UnsubscribeFunction;
  onAgentAlreadyCompleted: (callback: (issueNumber: number, message: string) => void) => UnsubscribeFunction;
}

interface GitHubAPI {
  getStatus: () => Promise<any>;
  listRepos: () => Promise<any[]>;
  listIssues: (repo: string) => Promise<any[]>;
  listPullRequests: (repo: string) => Promise<any[]>;
  createIssue: (repo: string, title: string, body: string) => Promise<any>;
  updateIssue: (repo: string, issueNumber: number, title: string, body: string) => Promise<any>;
  closeIssue: (repo: string, issueNumber: number) => Promise<any>;
  addLabels: (repo: string, issueNumber: number, labels: string[]) => Promise<void>;
  removeLabels: (repo: string, issueNumber: number, labels: string[]) => Promise<void>;
  createBranch: (branchName: string) => Promise<void>;
  createPullRequest: (title: string, body: string) => Promise<any>;
  mergePullRequest: (prNumber: number) => Promise<void>;
  closePullRequest: (prNumber: number) => Promise<void>;
  getPullRequest: (prNumber: number) => Promise<any>;
  
  // Event listeners
  onRepoUpdate: (callback: (data: any) => void) => UnsubscribeFunction;
  onIssueUpdate: (callback: (data: any) => void) => UnsubscribeFunction;
}

interface SystemAPI {
  checkDependencies: () => Promise<any>;
  openWorkspace: () => Promise<string>;
  
  // Event listeners
  onDependencyCheck: (callback: (status: any) => void) => UnsubscribeFunction;
  onCLIStatus: (callback: (status: any) => void) => UnsubscribeFunction;
  onCriticalError: (callback: (error: any) => void) => UnsubscribeFunction;
  onUpdateError: (callback: (error: any) => void) => UnsubscribeFunction;
}

interface ShellAPI {
  openExternal: (url: string) => Promise<void>;
}

interface UpdaterAPI {
  checkForUpdates: () => Promise<any>;
  downloadUpdate: () => Promise<any>;
  installUpdate: () => Promise<void>;
  
  // Event listeners
  onUpdateAvailable: (callback: (info: any) => void) => UnsubscribeFunction;
  onDownloadProgress: (callback: (progress: any) => void) => UnsubscribeFunction;
  onUpdateDownloaded: (callback: (info: any) => void) => UnsubscribeFunction;
  onUpdateStatus: (callback: (status: string) => void) => UnsubscribeFunction;
}

interface ElectronAPI {
  claude: ClaudeAPI;
  github: GitHubAPI;
  system: SystemAPI;
  shell: ShellAPI;
  updater: UpdaterAPI;
}

// Legacy API types
interface LegacyAPI {
  agents: {
    deploy: (issueNumbers: number[], repo: string) => Promise<void[]>;
    getStatus: () => Promise<any[]>;
    getLogs: (issueNumber: number) => Promise<any>;
    onStatusUpdate: (callback: (issueNumber: number, status: string) => void) => UnsubscribeFunction;
    onLog: (callback: (issueNumber: number, data: any) => void) => UnsubscribeFunction;
  };
  github: {
    listRepos: () => Promise<any[]>;
    listIssues: (repo: string) => Promise<any[]>;
    createIssue: (repo: string, title: string, body: string) => Promise<any>;
    updateIssue: (repo: string, issueNumber: number, title: string, body: string) => Promise<any>;
  };
  workspace: {
    open: () => Promise<string>;
  };
  getCliStatus: () => Promise<any>;
  onCliStatusChanged: (callback: (status: any) => void) => UnsubscribeFunction;
}

// Expose a secure, well-defined API to the UI (Renderer)
contextBridge.exposeInMainWorld('electronAPI', {
  // Claude operations
  claude: {
    // Run a claude command
    runCommand: (command: string) => ipcRenderer.invoke('claude:run', command),
    
    // Deploy an agent for an issue
    deployAgent: (issueNumber: number, repo: string) => ipcRenderer.invoke('claude:deploy-agent', issueNumber, repo),
    
    // Deploy an agent with additional context (e.g., PR feedback)
    deployAgentWithContext: (issueNumber: number, repo: string, context: string) => 
      ipcRenderer.invoke('claude:deploy-agent-with-context', issueNumber, repo, context),
    
    // Parse issues from text
    parseIssuesFromText: (text: string) => ipcRenderer.invoke('claude:parse-issues-from-text', text),
    
    // Check if Claude is available
    isClaudeAvailable: () => ipcRenderer.invoke('claude:is-available'),
    
    // Get status of a specific agent
    getAgentStatus: (issueNumber: number) => ipcRenderer.invoke('claude:get-agent-status', issueNumber),
    
    // Get all agents
    getAllAgents: () => ipcRenderer.invoke('claude:get-all-agents'),
    
    // Stop an agent
    stopAgent: (issueNumber: number) => ipcRenderer.invoke('claude:stop-agent', issueNumber),
    
    // Event listeners with cleanup
    onOutput: (callback: (data: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('claude:output', listener);
      return () => ipcRenderer.removeListener('claude:output', listener);
    },
    
    onAgentStatus: (callback: (issueNumber: number, status: string, details?: string) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, data: any) => {
        // Handle the agent-status-update event from backend
        callback(data.issueNumber, data.status, data.details);
      };
      ipcRenderer.on('agent-status-update', listener);
      return () => ipcRenderer.removeListener('agent-status-update', listener);
    },
    
    onAgentLog: (callback: (issueNumber: number, data: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, data: any) => {
        // Handle both agent-output and agent-error events
        callback(data.issueNumber, data.data);
      };
      ipcRenderer.on('agent-output', listener);
      ipcRenderer.on('agent-error', listener);
      return () => {
        ipcRenderer.removeListener('agent-output', listener);
        ipcRenderer.removeListener('agent-error', listener);
      };
    },
    
    onAgentLogUpdate: (callback: (issueNumber: number, message: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, data: any) => {
        // Handle SDK message updates
        callback(data.issueNumber, data.message);
      };
      ipcRenderer.on('agent-log-update', listener);
      return () => ipcRenderer.removeListener('agent-log-update', listener);
    },
    
    onRawOutput: (callback: (issueNumber: number, output: string) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, data: any) => {
        callback(data.issueNumber, data.output);
      };
      ipcRenderer.on('claude-raw-output', listener);
      return () => ipcRenderer.removeListener('claude-raw-output', listener);
    },
    
    onAgentAlreadyCompleted: (callback: (issueNumber: number, message: string) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, data: any) => {
        callback(data.issueNumber, data.message);
      };
      ipcRenderer.on('agent-already-completed', listener);
      return () => ipcRenderer.removeListener('agent-already-completed', listener);
    },
    
    // Read log file directly
    readAgentLogFile: (issueNumber: number) => ipcRenderer.invoke('claude:read-agent-log-file', issueNumber)
  } as ClaudeAPI,
  
  // GitHub operations
  github: {
    // Get git status
    getStatus: () => ipcRenderer.invoke('git:status'),
    
    // List repositories
    listRepos: () => ipcRenderer.invoke('git:list-repos'),
    
    // List issues for a repository
    listIssues: (repo: string) => ipcRenderer.invoke('git:list-issues', repo),
    
    // List pull requests for a repository
    listPullRequests: (repo: string) => ipcRenderer.invoke('git:list-prs', repo),
    
    // Create a new issue
    createIssue: (repo: string, title: string, body: string) => ipcRenderer.invoke('git:create-issue', repo, title, body),
    
    // Update an existing issue
    updateIssue: (repo: string, issueNumber: number, title: string, body: string) => 
      ipcRenderer.invoke('git:update-issue', repo, issueNumber, title, body),
    
    // Close an issue
    closeIssue: (repo: string, issueNumber: number) => ipcRenderer.invoke('git:close-issue', repo, issueNumber),
    
    // Add labels to an issue
    addLabels: (repo: string, issueNumber: number, labels: string[]) => 
      ipcRenderer.invoke('git:add-labels', repo, issueNumber, labels),
    
    // Remove labels from an issue
    removeLabels: (repo: string, issueNumber: number, labels: string[]) => 
      ipcRenderer.invoke('git:remove-labels', repo, issueNumber, labels),
    
    // Create a new branch
    createBranch: (branchName: string) => ipcRenderer.invoke('git:create-branch', branchName),
    
    // Create a pull request
    createPullRequest: (title: string, body: string) => ipcRenderer.invoke('git:create-pr', title, body),
    
    // Merge a pull request
    mergePullRequest: (prNumber: number) => ipcRenderer.invoke('git:merge-pr', prNumber),
    
    // Close a pull request
    closePullRequest: (prNumber: number) => ipcRenderer.invoke('git:close-pr', prNumber),
    
    // Get pull request details
    getPullRequest: (prNumber: number) => ipcRenderer.invoke('git:get-pr', prNumber),
    
    // Event listeners with cleanup
    onRepoUpdate: (callback: (data: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('git:repo-update', listener);
      return () => ipcRenderer.removeListener('git:repo-update', listener);
    },
    
    onIssueUpdate: (callback: (data: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, data: any) => callback(data);
      ipcRenderer.on('git:issue-update', listener);
      return () => ipcRenderer.removeListener('git:issue-update', listener);
    }
  } as GitHubAPI,
  
  // System operations
  system: {
    // Check if CLI dependencies are installed
    checkDependencies: () => ipcRenderer.invoke('system:check-dependencies'),
    
    // Open the workspace folder
    openWorkspace: () => ipcRenderer.invoke('system:open-workspace'),
    
    // Event listeners
    onDependencyCheck: (callback: (status: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, status: any) => callback(status);
      ipcRenderer.on('system:dependency-status', listener);
      return () => ipcRenderer.removeListener('system:dependency-status', listener);
    },
    
    onCLIStatus: (callback: (status: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, status: any) => callback(status);
      ipcRenderer.on('cli-status', listener);
      return () => ipcRenderer.removeListener('cli-status', listener);
    },
    
    // Listen for critical errors from main process
    onCriticalError: (callback: (error: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, error: any) => callback(error);
      ipcRenderer.on('critical-error', listener);
      return () => ipcRenderer.removeListener('critical-error', listener);
    },
    
    // Listen for update errors
    onUpdateError: (callback: (error: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, error: any) => callback(error);
      ipcRenderer.on('update-error', listener);
      return () => ipcRenderer.removeListener('update-error', listener);
    }
  } as SystemAPI,
  
  // Shell operations
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
  } as ShellAPI,
  
  // Auto-updater operations
  updater: {
    // Check for updates
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    
    // Download update
    downloadUpdate: () => ipcRenderer.invoke('updater:download'),
    
    // Install update and restart
    installUpdate: () => ipcRenderer.invoke('updater:install'),
    
    // Event listeners
    onUpdateAvailable: (callback: (info: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, info: any) => callback(info);
      ipcRenderer.on('update-available', listener);
      return () => ipcRenderer.removeListener('update-available', listener);
    },
    
    onDownloadProgress: (callback: (progress: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, progress: any) => callback(progress);
      ipcRenderer.on('download-progress', listener);
      return () => ipcRenderer.removeListener('download-progress', listener);
    },
    
    onUpdateDownloaded: (callback: (info: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, info: any) => callback(info);
      ipcRenderer.on('update-downloaded', listener);
      return () => ipcRenderer.removeListener('update-downloaded', listener);
    },
    
    onUpdateStatus: (callback: (status: string) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, status: string) => callback(status);
      ipcRenderer.on('update-status', listener);
      return () => ipcRenderer.removeListener('update-status', listener);
    }
  } as UpdaterAPI
} as ElectronAPI);

// Also expose a legacy API for backward compatibility if needed
contextBridge.exposeInMainWorld('api', {
  // Legacy agent management
  agents: {
    deploy: (issueNumbers: number[], repo: string) => {
      // Convert to new API - deploy each agent individually
      const promises = issueNumbers.map(issueNumber => 
        ipcRenderer.invoke('claude:deploy-agent', issueNumber, repo)
      );
      return Promise.all(promises);
    },
    getStatus: () => ipcRenderer.invoke('claude:get-all-agents'),
    getLogs: (issueNumber: number) => ipcRenderer.invoke('claude:get-agent-status', issueNumber),
    
    onStatusUpdate: (callback: (issueNumber: number, status: string) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, issueNumber: number, status: string) => callback(issueNumber, status);
      ipcRenderer.on('claude:agent-status', listener);
      return () => ipcRenderer.removeListener('claude:agent-status', listener);
    },
    
    onLog: (callback: (issueNumber: number, data: any) => void): UnsubscribeFunction => {
      const listener = (_event: IpcRendererEvent, data: any) => {
        // Handle both old format (issueNumber, log) and new format (structured data)
        if (data && typeof data === 'object' && data.agentId) {
          // New structured format from claude-service.js
          callback(data.agentId, data);
        } else {
          // Legacy format - assume first arg is issueNumber
          console.warn('Legacy agent-log format detected');
        }
      };
      ipcRenderer.on('agent-log', listener);
      return () => ipcRenderer.removeListener('agent-log', listener);
    }
  },
  
  // Legacy GitHub API
  github: {
    listRepos: () => ipcRenderer.invoke('git:list-repos'),
    listIssues: (repo: string) => ipcRenderer.invoke('git:list-issues', repo),
    createIssue: (repo: string, title: string, body: string) => ipcRenderer.invoke('git:create-issue', repo, title, body),
    updateIssue: (repo: string, issueNumber: number, title: string, body: string) => 
      ipcRenderer.invoke('git:update-issue', repo, issueNumber, title, body)
  },
  
  // Legacy workspace
  workspace: {
    open: () => ipcRenderer.invoke('system:open-workspace')
  },
  
  // Legacy system
  getCliStatus: () => ipcRenderer.invoke('system:check-dependencies'),
  onCliStatusChanged: (callback: (status: any) => void): UnsubscribeFunction => {
    const listener = (_event: IpcRendererEvent, status: any) => callback(status);
    ipcRenderer.on('system:dependency-status', listener);
    return () => ipcRenderer.removeListener('system:dependency-status', listener);
  }
} as LegacyAPI);

// Add types to the global Window interface
declare global {
  interface Window {
    electronAPI: ElectronAPI;
    api: LegacyAPI;
  }
}