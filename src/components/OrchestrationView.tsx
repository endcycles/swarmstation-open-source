import React, { useState, useEffect, useRef } from 'react';
import { AgentSession, AgentLog, Agent, Issue, SDKMessage as BaseSDKMessage, MessageContent, MCPServer } from '../types';
import TerminalView from './TerminalView';
import DebugPanel from './DebugPanel';
import { Logger } from '../../core/utils/logger';

// Extended SDK message with additional fields used in OrchestrationView
interface SDKMessage extends BaseSDKMessage {
  type: 'assistant' | 'user' | 'result' | 'system' | 'error';
  message?: {
    content?: MessageContent[];
    [key: string]: unknown;
  };
  session_id?: string;
  cwd?: string;
  tools?: string[];
  mcp_servers?: MCPServer[];
  apiKeySource?: string;
  duration_ms?: number;
  duration_api_ms?: number;
  is_error?: boolean;
}

interface OrchestrationViewProps {
  agentLogs: Record<string, AgentLog[]>;
  completedAgentLogs?: Record<string, { logs: AgentLog[], agent: Agent, completedAt: string }>;
  addActivity: (message: string) => void;
  retryAgent: (issueNumber: number) => void;
  agents: Record<string, Agent>;
  clearLogs?: () => void;
}

function OrchestrationView({
  agentLogs,
  completedAgentLogs = {},
  addActivity,
  retryAgent,
  agents, // Add this parameter
  clearLogs
}: OrchestrationViewProps) {
  const [activeTab, setActiveTab] = useState('live');
  const [activeFilter, setActiveFilter] = useState('all');
  const [terminalPaused, setTerminalPaused] = useState(false);
  const [showDebugTerminal, setShowDebugTerminal] = useState(true);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [rawOutputs, setRawOutputs] = useState<Record<string, string>>({});
  const terminalContentRef = useRef<HTMLDivElement>(null);

  // Subscribe to raw output
  useEffect(() => {
    const cleanup = window.electronAPI.claude.onRawOutput((issueNumber, output) => {
      setRawOutputs(prev => ({
        ...prev,
        [issueNumber]: (prev[issueNumber] || '') + output
      }));
    });
    return cleanup;
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalContentRef.current && !terminalPaused) {
      terminalContentRef.current.scrollTop = terminalContentRef.current.scrollHeight;
    }
  }, [agentLogs, activeTab, activeFilter, terminalPaused]);
  
  // Get all logs for debug terminal
  const getAllLogs = (): string[] => {
    const allLogs: { time: number, text: string }[] = [];
    
    // Add active logs
    Object.entries(agentLogs)
      .filter(([key]) => !key.startsWith('__')) // Skip system keys
      .forEach(([issueNumber, logs]) => {
      // Skip invalid keys (should be numeric issue numbers)
      if (isNaN(parseInt(issueNumber))) {
        Logger.warn('ORCHESTRATION', `Skipping invalid agentLogs key: "${issueNumber}"`);
        return;
      }
      
      // Add defensive check to ensure logs is an array
      if (!Array.isArray(logs)) {
        Logger.error('OrchestrationView', `Expected array for issue ${issueNumber}, got: ${typeof logs}`, logs);
        return;
      }
      
      logs.forEach(log => {
        let text = '';
        if (log.type === 'sdk' && log.message) {
          // Format SDK messages for debug terminal
          const msg = log.message;
          if (msg.type === 'assistant' && msg.message?.content) {
            const content = msg.message.content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join(' ');
            text = `[Issue #${issueNumber}] Claude: ${content}`;
          } else if (msg.type === 'result') {
            text = `[Issue #${issueNumber}] Result: ${msg.subtype} (${msg.num_turns} turns)`;
          } else {
            text = `[Issue #${issueNumber}] ${msg.type}: ${JSON.stringify(msg)}`;
          }
        } else {
          text = `[Issue #${issueNumber}] ${log.content || ''}`;
        }
        allLogs.push({ time: log.timestamp, text });
      });
    });
    
    // Add completed logs
    Object.entries(completedAgentLogs)
      .filter(([key]) => !key.startsWith('__')) // Skip system keys
      .forEach(([issueNumber, data]) => {
      // Skip invalid keys (should be numeric issue numbers)
      if (isNaN(parseInt(issueNumber))) {
        Logger.warn('OrchestrationView', `Skipping invalid completedAgentLogs key: "${issueNumber}"`);
        return;
      }
      
      // Add defensive check to ensure data.logs is an array
      if (!data || !Array.isArray(data.logs)) {
        Logger.error('OrchestrationView', `Expected array for completed logs issue ${issueNumber}, got: ${typeof data?.logs}`, data);
        return;
      }
      
      data.logs.forEach(log => {
        let text = '';
        if (log.type === 'sdk' && log.message) {
          // Format SDK messages for debug terminal
          const msg = log.message;
          if (msg.type === 'assistant' && msg.message?.content) {
            const content = msg.message.content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join(' ');
            text = `[Issue #${issueNumber}] Claude: ${content}`;
          } else if (msg.type === 'result') {
            text = `[Issue #${issueNumber}] Result: ${msg.subtype} (${msg.num_turns} turns)`;
          } else {
            text = `[Issue #${issueNumber}] ${msg.type}: ${JSON.stringify(msg)}`;
          }
        } else {
          text = `[Issue #${issueNumber}] ${log.content || ''}`;
        }
        allLogs.push({ time: log.timestamp, text });
      });
    });
    
    // Sort by timestamp and return just the text
    return allLogs
      .sort((a, b) => a.time - b.time)
      .map(item => item.text);
  };

  const getFilteredSessions = (): AgentSession[] => {
    const sessions: AgentSession[] = [];
    const addedSessions = new Set<string>();
    
    // Add active sessions from agentLogs
    Object.entries(agentLogs)
      .filter(([key]) => !key.startsWith('__')) // Skip system keys
      .forEach(([issueNumber, logs]) => {
      // Skip invalid keys (should be numeric issue numbers)
      if (isNaN(parseInt(issueNumber))) {
        Logger.warn('ORCHESTRATION', `Skipping invalid agentLogs key in sessions: "${issueNumber}"`);
        return;
      }
      
      // Ensure logs is an array
      if (!Array.isArray(logs)) {
        Logger.warn('ORCHESTRATION', `Skipping non-array logs for issue ${issueNumber}`);
        return;
      }
      
      const agent = agents[issueNumber];
      // Create session even if agent doesn't exist (might be completed/removed)
      const status = agent ? 
        (agent.status === 'working' || agent.status === 'running' || agent.status === 'starting' ? 'active' :
         agent.status === 'completed' ? 'completed' :
         agent.status === 'failed' ? 'failed' : 
         agent.status === 'stopped' || agent.status === 'interrupted' ? 'stopped' : 'stopped') : // Changed default from 'active' to 'stopped'
        'completed'; // Default to completed if agent no longer exists
      
      sessions.push({
        id: issueNumber,
        issue: { number: parseInt(issueNumber), title: agent?.task || `Issue #${issueNumber}` } as Issue,
        status,
        logs: logs || [],
        startTime: agent?.startTime || Date.now()
      });
      addedSessions.add(issueNumber);
    });
    
    // Add completed sessions from completedAgentLogs (only if not already added)
    Object.entries(completedAgentLogs)
      .filter(([key]) => !key.startsWith('__')) // Skip system keys
      .forEach(([issueNumber, data]) => {
      if (!addedSessions.has(issueNumber)) {
        const { logs, agent, completedAt } = data;
        sessions.push({
          id: issueNumber,
          issue: { number: parseInt(issueNumber), title: agent?.task || `Issue #${issueNumber}` } as Issue,
          status: 'completed',
          logs: logs || [],
          startTime: agent?.startTime || Date.now()
        });
      }
    });

    // Filter by tab
    if (activeTab === 'live') {
      return sessions.filter(s => {
        // Only show truly active agents in live view
        const agent = agents[s.id];
        return agent && (agent.status === 'working' || agent.status === 'running' || agent.status === 'starting');
      });
    } else if (activeTab === 'history') {
      // Show completed, stopped, and interrupted agents in history
      return sessions.filter(s => s.status === 'completed' || s.status === 'stopped' || s.status === 'interrupted');
    } else if (activeTab === 'failed') {
      return sessions.filter(s => s.status === 'failed');
    }

    // Sort by most recent
    sessions.sort((a, b) => b.startTime - a.startTime);
    return sessions;
  };

  const handleClearLogs = () => {
    if (window.confirm('Clear all orchestration logs? This cannot be undone.')) {
      if (clearLogs) {
        clearLogs();
        addActivity('Orchestration logs cleared');
      } else {
        // Fallback message if clearLogs prop not provided
        addActivity('Clear logs function not available');
      }
    }
  };

  const handlePauseLogs = () => {
    setTerminalPaused(prev => !prev);
    addActivity(terminalPaused ? 'Resumed log streaming' : 'Paused log streaming');
  };
  
  const handleExport = () => {
    const sessions = getFilteredSessions();
    const exportData = {
      exportDate: new Date().toISOString(),
      activeTab,
      sessionCount: sessions.length,
      sessions: sessions.map(s => ({
        issueNumber: s.id,
        issueTitle: s.issue.title,
        status: s.status,
        startTime: new Date(s.startTime).toISOString(),
        logCount: s.logs.length,
        logs: s.logs.map(log => ({
          type: log.type,
          content: log.content,
          timestamp: new Date(log.timestamp).toISOString()
        }))
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orchestration-logs-${activeTab}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addActivity(`Exported ${sessions.length} ${activeTab} sessions`);
  };

  const renderLogLine = (log: AgentLog) => {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    
    // Handle SDK messages differently
    if (log.type === 'sdk' && log.message) {
      const message = log.message;
      
      switch (message.type) {
        case 'system':
          if (message.subtype === 'init') {
            return (
              <div className="text-blue-400">
                <span className="font-semibold">System:</span> Initializing Claude SDK
                <span className="text-gray-500 ml-2 text-xs">
                  Model: {message.model}, Mode: {message.permissionMode}
                </span>
              </div>
            );
          } else if (message.subtype === 'error') {
            return <span className="text-red-status">System Error: {message.error}</span>;
          }
          return <span className="text-blue-400">System: {JSON.stringify(message)}</span>;
          
        case 'assistant':
          if (message.message && message.message.content) {
            // Extract text content from the assistant message
            const content = message.message.content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join('\n');
            return (
              <div className="text-gray-300 ml-4">
                <span className="text-purple-400 font-semibold">Claude:</span> {content}
              </div>
            );
          }
          return <span className="text-gray-300">Claude: (empty response)</span>;
          
        case 'user':
          if (message.message && message.message.content) {
            const content = message.message.content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join('\n');
            return (
              <div className="text-gray-400">
                <span className="text-green-400 font-semibold">User:</span> {content.substring(0, 100)}{content.length > 100 ? '...' : ''}
              </div>
            );
          }
          return <span className="text-gray-400">User: (empty message)</span>;
          
        case 'result':
          if (message.subtype === 'success') {
            return (
              <div className="text-green-status">
                ✓ Task completed successfully
                <span className="text-gray-500 ml-2 text-xs">
                  ({message.num_turns} turns, ${message.total_cost_usd?.toFixed(4) || '0.00'} USD)
                </span>
              </div>
            );
          } else {
            return (
              <div className="text-red-status">
                ✗ Task failed: {message.subtype}
                <span className="text-gray-500 ml-2 text-xs">
                  ({message.num_turns} turns)
                </span>
              </div>
            );
          }
          
        default:
          return <span className="text-gray-500">Unknown message type: {message.type}</span>;
      }
    }
    
    // Handle legacy log types
    switch (log.type) {
      case 'command':
        return <span className="text-purple-gradient-start">$ {log.content}</span>;
      case 'output':
        return <span className="text-gray-text ml-4">{log.content}</span>;
      case 'error':
        return <span className="text-red-status">ERROR: {log.content}</span>;
      case 'success':
        return <span className="text-green-status">✓ {log.content}</span>;
      default:
        return <span>{log.content}</span>;
    }
  };

  return (
    <div id="orchestration-view" className="tab-content">
      <div className="h-full flex flex-col bg-secondary">
        <div className="p-4 bg-white/3 border-b border-white/10 flex justify-between items-center">
          <div className="flex gap-4">
            <button className={`py-2 px-4 bg-transparent border border-white/10 rounded-md text-gray-text cursor-pointer transition-colors text-sm hover:text-white hover:border-white/20 ${activeTab === 'live' ? 'bg-purple-gradient-start/20 border-purple-gradient-start text-purple-gradient-start' : ''}`} onClick={() => setActiveTab('live')}>Live Sessions</button>
            <button className={`py-2 px-4 bg-transparent border border-white/10 rounded-md text-gray-text cursor-pointer transition-colors text-sm hover:text-white hover:border-white/20 ${activeTab === 'history' ? 'bg-purple-gradient-start/20 border-purple-gradient-start text-purple-gradient-start' : ''}`} onClick={() => setActiveTab('history')}>History</button>
            <button className={`py-2 px-4 bg-transparent border border-white/10 rounded-md text-gray-text cursor-pointer transition-colors text-sm hover:text-white hover:border-white/20 ${activeTab === 'failed' ? 'bg-purple-gradient-start/20 border-purple-gradient-start text-purple-gradient-start' : ''}`} onClick={() => setActiveTab('failed')}>Failed</button>
          </div>
          <div className="flex gap-2">
            <button 
              className={`py-2 px-4 border rounded-md text-xs cursor-pointer transition-colors ${showDebugPanel ? 'bg-purple-gradient-start/20 border-purple-gradient-start text-purple-gradient-start' : 'bg-white/5 border-white/10 text-gray-text hover:bg-white/10 hover:text-white'}`} 
              onClick={() => setShowDebugPanel(!showDebugPanel)}
            >
              Debug
            </button>
            <button className="py-2 px-4 bg-white/5 border border-white/10 rounded-md text-gray-text text-xs cursor-pointer transition-colors hover:bg-white/10 hover:text-white" onClick={handleClearLogs}>Clear</button>
            <button className="py-2 px-4 bg-white/5 border border-white/10 rounded-md text-gray-text text-xs cursor-pointer transition-colors hover:bg-white/10 hover:text-white" onClick={handleExport}>Export</button>
            <button className="py-2 px-4 bg-white/5 border border-white/10 rounded-md text-gray-text text-xs cursor-pointer transition-colors hover:bg-white/10 hover:text-white" onClick={handlePauseLogs}>{terminalPaused ? 'Resume' : 'Pause'}</button>
            <button className="py-2 px-4 bg-yellow-500/20 border border-yellow-500/30 rounded-md text-yellow-400 text-xs cursor-pointer transition-colors hover:bg-yellow-500/30 hover:text-yellow-300" onClick={() => setShowDebugPanel(!showDebugPanel)}>
              {showDebugPanel ? 'Hide' : 'Show'} Debug
            </button>
          </div>
        </div>
        <div className="flex-1 bg-black font-mono text-xs p-4 overflow-y-auto leading-relaxed" ref={terminalContentRef}>
          <div className="mb-4 flex gap-2 p-2 bg-white/3 rounded-sm">
            <div className={`py-1 px-2 bg-white/5 border border-white/10 rounded-sm text-xs cursor-pointer transition-colors ${activeFilter === 'all' ? 'bg-purple-gradient-start/20 border-purple-gradient-start text-purple-gradient-start' : ''}`} onClick={() => setActiveFilter('all')}>All</div>
            <div className={`py-1 px-2 bg-white/5 border border-white/10 rounded-sm text-xs cursor-pointer transition-colors ${activeFilter === 'commands' ? 'bg-purple-gradient-start/20 border-purple-gradient-start text-purple-gradient-start' : ''}`} onClick={() => setActiveFilter('commands')}>Commands</div>
            <div className={`py-1 px-2 bg-white/5 border border-white/10 rounded-sm text-xs cursor-pointer transition-colors ${activeFilter === 'outputs' ? 'bg-purple-gradient-start/20 border-purple-gradient-start text-purple-gradient-start' : ''}`} onClick={() => setActiveFilter('outputs')}>Outputs</div>
            <div className={`py-1 px-2 bg-white/5 border border-white/10 rounded-sm text-xs cursor-pointer transition-colors ${activeFilter === 'errors' ? 'bg-purple-gradient-start/20 border-purple-gradient-start text-purple-gradient-start' : ''}`} onClick={() => setActiveFilter('errors')}>Errors</div>
          </div>
          <div id="terminal-sessions">
            {getFilteredSessions().length === 0 ? (
              <div className="empty-state">
                <h3>No {activeTab === 'live' ? 'Active' : activeTab === 'history' ? 'Completed' : 'Failed'} Sessions</h3>
                <p>{activeTab === 'live' ? 'Agent sessions will appear here when running' : activeTab === 'history' ? 'Completed agent sessions will be shown here' : 'Failed agent sessions will be shown here'}</p>
              </div>
            ) : getFilteredSessions().map((session, index) => (
              <div key={`session-${session.id}-${index}`} className={`mb-8 border-l-2 border-white/10 pl-4 ${session.status === 'active' ? 'border-purple-gradient-start' : session.status === 'failed' ? 'border-red-status' : session.status === 'completed' ? 'border-green-status' : session.status === 'stopped' ? 'border-yellow-status opacity-90' : ''}`}>
                <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/5">
                  <div className="text-white font-semibold">Agent #{session.id} - Issue #{session.issue.number}: {session.issue.title}</div>
                  <div>
                    <span className={`text-xs py-1 px-2 rounded-sm ${session.status === 'active' ? 'bg-purple-gradient-start/20 text-purple-gradient-start' : session.status === 'failed' ? 'bg-red-status/20 text-red-status' : session.status === 'completed' ? 'bg-green-status/20 text-green-status' : session.status === 'stopped' ? 'bg-yellow-status/20 text-yellow-status' : 'bg-white/10'}`}>{session.status}</span>
                    {session.status === 'failed' && (
                      <button className="ml-2 py-1 px-2 bg-red-status/20 border border-red-status rounded-sm text-red-status text-xs cursor-pointer transition-colors hover:bg-red-status/30" onClick={() => retryAgent(session.issue.number)}>Retry</button>
                    )}
                  </div>
                </div>
                {session.logs.filter(log => {
                  if (activeFilter === 'all') return true;
                  if (activeFilter === 'commands') return log.type === 'command';
                  if (activeFilter === 'outputs') return log.type === 'output' || log.type === 'success';
                  if (activeFilter === 'errors') return log.type === 'error';
                  return true;
                }).map((log, logIndex) => (
                  <div key={logIndex} className="my-0.5 text-xs">
                    <span className="text-gray-600 mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    {renderLogLine(log)}
                  </div>
                ))}
                {session.status === 'active' && <span className="inline-block w-2 h-3 bg-purple-gradient-start animate-blink ml-0.5"></span>}
                
                {/* Raw output for debugging */}
                {rawOutputs[session.id] && (
                  <div className="mt-4 p-2 bg-black/20 border border-white/10 rounded">
                    <h4 className="text-xs text-yellow-400 font-semibold mb-2">Raw Unfiltered Output:</h4>
                    <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono">
                      {rawOutputs[session.id]}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Debug Terminal */}
      {showDebugTerminal && (
        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-medium text-white/80">Debug Terminal</h4>
            <button
              onClick={() => setShowDebugTerminal(false)}
              className="text-xs text-gray-500 hover:text-white"
            >
              Hide
            </button>
          </div>
          <TerminalView 
            logs={getAllLogs()}
            title="Raw Agent Output"
          />
        </div>
      )}
      
      {/* Debug Panel */}
      {showDebugPanel && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <DebugPanel 
            agentLogs={agentLogs}
            agents={agents}
          />
        </div>
      )}
    </div>
  );
}

export default OrchestrationView;