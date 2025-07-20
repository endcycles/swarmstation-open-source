import React, { useState, useEffect, useRef } from 'react';

import { Agent, AgentLog } from '../types';
import { clearAllSwarmStationData, clearCorruptedData } from '../../core/utils/debugStorage';

interface DebugPanelProps {
  agentLogs: Record<string, AgentLog[]>;
  agents: Record<string, Agent>;
}

function DebugPanel({ agentLogs, agents }: DebugPanelProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [logContent, setLogContent] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [loading, setLoading] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logContent, autoScroll]);

  // Load log file for selected agent
  const loadLogFile = async () => {
    if (!selectedAgent) return;
    
    setLoading(true);
    try {
      const result = await window.electronAPI.claude.readAgentLogFile(selectedAgent);
      if (result.success) {
        setLogContent(result.content);
      } else {
        setLogContent(`Error reading log file: ${result.error}`);
      }
    } catch (error) {
      setLogContent(`Failed to read log file: ${error.message}`);
    }
    setLoading(false);
  };

  // Set up periodic refresh when agent is selected
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (selectedAgent) {
      // Load immediately
      loadLogFile();
      
      // Set up periodic refresh every 2 seconds
      intervalRef.current = setInterval(loadLogFile, 2000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [selectedAgent]);

  // Get active agents
  const activeAgents = Object.entries(agents).filter(([_, agent]) => 
    agent.status === 'working' || agent.status === 'started' || agent.status === 'running'
  );

  const handleClearAllData = () => {
    if (window.confirm('This will clear ALL SwarmStation data including agents, logs, and settings. Are you sure?')) {
      const count = clearAllSwarmStationData();
      alert(`Cleared ${count} items. Please refresh the page.`);
      window.location.reload();
    }
  };

  const handleClearCorrupted = () => {
    const count = clearCorruptedData();
    if (count > 0) {
      alert(`Cleared ${count} corrupted items. Please refresh the page.`);
      window.location.reload();
    } else {
      alert('No corrupted data found.');
    }
  };

  return (
    <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Debug Panel - Direct Log File Reading</h3>
        <div className="flex items-center gap-4">
          <button
            onClick={handleClearCorrupted}
            className="px-3 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded text-yellow-400 text-xs hover:bg-yellow-500/30"
            title="Clear corrupted localStorage data"
          >
            Clear Corrupted
          </button>
          <button
            onClick={handleClearAllData}
            className="px-3 py-1 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-xs hover:bg-red-500/30"
            title="Clear all SwarmStation data"
          >
            Clear All Data
          </button>
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-white/20"
            />
            Auto-scroll
          </label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="bg-black/50 border border-white/20 rounded px-3 py-1 text-white"
          >
            <option value="">Select an agent...</option>
            {Object.entries(agents).map(([issueNumber, agent]) => (
              <option key={issueNumber} value={issueNumber}>
                Agent #{issueNumber} - {agent.status}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div 
        ref={logContainerRef}
        className="bg-black/60 border border-white/10 rounded p-4 h-96 overflow-y-auto font-mono text-xs"
      >
        {loading ? (
          <div className="text-white/50">Loading log file...</div>
        ) : selectedAgent ? (
          <pre className="text-white/80 whitespace-pre-wrap">
            {logContent || 'No content in log file yet...'}
          </pre>
        ) : (
          <div className="text-white/50">Select an agent to view its log file</div>
        )}
      </div>

      {selectedAgent && (
        <div className="mt-2 text-xs text-white/50">
          Reading from: .claude-output-{selectedAgent}.log
          {activeAgents.find(([issueNum, _]) => issueNum === selectedAgent) && (
            <span className="ml-2 text-green-400">• Live</span>
          )}
        </div>
      )}
    </div>
  );
}

export default DebugPanel;