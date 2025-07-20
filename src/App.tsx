import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import IssuesPanel from './components/IssuesPanel';
import WorkflowPanel from './components/WorkflowPanel';
import DetailsPanel from './components/DetailsPanel';
import RepoSetupModal from './components/RepoSetupModal';
import IssueModal from './components/IssueModal';
import BulkIssueModal from './components/BulkIssueModal';
import UpdateNotification from './components/UpdateNotification';
import NotificationManager from './components/NotificationManager';
import ErrorBoundary from './components/ErrorBoundary';
import { usePersistedState } from './hooks/usePersistedState';
import ConfirmDialog from './components/ConfirmDialog';
import { 
  deduplicatePRs, 
  syncPRsWithGitHub, 
  prExistsForIssue, 
  updatePR,
  extractIssueFromPR 
} from '../core/utils/prStateManager';
import { PRRecoveryManager, findOrphanedAgents } from '../core/utils/prRecovery';
import { AgentHealthMonitor, shouldAutoRestart } from '../core/utils/agentHealthMonitor';
import { clearCorruptedLocalStorageData } from '../core/utils/clearCorruptedData';
import { debugLocalStorage } from '../core/utils/debugStorage';
import { 
  TabName, 
  NotificationProps, 
  Repository, 
  Issue, 
  Agent, 
  AgentLog, 
  CompletedAgentLog,
  PullRequest,
  ActivityLogItem,
  CLIStatus,
  ModalMode,
  StructuredAgentLog
} from './types';
import { SDKMessage } from './types/electron-api-types';


function App() {
  // Clear corrupted data on startup
  React.useEffect(() => {
    const stored = localStorage.getItem('swarmstation_selectedRepo');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // If it's not a string, remove it
        if (typeof parsed !== 'string') {
          localStorage.removeItem('swarmstation_selectedRepo');
        }
      } catch (e) {
        // If we can't parse it, remove it
        localStorage.removeItem('swarmstation_selectedRepo');
      }
    }
  }, []);

  // Persisted state - survives app restarts
  const [repositories, setRepositories] = usePersistedState<Repository[]>('swarmstation_repositories', []);
  const [selectedRepo, setSelectedRepoRaw] = usePersistedState<string>('swarmstation_selectedRepo', '');
  
  // Wrapper to debug repository changes and validate
  const setSelectedRepo = (repo: string) => {
    
    // Validate repo format
    if (repo && !repo.includes('/')) {
      return;
    }
    
    setSelectedRepoRaw(repo);
  };
  const [issues, setIssues] = usePersistedState<Issue[]>('swarmstation_issues', []);
  const [pullRequests, setPullRequests] = usePersistedState<PullRequest[]>('swarmstation_pullRequests', []);
  const [activityLog, setActivityLog] = usePersistedState<ActivityLogItem[]>('swarmstation_activityLog', []);
  const [agents, setAgents] = usePersistedState<Record<number, Agent>>('swarmstation_agents', {}, (agents) => {
    // Clean up stale agent data on load
    const cleaned: Record<number, Agent> = {};
    let hasChanges = false;
    
    Object.entries(agents).forEach(([key, agent]) => {
      // Skip system keys like __timestamp
      if (key.startsWith('__')) {
        hasChanges = true;
        return;
      }
      
      // Only keep entries with numeric keys
      const issueNumber = parseInt(key);
      if (isNaN(issueNumber)) {
        hasChanges = true;
        return;
      }
      
      // Update agent status if needed
      if (agent.status === 'working' || 
          agent.status === 'starting' ||
          agent.status === 'running') {
        cleaned[issueNumber] = {
          ...agent,
          status: 'interrupted' as AgentStatus,
          endTime: Date.now(),
          details: 'Process interrupted (app closed)',
          progress: agent.progress || 0
        };
        hasChanges = true;
      } else {
        cleaned[issueNumber] = agent;
      }
    });
    
    return cleaned;
  });
  const [agentLogs, setAgentLogs] = usePersistedState<Record<number, AgentLog[]>>('swarmstation_agentLogs', {}, (logs) => {
    // Clean up any corrupted entries on load
    const cleaned: Record<number, AgentLog[]> = {};
    Object.entries(logs).forEach(([key, value]) => {
      // Skip system keys like __timestamp
      if (key.startsWith('__')) {
        return;
      }
      
      // Only keep entries with numeric keys and array values
      const issueNumber = parseInt(key);
      if (!isNaN(issueNumber) && Array.isArray(value)) {
        cleaned[issueNumber] = value;
      } else {
      }
    });
    return cleaned;
  });
  const [completedAgentLogs, setCompletedAgentLogs] = usePersistedState<Record<number, CompletedAgentLog>>('swarmstation_completedAgentLogs', {}, (logs) => {
    // Clean up any corrupted entries on load
    const cleaned: Record<number, CompletedAgentLog> = {};
    Object.entries(logs).forEach(([key, value]) => {
      // Skip system keys like __timestamp
      if (key.startsWith('__')) {
        return;
      }
      
      // Only keep entries with numeric keys and valid structure
      const issueNumber = parseInt(key);
      if (!isNaN(issueNumber) && value && typeof value === 'object' && 'logs' in value && Array.isArray(value.logs)) {
        cleaned[issueNumber] = value as CompletedAgentLog;
      } else {
      }
    });
    return cleaned;
  });
  
  // Non-persisted state - resets on app restart
  const [selectedIssues, setSelectedIssues] = useState<number[]>([]);
  const [loading, setLoading] = useState(true); // Start with loading true
  const [error, setError] = useState('');
  const [closingIssues, setClosingIssues] = useState<Set<number>>(new Set()); // Track issues being closed
  const [isCreatingIssues, setIsCreatingIssues] = useState(false);
  const [cliStatus, setCliStatus] = useState<CLIStatus>({
    git: false,
    gh: false,
    ghAuthenticated: false,
    ghUser: null
  });
  const [hasReceivedCliStatus, setHasReceivedCliStatus] = useState(false);
  const [showRepoSetupModal, setShowRepoSetupModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showBulkIssueCreatorModal, setShowBulkIssueCreatorModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingIssue, setEditingIssue] = useState<Issue | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [repositoriesLoading, setRepositoriesLoading] = useState(true); // Track repos loading state
  const [workflowActiveTab, setWorkflowActiveTab] = useState<TabName>('agents');
  const [notifications, setNotifications] = useState<NotificationProps[]>([]);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [issuesToClose, setIssuesToClose] = useState<number[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployingIssues, setDeployingIssues] = useState<Set<number>>(new Set());
  const deployingIssuesRef = useRef<Set<number>>(new Set()); // For immediate tracking
  const prRecoveryManagerRef = useRef<PRRecoveryManager | null>(null);
  const agentHealthMonitorRef = useRef<AgentHealthMonitor | null>(null);

  const showRepoSetup = () => setShowRepoSetupModal(true);
  const hideRepoSetup = () => setShowRepoSetupModal(false);
  const showBulkIssueCreator = () => setShowBulkIssueCreatorModal(true);
  const hideBulkIssueCreator = () => setShowBulkIssueCreatorModal(false);
  
  // Notification helper functions
  const addNotification = (message: string, type: NotificationProps['type'] = 'info', duration: number = 3000) => {
    // Check if we already have a notification with the same message
    setNotifications(prev => {
      const exists = prev.some(n => n.message === message);
      if (exists) return prev;
      
      const id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
      return [...prev, { id, message, type, duration, onClose: removeNotification }];
    });
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };
  
  const clearOrchestrationLogs = () => {
    setAgentLogs({});
    setCompletedAgentLogs({});
  };

  const showCreateIssue = () => {
    setModalMode('create');
    setEditingIssue(null);
    setShowIssueModal(true);
  };
  
  const showEditIssue = (issue: Issue) => {
    setModalMode('edit');
    setEditingIssue(issue);
    setShowIssueModal(true);
  };
  
  const hideIssueModal = () => {
    setShowIssueModal(false);
    setEditingIssue(null);
  };

  const handleIssueSubmit = async ({ title, description, labels, issueNumber }: { title: string; description: string; labels?: string[]; issueNumber?: number }) => {
    if (issueNumber) {
      // Edit mode
      await handleEditIssue(issueNumber, { title, body: description, labels: labels || [] });
    } else {
      // Create mode
      await handleCreateIssue({ title, description, labels: labels || [] });
    }
  };

  const handleCreateIssue = async ({ title, description, labels }: { title: string; description: string; labels: string[] }) => {
    if (!selectedRepo) {
      addActivity('Error: No repository selected');
      return;
    }

    try {
      // Create issue using GitHub API with just the description
      const result = await window.electronAPI.github.createIssue(selectedRepo, title, description);
      
      
      // The GitHub API returns the created issue with all details
      const newIssue = {
        number: result.number || Date.now(), // Fallback if number parsing fails
        title: result.title || title,
        body: description, // Include the body we sent
        labels: labels.map(label => ({ name: label })),
        state: 'OPEN',
        createdAt: new Date().toISOString(),
        author: { login: cliStatus.ghUser || 'unknown' }
      };
      
      // Add to local state immediately
      setIssues(prev => {
        // Remove any existing issue with the same number (shouldn't happen but just in case)
        const filtered = prev.filter(issue => issue.number !== newIssue.number);
        return [newIssue, ...filtered];
      });
      addActivity(`Created new issue #${newIssue.number}: ${newIssue.title}`);
      addNotification(`Issue #${newIssue.number} created successfully`, 'success');
      
      // Refresh issues list to get the latest data from GitHub
      loadIssues();
      
      // Add labels to the issue using GitHub API
      if (labels && labels.length > 0 && result.number) {
        try {
          await window.electronAPI.github.addLabels(selectedRepo, result.number, labels);
          addActivity(`Added labels to issue #${result.number}`);
        } catch (labelError) {
          addActivity(`Issue #${result.number} created, but some labels couldn't be added`);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      addActivity(`Error creating issue: ${errorMessage}`);
      addNotification('Failed to create issue', 'error');
    }
  };

  const handleEditIssue = async (issueNumber: number, { title, body, labels }: { title: string; body: string; labels?: string[] }) => {
    if (!selectedRepo) {
      addActivity('Error: No repository selected');
      return;
    }

    try {
      
      // Update issue using GitHub API
      const result = await window.electronAPI.github.updateIssue(selectedRepo, issueNumber, title, body);
      
      
      // Update local state immediately with all fields
      setIssues(prev => prev.map(issue => 
        issue.number === issueNumber 
          ? { 
              ...issue, 
              title, 
              body,
              labels: labels ? labels.map(label => ({ name: label })) : issue.labels,
              updatedAt: new Date().toISOString()
            }
          : issue
      ));
      
      addActivity(`Updated issue #${issueNumber}: ${title}`);
      
      // Update labels if provided
      if (labels) {
        try {
          // First remove all existing labels
          const issue = issues.find(i => i.number === issueNumber);
          const existingLabels = issue?.labels?.map(l => l.name) || [];
          if (existingLabels.length > 0) {
            await window.electronAPI.github.removeLabels(selectedRepo, issueNumber, existingLabels);
          }
          
          // Then add the new labels
          if (labels.length > 0) {
            await window.electronAPI.github.addLabels(selectedRepo, issueNumber, labels);
          }
        } catch (labelError) {
          addActivity(`Warning: Issue updated but failed to update labels`);
        }
      }
      
      // Refresh issues list to get the latest data from GitHub
      loadIssues();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      addActivity(`Error updating issue: ${errorMessage}`);
      throw error; // Re-throw to handle in modal
    }
  };

  const handleCloseIssue = async (issueNumber: number) => {
    if (!selectedRepo) {
      addActivity('Error: No repository selected');
      return;
    }

    // Close modal immediately for better UX
    hideIssueModal();
    
    // Add to closing set to show loading state
    setClosingIssues(prev => new Set(prev).add(issueNumber));
    
    try {
      // Close issue using GitHub API
      await window.electronAPI.github.closeIssue(selectedRepo, issueNumber);
      
      // Remove from local state
      setIssues(prev => prev.filter(issue => issue.number !== issueNumber));
      
      addActivity(`Closed issue #${issueNumber}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      addActivity(`Error closing issue: ${errorMessage}`);
      
      // Remove from deleting set on error
      setClosingIssues(prev => {
        const newSet = new Set(prev);
        newSet.delete(issueNumber);
        return newSet;
      });
    }
  };

  // Bulk issue creation handlers
  const handleParseIssues = async (text: string) => {
    try {
      const parsedIssues = await window.electronAPI.claude.parseIssuesFromText(text);
      return parsedIssues;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addActivity(`Error parsing issues: ${errorMessage}`);
      return [];
    }
  };

  const handleCreateBulkIssues = async (issues: Array<{title: string; body: string; labels: string[]}>) => {
    if (!selectedRepo) {
      addActivity('Error: No repository selected');
      return;
    }
    
    setIsCreatingIssues(true);
    const createdIssues = [];
    const errors = [];
    
    for (const issue of issues) {
      try {
        const result = await window.electronAPI.github.createIssue(
          selectedRepo, 
          issue.title, 
          issue.body
        );
        
        if (issue.labels?.length > 0) {
          await window.electronAPI.github.addLabels(selectedRepo, result.number, issue.labels);
        }
        
        createdIssues.push(result);
        addActivity(`Created issue #${result.number}: ${issue.title}`);
      } catch (error) {
        errors.push({ issue, error: error.message });
        addActivity(`Failed to create issue "${issue.title}": ${error.message}`);
      }
    }
    
    // Refresh issues list
    await loadIssues();
    setIsCreatingIssues(false);
    
    // Report final results
    if (createdIssues.length > 0) {
      addNotification(`Created ${createdIssues.length} issues successfully`, 'success');
    }
    if (errors.length > 0) {
      addNotification(`Failed to create ${errors.length} issues`, 'error');
    }
  };

  // Bulk close issues handler
  const handleBulkCloseIssues = async (issueNumbers: number[]) => {
    if (!selectedRepo) {
      addActivity('Error: No repository selected');
      return;
    }

    // Store the issues to close and show confirmation dialog
    setIssuesToClose(issueNumbers);
    setShowCloseConfirm(true);
  };

  // Confirm bulk close handler
  const confirmBulkClose = async () => {
    setShowCloseConfirm(false);
    
    setClosingIssues(prev => {
      const newSet = new Set(prev);
      issuesToClose.forEach(num => newSet.add(num));
      return newSet;
    });
    
    const errors = [];
    for (const issueNumber of issuesToClose) {
      try {
        await window.electronAPI.github.closeIssue(selectedRepo, issueNumber);
        addActivity(`Closed issue #${issueNumber}`);
      } catch (error) {
        errors.push({ issueNumber, error: error.message });
        addActivity(`Failed to close issue #${issueNumber}: ${error.message}`);
      }
    }
    
    setClosingIssues(prev => {
      const newSet = new Set(prev);
      issuesToClose.forEach(num => newSet.delete(num));
      return newSet;
    });
    
    await loadIssues();
    
    if (errors.length > 0) {
      addNotification(`Failed to close ${errors.length} issues`, 'error');
    } else {
      addNotification(`Successfully closed ${issuesToClose.length} issues`, 'success');
    }
    
    setSelectedIssues([]);
    setIssuesToClose([]);
  };

  const addActivity = (message: string) => {
    const { sanitizeActivityMessage } = require('../core/utils/sanitizer');
    const sanitizedMessage = sanitizeActivityMessage(message);
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setActivityLog(prev => {
      // Ensure prev is an array
      const activities = Array.isArray(prev) ? prev : [];
      return [{
        message: sanitizedMessage,
        time
      }, ...activities.slice(0, 9)]; // Keep last 10 activities
    });
  };

  const updateMetrics = () => {
    const activeCount = Object.keys(agents).length;
    const completedCount = pullRequests.length; // Assuming pullRequests is an array
    const timeSaved = completedCount * 45; // 45 min per issue average

    // These values will be passed as props to Header and DetailsPanel
    // No direct DOM manipulation here
  };

  // Cleanup is now handled in the usePersistedState initialization

  // Load repositories on mount
  useEffect(() => {
    // Check if electronAPI is available
    if (!window.electronAPI) {
      setError('Electron API not available. Please ensure the app is running in Electron.');
      return;
    }
    
    // Check CLI status immediately (only once)
    if (!hasReceivedCliStatus) {
      window.electronAPI.system.checkDependencies();
    }
    
    // Add keyboard shortcut for testing setup modal (Cmd/Ctrl + Shift + S)
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        setShowRepoSetupModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    
    // Set up event listeners
    const unsubscribeAgentStatus = window.electronAPI.claude.onAgentStatus((issueNumber, status, details) => {
      
      setAgents(prev => {
        // Initialize agent if it doesn't exist yet
        if (!prev[issueNumber]) {
          const issue = issues.find(i => i.number === issueNumber);
          prev[issueNumber] = {
            issueNumber,
            status: 'starting',
            task: details || 'Initializing...',
            details: details || 'Initializing...',
            issue: issue || { number: issueNumber, title: `Issue #${issueNumber}` },
            startTime: Date.now(),
            progress: 0
          };
        }
        
        // Don't update if we're trying to complete an agent that doesn't exist
        if (!prev[issueNumber]) {
          return prev;
        }

        // For all statuses, update the agent first
        const updatedAgents = {
          ...prev,
          [issueNumber]: { 
            ...prev[issueNumber], 
            status, 
            task: details || prev[issueNumber].task,
            details: details || prev[issueNumber].details,
            lastUpdate: new Date().toISOString(),
            progress: status === 'working' ? 50 : status === 'completed' ? 100 : prev[issueNumber].progress || 0,
            endTime: status === 'completed' ? Date.now() : prev[issueNumber].endTime
          }
        };

        // If status is completed, handle PR creation
        if (status === 'completed') {
          
          // Add a subtle indication that agent completed
          addActivity(`Agent #${issueNumber} completed successfully`);
          
          // Clear health monitoring data for completed agent
          agentHealthMonitorRef.current?.clearAgent(issueNumber);
          
          // Check if all agents are done
          const activeAgents = Object.values(updatedAgents).filter(a => 
            a.status === 'working' || a.status === 'starting' || a.status === 'running'
          );
          
          // If no more active agents and we're on the agents tab, switch to PRs
          if (activeAgents.length === 0 && workflowActiveTab === 'agents') {
            setWorkflowActiveTab('prs');
          }
          
          // Check if PR was already created for this issue
          if (!prExistsForIssue(pullRequests, issueNumber)) {
            // Create a PR when completed
            const issue = issues.find(i => i.number === issueNumber);
            const newPr = {
              id: pullRequests.length > 0 ? Math.max(...pullRequests.map(p => p.id)) + 1 : 1,
              number: null, // Will be updated when PR URL is detected
              issue: issueNumber,
              title: `Fix issue #${issueNumber}: ${issue?.title || 'Automated fix'}`,
              state: 'PENDING',
              checks: ['Tests', 'Lint', 'Build'],
              createdAt: new Date().toISOString(),
              url: null, // Will be updated when PR URL is detected
              body: `Fixes #${issueNumber}\n\nAutomated fix by SwarmStation agent.`
            };
            setPullRequests(prevPrs => deduplicatePRs([...prevPrs, newPr]));
            addActivity(`PR created for issue #${issueNumber}`);
            
            // Immediately check for real PRs (silently)
            setTimeout(() => checkForRealPRs(false), 1000);
          }
        }
        
        return updatedAgents;
      });
    });

    const unsubscribeAgentLog = window.electronAPI.claude.onAgentLog((issueNumber, log) => {
      
      // Record activity for health monitoring
      agentHealthMonitorRef.current?.recordActivity(issueNumber);
      
      // Handle new structured log format from claude-service.js
      if (typeof log === 'object' && log.agentId) {
        const { agentId, type, data, timestamp, status, progress } = log as StructuredAgentLog;
        
        // Update agent progress and status if provided
        if (progress !== undefined || status) {
          setAgents(prev => {
            if (!prev[agentId]) return prev;
            
            return {
              ...prev,
              [agentId]: {
                ...prev[agentId],
                progress: progress !== undefined ? progress : prev[agentId].progress || 0,
                status: status || prev[agentId].status || 'working',
                lastUpdate: data,
                lastUpdateTime: timestamp
              }
            };
          });
        }
        
        // Check if this log contains a PR URL
        const prUrlMatch = data.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/(\d+)/);
        if (prUrlMatch) {
          const prNumber = parseInt(prUrlMatch[1]);
          const prUrl = prUrlMatch[0];
          
          // Update the PR with the actual URL and number
          setPullRequests(prev => updatePR(prev, { issue: agentId }, { 
            url: prUrl, 
            number: prNumber,
            state: 'OPEN'
          }));
          
          addActivity(`PR #${prNumber} created: ${prUrl}`);
          
          // Immediately check for all PRs to ensure we have the latest data
          setTimeout(checkForRealPRs, 500);
        }
        
        // Create a properly formatted log entry
        const logEntry = {
          type: type || 'output',
          content: data,
          timestamp: timestamp ? new Date(timestamp).getTime() : Date.now()
        };
        
        setAgentLogs(prev => {
          const existingLogs = prev[agentId] || [];
          // Limit logs to last 1000 entries per agent to prevent localStorage overflow
          const updatedLogs = [...existingLogs, logEntry].slice(-1000);
          
          const newLogs = {
            ...prev,
            [agentId]: updatedLogs
          };
          return newLogs;
        });
        
        return; // Exit early for new format
      }
      
      // Legacy format handling (backward compatibility)
      // Check if this log contains a PR URL
      if (typeof log === 'string') {
        const prUrlMatch = log.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/(\d+)/);
        if (prUrlMatch) {
          const prNumber = parseInt(prUrlMatch[1]);
          const prUrl = prUrlMatch[0];
          
          // Update the PR with the actual URL and number
          setPullRequests(prev => updatePR(prev, { issue: issueNumber }, { 
            url: prUrl, 
            number: prNumber,
            state: 'OPEN'
          }));
          
          addActivity(`PR #${prNumber} created: ${prUrl}`);
          
          // Immediately check for all PRs to ensure we have the latest data (silently)
          setTimeout(() => checkForRealPRs(false), 500);
        }
      
        // Create a properly formatted log entry with better type detection
        let logType: LogType = 'output';
        
        // Command detection - more comprehensive
        if (log.startsWith('$') || 
            log.match(/^(git|gh|npm|yarn|node|python|pip|make|cd|ls|cat|echo|mkdir|rm|cp|mv|curl|wget)\s/) ||
            log.includes('Executing:') ||
            log.includes('Running:') ||
            log.includes('[DEPLOY]') ||
            log.includes('[COMMAND]')) {
          logType = 'command';
        }
        // Error detection - more patterns
        else if (log.includes('ERROR') || 
                 log.includes('Error:') ||
                 log.includes('error:') ||
                 log.includes('failed') ||
                 log.includes('Failed') ||
                 log.includes('FAILED') ||
                 log.includes('Exception') ||
                 log.includes('Traceback') ||
                 log.includes('[ERROR]') ||
                 log.match(/^\s*at\s+/)) { // Stack traces
          logType = 'error';
          // Record error for health monitoring
          agentHealthMonitorRef.current?.recordError(issueNumber);
        }
        // Success detection
        else if (log.includes('✓') || 
                 log.includes('✔') ||
                 log.includes('success') ||
                 log.includes('Success') ||
                 log.includes('completed') ||
                 log.includes('Completed') ||
                 log.includes('[SUCCESS]') ||
                 log.includes('PASSED') ||
                 log.includes('OK')) {
          logType = 'success';
        }
        
        const logEntry: AgentLog = {
          type: logType,
          content: log,
          timestamp: Date.now()
        };
        
        setAgentLogs(prev => {
          const existingLogs = prev[issueNumber] || [];
          // Limit logs to last 1000 entries per agent to prevent localStorage overflow
          const updatedLogs = [...existingLogs, logEntry].slice(-1000);
          
          const newLogs = {
            ...prev,
            [issueNumber]: updatedLogs
          };
          return newLogs;
        });
      }
    });

    const unsubscribeAgentLogUpdate = window.electronAPI.claude.onAgentLogUpdate((issueNumber, message) => {
      
      // Check if this message contains a PR URL
      if (message.type === 'assistant' && message.message && message.message.content) {
        const contentStr = JSON.stringify(message.message.content);
        const prUrlMatch = contentStr.match(/https:\/\/github\.com\/[^\/]+\/[^\/]+\/pull\/(\d+)/);
        if (prUrlMatch) {
          const prNumber = parseInt(prUrlMatch[1]);
          const prUrl = prUrlMatch[0];
          
          // Update the PR with the actual URL and number
          setPullRequests(prev => updatePR(prev, { issue: issueNumber }, { 
            url: prUrl, 
            number: prNumber,
            state: 'OPEN'
          }));
          
          addActivity(`PR #${prNumber} created: ${prUrl}`);
          
          // Immediately check for all PRs to ensure we have the latest data (silently)
          setTimeout(() => checkForRealPRs(false), 500);
        }
      }
      
      // Store the structured SDK message
      const logEntry = {
        type: 'sdk',
        message: message,
        timestamp: Date.now()
      };
      
      setAgentLogs(prev => {
        const existingLogs = prev[issueNumber] || [];
        // Limit logs to last 1000 entries per agent to prevent localStorage overflow
        const updatedLogs = [...existingLogs, logEntry].slice(-1000);
        
        const newLogs = {
          ...prev,
          [issueNumber]: updatedLogs
        };
        return newLogs;
      });
    });

    const unsubscribeCliStatus = window.electronAPI.system.onCLIStatus((status) => {
      setCliStatus(status);
      setHasReceivedCliStatus(true);
      
      // Check both field names since backend might send either
      const isAuthenticated = status.ghAuthenticated || status.ghAuth;
      
      // Only show setup modal if we've received a status and auth is really missing
      // Don't show on first false status as it might be initial state
      if (!status.gh || !isAuthenticated) {
        // Only show modal after initial loading is done to avoid flashing
        if (!initialLoading) {
          setShowRepoSetupModal(true);
        }
        setLoading(false); // Not loading issues if setup needed
      } else {
        // We're authenticated, only hide the modal if we have a selected repository
        if (selectedRepo) {
          setShowRepoSetupModal(false);
        }
        // Update the cliStatus to have ghAuthenticated
        if (!status.ghAuthenticated && status.ghAuth) {
          setCliStatus(prev => ({ ...prev, ghAuthenticated: true }));
        }
      }
      setInitialLoading(false);
    });
    
    const unsubscribeAlreadyCompleted = window.electronAPI.claude.onAgentAlreadyCompleted((issueNumber, message) => {
      
      // Remove the pending PR for this issue
      setPullRequests(prev => prev.filter(pr => {
        const prIssue = typeof pr.issue === 'number' ? pr.issue : pr.issue?.number;
        if (prIssue === issueNumber && !pr.number) {
          addActivity(`Issue #${issueNumber} was already completed`);
          return false;
        }
        return true;
      }));
    });
    
    // Listen for critical errors from main process
    const unsubscribeCriticalError = window.electronAPI.system.onCriticalError((error) => {
      addNotification(`Critical error: ${error.message || 'Unknown error occurred'}`, 'error', 10000);
      addActivity(`⚠️ Critical error: ${error.type} - ${error.details || 'Check logs for details'}`);
    });
    
    // Listen for update errors
    const unsubscribeUpdateError = window.electronAPI.system.onUpdateError((error) => {
      // Only show update errors if they're critical or contain certain keywords
      if (error.message?.includes('critical') || error.message?.includes('failed')) {
        addNotification(`Update check failed: ${error.message}`, 'warning', 5000);
      }
    });

    // Initialize PR Recovery Manager
    if (!prRecoveryManagerRef.current && window.electronAPI) {
      prRecoveryManagerRef.current = new PRRecoveryManager({
        electronAPI: window.electronAPI,
        onRecovered: (issueNumber, pr) => {
          setPullRequests(prev => {
            // Remove any pending PR for this issue
            const filtered = prev.filter(p => {
              const prIssue = typeof p.issue === 'number' ? p.issue : p.issue?.number;
              return !(prIssue === issueNumber && !p.number);
            });
            // Add the recovered PR
            return deduplicatePRs([...filtered, pr]);
          });
          addNotification(`PR recovered for issue #${issueNumber}`, 'success');
        },
        onFailed: (issueNumber, error) => {
          addNotification(`Failed to recover PR for issue #${issueNumber}: ${error}`, 'error');
        },
        addActivity
      });
    }
    
    // Initialize Agent Health Monitor
    if (!agentHealthMonitorRef.current) {
      agentHealthMonitorRef.current = new AgentHealthMonitor({
        onUnhealthy: async (status) => {
          
          if (shouldAutoRestart(status)) {
            addActivity(`Auto-restarting unhealthy agent #${status.issueNumber}: ${status.details}`);
            
            // Attempt to restart the agent
            try {
              await retryAgent(status.issueNumber);
              addNotification(`Agent #${status.issueNumber} restarted successfully`, 'success');
            } catch (error) {
              addNotification(`Failed to restart agent #${status.issueNumber}`, 'error');
            }
          } else {
            addNotification(`Agent #${status.issueNumber} needs attention: ${status.details}`, 'warning');
          }
        },
        addActivity
      });
      
      // Start monitoring with current agents
      agentHealthMonitorRef.current.start(() => agents);
    }

    return () => {
      unsubscribeAgentStatus();
      unsubscribeAgentLog();
      unsubscribeAgentLogUpdate();
      unsubscribeCliStatus();
      unsubscribeAlreadyCompleted();
      unsubscribeCriticalError();
      unsubscribeUpdateError();
      window.removeEventListener('keydown', handleKeyPress);
      prRecoveryManagerRef.current?.stop();
      agentHealthMonitorRef.current?.stop();
    };
  }, []);

  // Update metrics whenever agents or pullRequests change
  useEffect(() => {
    updateMetrics();
  }, [agents, pullRequests]);
  
  // Remove completed agents - track which ones we've already scheduled for removal
  const scheduledForRemoval = useRef(new Set());
  
  // Track pending worktree cleanups to prevent duplicates
  const pendingCleanups = useRef(new Set<number>());
  
  useEffect(() => {
    Object.entries(agents).forEach(([issueNumber, agent]) => {
      
      if (agent.status === 'completed' && !scheduledForRemoval.current.has(issueNumber)) {
        scheduledForRemoval.current.add(issueNumber);
        
        // Auto-remove completed agents after 30 seconds
        const timeoutId = setTimeout(() => {
          
          // Get current logs at time of removal
          setAgentLogs(currentLogs => {
            setCompletedAgentLogs(prev => ({
              ...prev,
              [issueNumber]: {
                logs: currentLogs[issueNumber] || [],
                agent: agent,
                completedAt: new Date().toISOString()
              }
            }));
            
            // Remove from active logs
            const { [issueNumber]: _, ...restLogs } = currentLogs;
            return restLogs;
          });
          
          // Remove from active agents
          setAgents(prev => {
            const { [issueNumber]: _, ...restAgents } = prev;
            return restAgents;
          });
          
          // Clean up tracking
          scheduledForRemoval.current.delete(issueNumber);
        }, 30000); // 30 seconds
        
      }
    });
  }, [agents]); // Run whenever agents change

  // Load repositories when CLI becomes available
  useEffect(() => {
    // Only proceed if we've received at least one CLI status update
    if (hasReceivedCliStatus && cliStatus.gh && cliStatus.ghAuthenticated) {
      loadRepositories();
      // If we have a persisted selected repo, refresh its issues
      if (selectedRepo) {
        loadIssues();
      }
    }
  }, [hasReceivedCliStatus, cliStatus.gh, cliStatus.ghAuthenticated]);

  // Load repositories
  const loadRepositories = async () => {
    try {
      setRepositoriesLoading(true);
      if (!window.electronAPI || !window.electronAPI.github) {
        setError('GitHub API not available');
        return;
      }
      
      const repos = await window.electronAPI.github.listRepos();
      if (Array.isArray(repos)) {
        setRepositories(repos);
        if (repos.length > 0) {
          if (!selectedRepo) {
            setSelectedRepo(repos[0].nameWithOwner);
          } else {
            // Check if the selected repo still exists in the list
            const repoStillExists = repos.some(r => r.nameWithOwner === selectedRepo);
            if (repoStillExists) {
            } else {
              setSelectedRepo(repos[0].nameWithOwner);
            }
          }
        }
      } else if (repos && typeof repos === 'object' && 'error' in repos) {
        setError((repos as any).error);
        setRepositories([]);
      } else {
        setRepositories([]);
      }
    } catch (err) {
      const error = err as Error;
      setError('Failed to load repositories: ' + error.message);
      setRepositories([]);
    } finally {
      setRepositoriesLoading(false);
    }
  };

  // Load issues when repository changes
  useEffect(() => {
    if (selectedRepo) {
      loadIssues();
    } else {
      // If no repo selected, set loading to false
      setLoading(false);
    }
  }, [selectedRepo]);

  const loadIssuesRef = useRef(false);
  const loadIssues = async () => {
    if (!selectedRepo || typeof selectedRepo !== 'string' || !selectedRepo.includes('/')) {
      setIssues([]);
      return;
    }
    
    
    // Prevent duplicate requests
    if (loadIssuesRef.current) {
      return;
    }
    
    loadIssuesRef.current = true;
    setLoading(true);
    setError('');
    
    try {
      const issueList = await window.electronAPI.github.listIssues(selectedRepo);
      if (Array.isArray(issueList)) {
        setIssues(issueList);
      } else if (issueList && typeof issueList === 'object' && 'error' in issueList) {
        setError((issueList as any).error);
        setIssues([]);
      } else {
        setIssues([]);
      }
    } catch (err) {
      const error = err as Error;
      setError('Failed to load issues: ' + error.message);
      setIssues([]);
    } finally {
      setLoading(false);
      loadIssuesRef.current = false;
    }
    
    // Also check for real PRs after loading issues (silently)
    // Only if we have a valid repo selected
    if (selectedRepo && selectedRepo.includes('/')) {
      // Delay to ensure API is ready
      setTimeout(() => checkForRealPRs(false), 1000);
    }
  };
  
  const checkForRealPRs = async (showNotifications = true) => {
    if (!selectedRepo) {
      return;
    }
    
    // Check if electronAPI is available
    if (!window.electronAPI || !window.electronAPI.github) {
      if (showNotifications) {
        addNotification('GitHub API not available', 'error');
      }
      return;
    }
    
    try {
      
      // Validate selectedRepo format
      if (!selectedRepo || typeof selectedRepo !== 'string' || !selectedRepo.includes('/')) {
        if (showNotifications) {
          addNotification('Invalid repository selected', 'error');
        }
        return;
      }
      
      const realPRs = await window.electronAPI.github.listPullRequests(selectedRepo);
      
      setPullRequests(prev => {
        // Ensure prev is an array
        const currentPRs = Array.isArray(prev) ? prev : [];
        
        // Process GitHub PRs to extract issue numbers
        const processedGitHubPRs = realPRs.map(realPR => {
          const extractedIssue = extractIssueFromPR(realPR);
          
          return {
            id: realPR.number,
            number: realPR.number,
            title: realPR.title,
            url: realPR.url,
            state: realPR.state,
            issue: extractedIssue,
            checks: [],
            createdAt: realPR.createdAt,
            body: realPR.body
          };
        });
        
        // Data recovery: Update existing PRs that might be missing issue field
        const recoveredPRs = currentPRs.map(pr => {
          if (!pr.issue && pr.number) {
            const extractedIssue = extractIssueFromPR(pr);
            if (extractedIssue) {
              return { ...pr, issue: extractedIssue };
            }
          }
          return pr;
        });
        
        // Sync local PRs with GitHub PRs
        const syncedPRs = syncPRsWithGitHub(recoveredPRs, processedGitHubPRs);
        
        // Show notification
        if (showNotifications) {
          const newCount = processedGitHubPRs.length - currentPRs.filter(pr => pr.number).length;
          if (realPRs.length === 0 && syncedPRs.length === 0) {
            addNotification('No pull requests found', 'info');
          } else if (newCount > 0) {
            addNotification(`Found ${newCount} new pull request${newCount > 1 ? 's' : ''}`, 'success');
          }
        }
        
        return syncedPRs;
      });
    } catch (error) {
      if (showNotifications) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        addNotification(`Failed to check for pull requests: ${errorMessage}`, 'error');
      }
    }
  };
  
  // Expose function globally for debugging
  React.useEffect(() => {
    (window as any).checkForRealPRs = checkForRealPRs;
    (window as any).setPRNumber = (issueNum: number, prNum: number) => {
      setPullRequests(prev => prev.map(pr => {
        if ((typeof pr.issue === 'number' ? pr.issue : pr.issue?.number) === issueNum) {
          const url = `https://github.com/${selectedRepo}/pull/${prNum}`;
          return { ...pr, number: prNum, url };
        }
        return pr;
      }));
    };
    (window as any).debugState = () => {
    };
    (window as any).clearPRs = () => {
      setPullRequests([]);
    };
    (window as any).debugPRAssociations = () => {
      pullRequests.forEach(pr => {
      });
      issues.forEach(issue => {
        const hasPR = pullRequests.some(pr => 
          pr.issue === issue.number || 
          new RegExp(`\\b#${issue.number}\\b`).test(`${pr.title || ''} ${pr.body || ''}`)
        );
        const associatedPR = hasPR ? pullRequests.find(pr => 
          pr.issue === issue.number || 
          new RegExp(`\\b#${issue.number}\\b`).test(`${pr.title || ''} ${pr.body || ''}`)
        ) : null;
      });
    };
  }, [checkForRealPRs, selectedRepo, issues, pullRequests, agents]);
  
  // Periodically check for real PRs when we have pending ones
  React.useEffect(() => {
    const hasPendingPRs = pullRequests.some(pr => !pr.number);
    if (!hasPendingPRs || !selectedRepo || !cliStatus.ghAuthenticated) return;
    
    const interval = setInterval(() => checkForRealPRs(false), 5000); // Check every 5 seconds (silently)
    return () => clearInterval(interval);
  }, [pullRequests, selectedRepo, cliStatus.ghAuthenticated]);
  
  // Periodically check for orphaned agents that need PR recovery
  React.useEffect(() => {
    if (!prRecoveryManagerRef.current || !selectedRepo) return;
    
    const checkForOrphanedAgents = () => {
      const orphaned = findOrphanedAgents(agents, pullRequests);
      if (orphaned.length > 0) {
        prRecoveryManagerRef.current?.addToRecovery(orphaned);
      }
    };
    
    // Check immediately
    checkForOrphanedAgents();
    
    // Then check periodically
    const interval = setInterval(checkForOrphanedAgents, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [agents, pullRequests, selectedRepo]);

  // Toggle issue selection
  const toggleIssue = (issueNumber: number) => {
    setSelectedIssues(prev => {
      if (prev.includes(issueNumber)) {
        return prev.filter(n => n !== issueNumber);
      }
      return [...prev, issueNumber];
    });
  };

  // Deploy agents
  const deployAgents = async () => {
    if (selectedIssues.length === 0) {
      setError('Please select at least one issue');
      addNotification('Please select at least one issue', 'warning');
      return;
    }

    // Prevent multiple simultaneous deployments
    if (isDeploying) {
      addNotification('Deployment already in progress', 'warning');
      return;
    }

    setError('');
    setIsDeploying(true);
    
    
    // Filter out issues that already have agents or are being deployed
    const deployableIssues = selectedIssues.filter(issueNumber => {
      // Skip if agent already exists
      if (agents[issueNumber]) {
        addNotification(`Agent already exists for issue #${issueNumber}`, 'warning');
        return false;
      }
      // Skip if currently being deployed (check ref for immediate state)
      if (deployingIssuesRef.current.has(issueNumber)) {
        addNotification(`Issue #${issueNumber} is already being deployed`, 'warning');
        return false;
      }
      return true;
    });

    if (deployableIssues.length === 0) {
      setIsDeploying(false);
      return;
    }

    // Mark issues as being deployed (both in state and ref for immediate tracking)
    deployableIssues.forEach(num => {
      deployingIssuesRef.current.add(num);
    });
    setDeployingIssues(prev => {
      const newSet = new Set(prev);
      deployableIssues.forEach(num => newSet.add(num));
      return newSet;
    });

    // Deploy all agents in parallel
    const deploymentPromises = deployableIssues.map(async (issueNumber) => {
      try {
        // Add agent to state immediately for visual feedback
        const issue = issues.find(i => i.number === issueNumber);
        setAgents(prev => {
          // Double-check agent doesn't exist (race condition protection)
          if (prev[issueNumber]) {
            return prev;
          }
          return {
            ...prev,
            [issueNumber]: {
              issueNumber,
              status: 'starting',
              task: 'Deploying agent...',
              details: 'Deploying agent...',
              issue: issue || { number: issueNumber, title: `Issue #${issueNumber}` },
              startTime: Date.now(),
              progress: 0
            }
          };
        });
        
        await window.electronAPI.claude.deployAgent(issueNumber, selectedRepo);
        
        // Clear from selection after deployment
        setSelectedIssues(prev => prev.filter(n => n !== issueNumber));
        addActivity(`Agent deployed for issue #${issueNumber}`);
        return { success: true, issueNumber };
      } catch (err) {
        const error = err as Error;
        setError(`Failed to deploy agent for issue #${issueNumber}: ${error.message}`);
        addNotification(`Failed to deploy agent for issue #${issueNumber}`, 'error');
        // Remove failed agent from state
        setAgents(prev => {
          const newAgents = { ...prev };
          delete newAgents[issueNumber];
          return newAgents;
        });
        return { success: false, issueNumber, error: error.message };
      } finally {
        // Remove from deploying set (both ref and state)
        deployingIssuesRef.current.delete(issueNumber);
        setDeployingIssues(prev => {
          const newSet = new Set(prev);
          newSet.delete(issueNumber);
          return newSet;
        });
      }
    });
    
    // Wait for all deployments to complete
    const results = await Promise.all(deploymentPromises);
    const successCount = results.filter(r => r.success).length;
    
    // Show success notification based on results
    if (successCount > 0) {
      addNotification(`${successCount} agent${successCount !== 1 ? 's' : ''} deployed successfully`, 'success');
    }
    
    // Reset deploying state
    setIsDeploying(false);
  };

  // Stop an agent
  const stopAgent = async (issueNumber: number) => {
    try {
      const agent = agents[issueNumber];
      if (!agent) {
        return;
      }
      
      // Clear health monitoring data
      agentHealthMonitorRef.current?.clearAgent(issueNumber);

      // If agent is already completed, just remove it from display
      if (agent.status === 'completed') {
        
        // Save logs to completed logs if not already saved
        setAgentLogs(currentLogs => {
          if (currentLogs[issueNumber]) {
            setCompletedAgentLogs(prev => ({
              ...prev,
              [issueNumber]: {
                logs: currentLogs[issueNumber],
                agent: agent,
                completedAt: new Date().toISOString()
              }
            }));
          }
          
          // Remove from active logs
          const { [issueNumber]: removed, ...restLogs } = currentLogs;
          return restLogs;
        });
        
        // Remove from agents
        setAgents(prev => {
          const { [issueNumber]: removed, ...restAgents } = prev;
          return restAgents;
        });
        
        addActivity(`Removed completed agent for issue #${issueNumber}`);
        return;
      }
      
      // For non-completed agents, stop them normally
      // First update the agent status to 'stopping'
      setAgents(prev => ({
        ...prev,
        [issueNumber]: {
          ...prev[issueNumber],
          status: 'stopping'
        }
      }));
      
      // Actually stop the agent
      await window.electronAPI.claude.stopAgent(issueNumber);
      
      // Mark as stopped but keep in state for history
      setAgents(prev => ({
        ...prev,
        [issueNumber]: {
          ...prev[issueNumber],
          status: 'stopped',
          endTime: Date.now()
        }
      }));
      
      addActivity(`Agent for issue #${issueNumber} stopped`);
    } catch (err) {
      const error = err as Error;
      // Revert status on error
      setAgents(prev => ({
        ...prev,
        [issueNumber]: {
          ...prev[issueNumber],
          status: 'failed'
        }
      }));
      setError(`Failed to stop agent: ${error.message}`);
      addActivity(`Error stopping agent for issue #${issueNumber}: ${error.message}`);
    }
  };

  const viewPR = (prId: number) => {
    const pr = pullRequests.find(p => p.id === prId);
    if (!pr) {
      return;
    }
    
    if (!pr.url) {
      addActivity(`PR #${pr.number || prId} URL not available yet - still being created`);
      return;
    }
    
    addActivity(`Opening PR #${pr.number || prId} in browser`);
    // Open the PR URL in the default browser
    if (window.electronAPI && window.electronAPI.shell) {
      window.electronAPI.shell.openExternal(pr.url);
    } else {
      // Fallback for web or if shell API is not available
      window.open(pr.url, '_blank');
    }
  };

  const mergePR = async (prId: number, silent = false) => {
    const pr = pullRequests.find(p => p.id === prId);
    if (pr && pr.number) {
      // Only show confirm dialog if not silent
      if (silent || window.confirm(`Merge PR #${pr.number}: ${pr.title}?\n\nThis will merge the pull request into the main branch.`)) {
        try {
          if (!pr.number) {
            throw new Error('PR number not available yet. Please wait for the PR to be created.');
          }
          addActivity(`Merging PR #${pr.number}...`);
          await window.electronAPI.github.mergePullRequest(pr.number);
          
          // Remove PR from list after successful merge
          setPullRequests(prev => prev.filter(p => p.id !== prId));
          
          // Remove the issue since it's been fixed
          const issueNumber = typeof pr.issue === 'number' ? pr.issue : pr.issue?.number;
          if (issueNumber) {
            setIssues(prev => prev.filter(issue => issue.number !== issueNumber));
          }
          
          addActivity(`✅ Merged PR #${pr.number} and closed issue #${issueNumber}`);
          
          // Schedule worktree cleanup after a delay
          if (issueNumber && !pendingCleanups.current.has(issueNumber)) {
            pendingCleanups.current.add(issueNumber);
            const cleanupDelay = 30000; // 30 seconds default
            addActivity(`🧹 Scheduling worktree cleanup for issue #${issueNumber} in ${cleanupDelay/1000}s...`);
            
            setTimeout(async () => {
              try {
                await window.electronAPI.claude.cleanupWorktree(issueNumber);
                addActivity(`🧹 Cleaned up worktree for merged issue #${issueNumber}`);
              } catch (error) {
                addActivity(`⚠️ Failed to cleanup worktree for issue #${issueNumber}: ${error.message}`);
              } finally {
                pendingCleanups.current.delete(issueNumber);
              }
            }, cleanupDelay);
          }
        } catch (error) {
          addActivity(`❌ Failed to merge PR: ${error.message}`);
          
          // Check if PR was already merged
          try {
            const realPRs = await window.electronAPI.github.listPullRequests(selectedRepo);
            const currentPR = realPRs.find(rpr => rpr.number === pr.number);
            if (!currentPR || currentPR.state === 'MERGED') {
              addActivity(`ℹ️ PR #${pr.number} appears to be already merged`);
              // Remove from list since it's merged
              setPullRequests(prev => prev.filter(p => p.id !== prId));
              
              // Schedule worktree cleanup for already merged PR
              const issueNumber = typeof pr.issue === 'number' ? pr.issue : pr.issue?.number;
              if (issueNumber && !pendingCleanups.current.has(issueNumber)) {
                pendingCleanups.current.add(issueNumber);
                const cleanupDelay = 30000; // 30 seconds default
                addActivity(`🧹 Scheduling worktree cleanup for already merged issue #${issueNumber} in ${cleanupDelay/1000}s...`);
                
                setTimeout(async () => {
                  try {
                    await window.electronAPI.claude.cleanupWorktree(issueNumber);
                    addActivity(`🧹 Cleaned up worktree for already merged issue #${issueNumber}`);
                  } catch (error) {
                        addActivity(`⚠️ Failed to cleanup worktree for issue #${issueNumber}: ${error.message}`);
                  } finally {
                    pendingCleanups.current.delete(issueNumber);
                  }
                }, cleanupDelay);
              }
            }
          } catch (checkError) {
          }
        }
      }
    } else {
      addActivity(`Error: PR #${prId} doesn't have a valid GitHub PR number`);
    }
  };

  const closePRWithoutConfirm = async (prId: number, suppressActivity = false) => {
    const pr = pullRequests.find(p => p.id === prId);
    if (pr && pr.number) {
      try {
        if (!suppressActivity) {
          addActivity(`Closing PR #${pr.number}...`);
        }
        const result = await window.electronAPI.github.closePullRequest(pr.number);
        
        // Remove PR from list
        setPullRequests(prev => prev.filter(p => p.id !== prId));
        
        // Remove the agent associated with this issue if it exists
        const issueNumber = typeof pr.issue === 'number' ? pr.issue : pr.issue?.number;
        if (issueNumber && agents[issueNumber]) {
          setAgents(prev => {
            const updated = { ...prev };
            delete updated[issueNumber];
            return updated;
          });
        }
        
        if (!suppressActivity) {
          addActivity(`✅ Closed PR #${pr.number}, issue #${issueNumber} is available again`);
        }
      } catch (error) {
        if (!suppressActivity) {
          addActivity(`❌ Failed to close PR: ${error.message}`);
        }
        throw error; // Re-throw to let caller handle
      }
    } else {
      if (!suppressActivity) {
        addActivity(`Error: PR #${prId} doesn't have a valid GitHub PR number`);
      }
      throw new Error(`PR #${prId} doesn't have a valid GitHub PR number`);
    }
  };
  
  const closePR = async (prId: number) => {
    const pr = pullRequests.find(p => p.id === prId);
    if (pr && pr.number) {
      if (window.confirm(`Close PR #${pr.number} without merging?\n\nThis will close the pull request and reopen the issue.`)) {
        return closePRWithoutConfirm(prId);
      }
    } else {
      addActivity(`Error: PR #${prId} doesn't have a valid GitHub PR number`);
    }
  };

  const retryAgent = async (issueNumber: number, additionalContext = '') => {
    const issueToRetry = issues.find(issue => issue.number === issueNumber);
    if (issueToRetry) {
      addActivity(`Retrying agent for issue #${issueNumber}...`);
      
      try {
        // Remove from agents and agentLogs to allow re-deployment
        setAgents(prev => {
          const updated = { ...prev };
          delete updated[issueNumber];
          return updated;
        });
        setAgentLogs(prev => {
          const updated = { ...prev };
          delete updated[issueNumber];
          return updated;
        });
        
        // Add agent to state immediately for visual feedback
        setAgents(prev => ({
          ...prev,
          [issueNumber]: {
            issueNumber,
            status: 'starting',
            task: 'Retrying agent...',
            details: 'Retrying agent...',
            issue: issueToRetry,
            startTime: Date.now(),
            progress: 0
          }
        }));
        
        // Re-deploy the agent
        await window.electronAPI.claude.deployAgent(issueNumber, selectedRepo);
        addActivity(`Agent redeployed for issue #${issueNumber}`);
      } catch (err) {
        const error = err as Error;
        setError(`Failed to retry agent for issue #${issueNumber}: ${error.message}`);
        // Remove failed agent from state
        setAgents(prev => {
          const newAgents = { ...prev };
          delete newAgents[issueNumber];
          return newAgents;
        });
      }
    }
  };

  const retryAgentWithFeedback = async (issueNumber: number, feedback: string) => {
    const issueToRetry = issues.find(issue => issue.number === issueNumber);
    if (issueToRetry) {
      addActivity(`Retrying agent for issue #${issueNumber} with PR feedback...`);
      
      try {
        // Remove from agents and agentLogs to allow re-deployment
        setAgents(prev => {
          const updated = { ...prev };
          delete updated[issueNumber];
          return updated;
        });
        setAgentLogs(prev => {
          const updated = { ...prev };
          delete updated[issueNumber];
          return updated;
        });
        
        // Add agent to state immediately for visual feedback
        setAgents(prev => ({
          ...prev,
          [issueNumber]: {
            issueNumber,
            status: 'starting',
            task: 'Retrying with feedback...',
            startTime: Date.now(),
            progress: 0,
            hasFeedback: true
          }
        }));
        
        // Deploy the agent with feedback context
        await window.electronAPI.claude.deployAgentWithContext(issueNumber, selectedRepo, feedback);
        addActivity(`Agent redeployed for issue #${issueNumber} with PR feedback`);
      } catch (err) {
        const error = err as Error;
        setError(`Failed to retry agent with feedback: ${error.message}`);
        // Remove failed agent from state
        setAgents(prev => {
          const updated = { ...prev };
          delete updated[issueNumber];
          return updated;
        });
      }
    } else {
      addActivity(`Error: Issue #${issueNumber} not found`);
    }
  };

  // Deploy agent function for conflict resolution
  const deployAgent = async (issueNumberOrTask: number | string, repo: string, context?: string) => {
    try {
      if (typeof issueNumberOrTask === 'string') {
        // Special task like 'conflict-resolver'
        await window.electronAPI.claude.deployAgentWithContext(issueNumberOrTask, repo, context);
        addActivity(`Deployed special agent: ${issueNumberOrTask}`);
      } else {
        // Regular issue deployment
        const issueNumber = issueNumberOrTask;
        await window.electronAPI.claude.deployAgent(issueNumber, repo);
        addActivity(`Deployed agent for issue #${issueNumber}`);
      }
    } catch (err) {
      const error = err as Error;
      setError(`Failed to deploy agent: ${error.message}`);
      addNotification(`Failed to deploy agent: ${error.message}`, 'error');
    }
  };

  // Show loading screen during initial load
  if (initialLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-dark">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-purple-gradient-start border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h1 className="text-xl font-semibold bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end bg-clip-text text-transparent mb-2">
            Swarm Station
          </h1>
          <p className="text-gray-text text-sm">Initializing...</p>
        </div>
      </div>
    );
  }

  return (
      <div className="h-full flex flex-col bg-gray-dark">
      <Header 
        repositories={repositories}
        selectedRepo={selectedRepo}
        setSelectedRepo={setSelectedRepo}
        showRepoSetup={showRepoSetup}
        repositoriesLoading={repositoriesLoading}
        repositoryConnected={!!selectedRepo}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <ErrorBoundary>
          <IssuesPanel
            repositories={repositories}
            selectedRepo={selectedRepo}
            setSelectedRepo={setSelectedRepo}
            issues={issues}
            selectedIssues={selectedIssues}
            toggleIssue={toggleIssue}
            deployAgents={deployAgents}
            isDeploying={isDeploying}
            loading={loading}
            error={error}
            cliStatus={cliStatus}
            loadRepositories={loadRepositories}
            loadIssues={loadIssues}
            showRepoSetup={showRepoSetup}
            showCreateIssue={showCreateIssue}
            showEditIssue={showEditIssue}
            addActivity={addActivity}
            agents={agents}
            closingIssues={closingIssues}
            pullRequests={pullRequests}
            parseIssues={handleParseIssues}
            createIssues={handleCreateBulkIssues}
            isCreatingIssues={isCreatingIssues}
            setSelectedIssues={setSelectedIssues}
            bulkCloseIssues={handleBulkCloseIssues}
            showBulkIssueCreator={showBulkIssueCreator}
          />
        </ErrorBoundary>

        {/* Center Panel - Workflow */}
        <WorkflowPanel
          agents={agents}
          agentLogs={agentLogs}
          completedAgentLogs={completedAgentLogs}
          stopAgent={stopAgent}
          addActivity={addActivity}
          pullRequests={pullRequests}
          viewPR={viewPR}
          mergePR={mergePR}
          closePR={closePR}
          closePRWithoutConfirm={closePRWithoutConfirm}
          retryAgent={retryAgent}
          retryAgentWithFeedback={retryAgentWithFeedback}
          checkForRealPRs={checkForRealPRs}
          clearLogs={clearOrchestrationLogs}
          activeTab={workflowActiveTab}
          deployAgent={deployAgent}
          selectedRepo={selectedRepo}
          onTabChange={(tab) => {
            setWorkflowActiveTab(tab);
          }}
        />

        {/* Right Panel - Details */}
        <ErrorBoundary>
          <DetailsPanel
            agents={agents}
            pullRequests={pullRequests}
            activityLog={activityLog}
            showRepoSetup={showRepoSetup}
            agentLogs={agentLogs}
            onViewAllClick={() => {
              // Navigate to orchestration tab
              setWorkflowActiveTab('orchestration');
            }}
          />
        </ErrorBoundary>
      </div>

      <RepoSetupModal
        show={showRepoSetupModal}
        onClose={hideRepoSetup}
        cliStatus={cliStatus}
        refreshCLIStatus={window.electronAPI ? window.electronAPI.system.checkDependencies : () => {}}
        loadUserRepositories={loadRepositories}
        selectRepository={setSelectedRepo}
        selectedRepo={selectedRepo}
        continueSetup={() => {
          hideRepoSetup();
          // Trigger load issues for the selected repo after setup
          if (selectedRepo) {
            loadIssues();
            addActivity(`Repository ${selectedRepo} selected and issues loaded.`);
          }
        }}
        repositories={repositories}
      />

      <IssueModal
        show={showIssueModal}
        onClose={hideIssueModal}
        onSubmit={handleIssueSubmit}
        onDelete={handleCloseIssue}
        issue={editingIssue}
        mode={modalMode}
      />

      <BulkIssueModal
        show={showBulkIssueCreatorModal}
        onClose={hideBulkIssueCreator}
        onSubmit={async (issues) => {
          await handleCreateBulkIssues(issues.map(issue => ({
            title: issue.title,
            body: issue.description,
            labels: issue.labels
          })));
          hideBulkIssueCreator();
        }}
        parseIssues={handleParseIssues}
      />

      <UpdateNotification />
      
      <NotificationManager 
        notifications={notifications} 
        onClose={removeNotification} 
      />

      <ConfirmDialog
        show={showCloseConfirm}
        onClose={() => {
          setShowCloseConfirm(false);
          setIssuesToClose([]);
        }}
        onConfirm={confirmBulkClose}
        title="Close Issues"
        message={`Are you sure you want to close ${issuesToClose.length} issue${issuesToClose.length === 1 ? '' : 's'}? Closed issues can be reopened later if needed.`}
        confirmText="Close"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}

export default App;