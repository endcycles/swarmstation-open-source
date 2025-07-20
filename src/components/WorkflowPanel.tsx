import React, { useState, useRef, useEffect } from 'react';
import { Agent, AgentLog, PullRequest } from '../types';
import AgentsView from './AgentsView';
import PRsView from './PRsView';
import OrchestrationView from './OrchestrationView';
import ErrorBoundary from './ErrorBoundary';

interface WorkflowPanelProps {
  agents: Record<string, Agent>;
  agentLogs: Record<string, AgentLog[]>;
  completedAgentLogs?: Record<string, { logs: AgentLog[], agent: Agent, completedAt: string }>;
  stopAgent: (issueNumber: number) => void;
  addActivity: (message: string) => void;
  pullRequests: PullRequest[];
  viewPR: (prId: number) => void;
  mergePR: (prId: number) => void;
  closePR: (prId: number) => void;
  closePRWithoutConfirm?: (prId: number) => void;
  retryAgent: (issueNumber: number) => void;
  retryAgentWithFeedback?: (issueNumber: number, feedback: string) => void;
  checkForRealPRs?: () => void;
  clearLogs?: () => void;
  onTabChange?: (tab: TabName) => void;
  activeTab?: TabName;
  deployAgent?: (issueNumberOrTask: string | number, repo: string, context?: string) => Promise<void>;
  selectedRepo?: string;
}

export type TabName = 'agents' | 'prs' | 'orchestration';

const WorkflowPanel: React.FC<WorkflowPanelProps> = ({
  agents,
  agentLogs,
  completedAgentLogs,
  stopAgent,
  addActivity,
  pullRequests,
  viewPR,
  mergePR,
  closePR,
  closePRWithoutConfirm,
  retryAgent,
  retryAgentWithFeedback,
  checkForRealPRs,
  clearLogs,
  onTabChange,
  activeTab: controlledActiveTab,
  deployAgent,
  selectedRepo
}) => {
  const [localActiveTab, setLocalActiveTab] = useState<TabName>('agents');
  const activeTab = controlledActiveTab ?? localActiveTab;
  const tabRefs = useRef<Record<TabName, HTMLButtonElement | null>>({
    agents: null,
    prs: null,
    orchestration: null
  });

  const tabs: { name: TabName; label: string }[] = [
    { name: 'agents', label: 'Active Agents' },
    { name: 'prs', label: 'Pull Requests' },
    { name: 'orchestration', label: 'Orchestration' }
  ];

  // Keyboard navigation for tabs
  const handleKeyDown = (e: React.KeyboardEvent, currentTab: TabName) => {
    const currentIndex = tabs.findIndex(tab => tab.name === currentTab);
    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        break;
      case 'ArrowRight':
        e.preventDefault();
        newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = tabs.length - 1;
        break;
    }

    if (newIndex !== currentIndex) {
      const newTab = tabs[newIndex].name;
      if (!controlledActiveTab) {
        setLocalActiveTab(newTab);
      }
      onTabChange?.(newTab);
      tabRefs.current[newTab]?.focus();
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'agents':
        return (
          <ErrorBoundary>
            <AgentsView
              agents={agents}
              stopAgent={stopAgent}
              retryAgent={retryAgent}
              agentLogs={agentLogs}
            />
          </ErrorBoundary>
        );
      case 'prs':
        return (
          <ErrorBoundary>
            <PRsView
              pullRequests={pullRequests}
              viewPR={viewPR}
              mergePR={mergePR}
              closePR={closePR}
              closePRWithoutConfirm={closePRWithoutConfirm}
              checkForRealPRs={checkForRealPRs}
              retryAgentWithFeedback={retryAgentWithFeedback}
              addActivity={addActivity}
              selectedRepo={selectedRepo}
              deployAgent={deployAgent}
            />
          </ErrorBoundary>
        );
      case 'orchestration':
        return (
          <ErrorBoundary>
            <OrchestrationView
              agents={agents}
              agentLogs={agentLogs}
              completedAgentLogs={completedAgentLogs}
              addActivity={addActivity}
              retryAgent={retryAgent}
              clearLogs={clearLogs}
            />
          </ErrorBoundary>
        );
      default:
        return null;
    }
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-secondary">
      <div className="p-4">
        <div className="flex gap-1 p-1 bg-white/5 rounded-lg">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              ref={el => {
                if (el) tabRefs.current[tab.name] = el;
              }}
              onClick={() => {
                if (!controlledActiveTab) {
                  setLocalActiveTab(tab.name);
                }
                onTabChange?.(tab.name);
              }}
              onKeyDown={(e) => handleKeyDown(e, tab.name)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.name
                  ? 'bg-gradient-to-r from-purple-gradient-start to-purple-gradient-end text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
              role="tab"
              aria-selected={activeTab === tab.name}
              aria-controls={`${tab.name}-panel`}
              tabIndex={activeTab === tab.name ? 0 : -1}
              id={`${tab.name}-tab`}
            >
              {tab.label}
              {tab.name === 'prs' && pullRequests.length > 0 && (
                <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                  {pullRequests.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex-1 p-6 overflow-y-auto text-white"
        role="tabpanel"
        aria-labelledby={`${activeTab}-tab`}
        id={`${activeTab}-panel`}
        tabIndex={0}
      >
        {renderTabContent()}
      </div>
    </main>
  );
};

export default WorkflowPanel;