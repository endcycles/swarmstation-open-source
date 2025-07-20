import React, { useEffect, useState } from 'react';
import { Agent } from '../types';
import EmptyState from './EmptyState';

interface AgentsViewProps {
  agents: Record<string, Agent>;
  stopAgent: (issueNumber: number) => void;
  retryAgent?: (issueNumber: number) => void;
  agentLogs?: Record<string, any[]>;
}

// Helper function for status messages
function getStatusMessage(status: string, progress?: number): string {
  if (status === 'starting') return 'Initializing agent...';
  if (status === 'analyzing') return 'Analyzing issue requirements...';
  if (status === 'setting-up') return 'Setting up workspace...';
  if (status === 'coding') return 'Writing implementation...';
  if (status === 'testing') return 'Running tests...';
  if (status === 'creating-pr') return 'Creating pull request...';
  if (status === 'completed') return 'Pull request created';
  if (status === 'failed') return 'Agent encountered an error';
  if (status === 'stopped') return 'Agent was stopped';
  if (status === 'interrupted') return 'Process interrupted';
  if (progress && progress < 20) return 'Starting up...';
  if (progress && progress < 50) return 'Working on issue...';
  if (progress && progress < 80) return 'Making progress...';
  return 'Finalizing...';
}

function AgentsView({
  agents,
  stopAgent,
  retryAgent,
  agentLogs = {}
}: AgentsViewProps) {
  // Force re-render every second to update elapsed time
  const [, forceUpdate] = useState({});
  
  // Function to remove completed agents
  const removeCompletedAgents = () => {
    // This should be handled by the parent component
    // For now, we'll just hide the button if there's no handler
  };
  
  useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate({});
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div id="agents-view" className="tab-content">
      {Object.keys(agents).length === 0 ? (
        <div className="empty-state-gradient-border">
          <div className="p-8 bg-secondary rounded-md">
            <EmptyState
              icon={
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              }
              title="No Active Agents"
              description="Deploy agents to work on your selected issues. They'll handle the implementation, testing, and create pull requests automatically."
              action={{
                label: "← Select Issues to Deploy",
                onClick: () => {
                  const issuesSection = document.querySelector('#issues-section');
                  if (issuesSection) {
                    issuesSection.scrollIntoView({ behavior: 'smooth' });
                  }
                },
                variant: 'secondary'
              }}
            />
          </div>
        </div>
      ) : (
        <>
          {Object.values(agents).some(a => a.status === 'completed') && (
            <div className="mb-4 flex justify-end">
              <button
                onClick={removeCompletedAgents}
                className="px-3 py-1.5 bg-white/5 text-gray-400 border border-white/10 rounded-md hover:bg-white/10 hover:text-white transition-all text-sm"
              >
                Remove Completed
              </button>
            </div>
          )}
          <div id="agents-grid" className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {Object.entries(agents).map(([issueNumber, agent]) => (
            <div key={issueNumber} className={`bg-secondary border border-white/10 rounded-lg p-4 relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 ${agent.status === 'failed' ? 'border-red-status' : agent.status === 'stopped' || agent.status === 'interrupted' ? 'border-yellow-status opacity-80' : ''}`}>
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/5">
                <div 
                  className={`h-full transition-all duration-700 ease-out ${
                    agent.status === 'completed' ? 'bg-green-status' : 
                    agent.status === 'failed' ? 'bg-red-status' : 
                    'bg-gradient-to-r from-purple-gradient-start to-purple-gradient-end'
                  }`} 
                  style={{ width: `${agent.progress || 0}%` }}
                />
              </div>
              
              {/* Header with issue number and status */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-sm font-medium text-white">Issue #{agent.issueNumber || issueNumber}</span>
                  <div className="text-xs text-gray-400 mt-1">{agent.task}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  agent.status === 'working' || agent.status === 'analyzing' || agent.status === 'coding' || agent.status === 'testing' || agent.status === 'creating-pr' || agent.status === 'setting-up' ? 'bg-purple-gradient-start/20 text-purple-gradient-start' : 
                  agent.status === 'completed' ? 'bg-green-status/20 text-green-status' : 
                  agent.status === 'failed' ? 'bg-red-status/20 text-red-status' : 
                  'bg-white/10 text-gray-400'
                }`}>
                  {agent.status}
                </span>
              </div>
              
              {/* Current activity */}
              <div className="text-xs text-gray-400 mb-2">
                {agent.lastUpdate || getStatusMessage(agent.status, agent.progress)}
              </div>
              
              {/* Footer with time and actions */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">
                  {agent.status === 'completed' && agent.endTime 
                    ? `Completed in ${Math.floor((new Date(agent.endTime).getTime() - new Date(agent.startTime).getTime()) / 1000)}s`
                    : `${Math.floor((Date.now() - new Date(agent.startTime).getTime()) / 1000)}s`
                  }
                </span>
                {/* Only show Stop button for working agents */}
                {(agent.status === 'working' || agent.status === 'starting' || agent.status === 'analyzing' || agent.status === 'coding' || agent.status === 'testing' || agent.status === 'creating-pr' || agent.status === 'setting-up') && (
                  <button 
                    className="text-yellow-status hover:text-yellow-status/80 transition-colors" 
                    onClick={() => stopAgent(Number(issueNumber))}
                  >
                    Stop
                  </button>
                )}
                {/* Only show Retry for failed agents */}
                {agent.status === 'failed' && retryAgent && (
                  <button 
                    className="text-purple-gradient-start hover:text-purple-gradient-start/80 transition-colors" 
                    onClick={() => retryAgent(Number(issueNumber))}
                  >
                    Retry
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {agent.details || 'Processing...'}
              </p>
              <div className="flex justify-between items-center text-xs text-gray-600 mt-2">
                <span>⚡ {agent.status === 'completed' && agent.endTime 
                  ? `${Math.floor((new Date(agent.endTime).getTime() - new Date(agent.startTime).getTime()) / 1000)}s total`
                  : `${Math.floor((Date.now() - new Date(agent.startTime).getTime()) / 1000)}s elapsed`
                }</span>
                <span className="font-semibold text-purple-gradient-start">{agent.progress || 0}%</span>
              </div>
              {agent.status === 'interrupted' ? (
                <button 
                  className="mt-2 py-1 px-2.5 bg-purple-gradient-start/20 border border-purple-gradient-start/30 text-purple-gradient-start text-xs font-medium rounded-md cursor-pointer transition-all hover:bg-purple-gradient-start/30" 
                  onClick={() => retryAgent && retryAgent(Number(issueNumber))}
                >
                  Retry
                </button>
              ) : (
                <button 
                  className="mt-2 py-1 px-2.5 bg-white/5 border border-white/10 text-gray-400 text-xs font-medium rounded-md cursor-pointer transition-all hover:bg-white/10 hover:text-white" 
                  onClick={() => stopAgent(Number(issueNumber))}
                >
                  Stop
                </button>
              )}
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

export default AgentsView;