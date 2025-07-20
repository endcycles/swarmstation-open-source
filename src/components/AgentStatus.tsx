import React, { useState } from 'react';
import { Agent, AgentLog } from '../types';

interface AgentStatusProps {
  agent: Agent;
  logs: AgentLog[];
  onStop: () => void;
}

const AgentStatus: React.FC<AgentStatusProps> = ({ agent, logs, onStop }) => {
  const [expanded, setExpanded] = useState(true);

  const getStatusColor = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'running':
      case 'working':
        return 'text-green-status';
      case 'error':
      case 'failed':
        return 'text-red-status';
      case 'completed':
      case 'pr_created':
        return 'text-purple-gradient-start';
      default:
        return 'text-gray-text';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'running':
      case 'working':
        return '⚡';
      case 'error':
      case 'failed':
        return '⚠️';
      case 'completed':
      case 'pr_created':
        return '✓';
      default:
        return '•';
    }
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg mb-4 overflow-hidden">
      <div className="p-4 flex justify-between items-center border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className={`text-xl ${getStatusColor(agent.status)}`}>
            {getStatusIcon(agent.status)}
          </span>
          <span className="text-sm font-semibold">Issue #{agent.issueNumber}</span>
          <span className={`text-xs uppercase font-medium ${getStatusColor(agent.status)}`}>
            {agent.status}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            className="w-6 h-6 flex items-center justify-center bg-transparent border border-white/20 text-white rounded cursor-pointer text-base transition-colors hover:bg-white/10"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Collapse' : 'Expand'}
            aria-label={expanded ? 'Collapse agent details' : 'Expand agent details'}
            aria-expanded={expanded}
          >
            {expanded ? '−' : '+'}
          </button>
          <button
            className="w-6 h-6 flex items-center justify-center bg-red-status/20 border border-red-status/30 text-red-status rounded cursor-pointer text-sm transition-colors hover:bg-red-status/30"
            onClick={onStop}
            title="Stop agent"
            aria-label="Stop agent"
          >
            ✕
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4">
          {agent.details?.pr_url && (
            <div className="mb-4 p-3 bg-purple-gradient-start/10 border border-purple-gradient-start/20 rounded-md flex items-center gap-2">
              <span className="text-xs text-gray-text">Pull Request:</span>
              <a
                href={agent.details.pr_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-gradient-start text-xs break-all hover:underline"
              >
                {agent.details.pr_url}
              </a>
            </div>
          )}

          <div className="bg-black/30 rounded-md overflow-hidden">
            <div className="px-4 py-2 bg-white/5 border-b border-white/10 text-xs font-semibold">
              Agent Logs
            </div>
            <div className="max-h-48 overflow-y-auto p-3 font-mono text-xs">
              {logs.length === 0 ? (
                <div className="text-gray-600 italic">Waiting for agent output...</div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-2 flex gap-3">
                    <span className="text-gray-600 flex-shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-gray-300 break-words">{log.message || log.content}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentStatus;