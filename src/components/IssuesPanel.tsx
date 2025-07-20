import React from 'react';
import { Repository, Issue, CLIStatus, Agent, PullRequest, ParsedIssue, Label } from '../types';
import { Logger } from '../../core/utils/logger';

// Helper function to simplify issue titles
const cleanIssueTitle = (title: string) => title.replace(/^(Fix|Update|Implement|Add|Remove):\s*/i, '').trim();

interface SelectAllButtonProps {
  isAllSelected: boolean;
  onToggle: () => void;
  selectedCount: number;
  selectableCount: number;
}

// SelectAllButton component
function SelectAllButton({ isAllSelected, onToggle, selectedCount, selectableCount }: SelectAllButtonProps) {
  const isSelected = selectedCount > 0;
  
  return (
    <button
      onClick={onToggle}
      className={`
        px-4 py-2 rounded-full text-sm font-medium
        transition-all duration-300 ease-in-out
        transform hover:scale-105 active:scale-95
        ${isSelected 
          ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30' 
          : 'bg-purple-gradient-start hover:bg-purple-600 text-white shadow-lg shadow-purple-500/30'
        }
      `}
    >
      {isSelected ? 'Deselect All' : 'Select All'}
      <span className="ml-1 opacity-70">
        ({selectedCount}/{selectableCount})
      </span>
    </button>
  );
}

interface IssuesPanelProps {
  repositories: Repository[];
  selectedRepo: string;
  setSelectedRepo: (repo: string) => void;
  issues: Issue[];
  selectedIssues: number[];
  toggleIssue: (issueNumber: number) => void;
  deployAgents: () => void;
  isDeploying: boolean;
  loading: boolean;
  error: string | null;
  cliStatus: CLIStatus;
  loadRepositories: () => void;
  loadIssues: () => void;
  showRepoSetup: () => void;
  showCreateIssue: () => void;
  showEditIssue: (issue: Issue) => void;
  addActivity: (message: string) => void;
  agents: Record<string, Agent>;
  closingIssues: Set<number>;
  pullRequests: PullRequest[];
  createIssues: (issues: ParsedIssue[]) => Promise<void>;
  parseIssues: (text: string) => Promise<ParsedIssue[]>;
  isCreatingIssues: boolean;
  setSelectedIssues: (issues: number[]) => void;
  bulkCloseIssues: (issueNumbers: number[]) => void;
  showBulkIssueCreator: () => void;
}

function IssuesPanel({
  repositories,
  selectedRepo,
  setSelectedRepo,
  issues,
  selectedIssues,
  toggleIssue,
  deployAgents,
  isDeploying,
  loading,
  error,
  cliStatus,
  loadRepositories,
  loadIssues,
  showRepoSetup,
  showCreateIssue,
  showEditIssue,
  addActivity,
  agents,
  closingIssues,
  pullRequests,
  createIssues,
  parseIssues,
  isCreatingIssues,
  setSelectedIssues,
  bulkCloseIssues,
  showBulkIssueCreator,
}: IssuesPanelProps) {

  // Calculate selectable issues count
  const selectableIssues = issues.filter((issue: Issue) => {
    const hasPR = pullRequests && pullRequests.some((pr: PullRequest) => {
      // Method 1: Check if PR has issue field set
      if (pr.issue === issue.number) {
        return true;
      }
      
      // Method 2: Regex matching as fallback
      const issueRegex = new RegExp(`\\b#${issue.number}\\b`);
      return (pr.body && issueRegex.test(pr.body)) || 
             (pr.title && issueRegex.test(pr.title));
    });
    const isBeingClosed = closingIssues && closingIssues.has(issue.number);
    return !hasPR && !isBeingClosed;
  });

  const handleSelectAll = () => {
    if (selectedIssues.length > 0) {
      // Deselect all
      setSelectedIssues([]);
    } else {
      // Select all non-PR, non-deleting issues
      const selectableIssueNumbers = selectableIssues.map((issue: Issue) => issue.number);
      setSelectedIssues(selectableIssueNumbers);
    }
  };

  return (
    <aside className="w-[320px] bg-secondary border-r border-white/10 flex flex-col flex-shrink-0">
      {/* Fixed Header */}
      <div className="p-4 px-6 border-b border-white/10">
        <div className="flex justify-between items-center">
          <h2 className="text-base font-semibold text-white">Open Issues</h2>
          <span className="text-sm text-purple-gradient-start bg-purple-gradient-start/10 py-1 px-3 rounded-full">{issues.length} issues</span>
        </div>
      </div>

      {/* Fixed Action Button Section */}
      <div className="p-4 border-b border-white/10">
        <button 
          className="w-full p-2 bg-transparent text-purple-gradient-start border border-dashed border-purple-gradient-start/50 rounded-lg font-medium cursor-pointer transition-all text-sm hover:bg-purple-gradient-start/10 hover:border-purple-gradient-start transform hover:scale-[1.02]" 
          id="create-issues-btn" 
          onClick={showBulkIssueCreator}
        >
          + Create Issues
        </button>
      </div>

      {/* Fixed Select All Controls */}
      {issues.length > 0 && !loading && !error && (
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <SelectAllButton
            isAllSelected={selectedIssues.length === selectableIssues.length && selectableIssues.length > 0}
            onToggle={handleSelectAll}
            selectedCount={selectedIssues.length}
            selectableCount={selectableIssues.length}
          />
          {selectedIssues.length > 0 && (
            <button
              onClick={() => bulkCloseIssues(selectedIssues)}
              className="text-xs text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-400/10"
            >
              Close {selectedIssues.length} Issues
            </button>
          )}
        </div>
      )}

      {/* Scrollable Issues List */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" id="issues-list">
        {error && (
          <div className="mb-4 p-3 bg-error/10 border border-error/30 rounded-lg">
            <p className="text-error text-sm">
              {error.includes('disabled issues') ? (
                <>
                  <strong>Issues Disabled</strong>
                  <br />
                  <span className="text-gray-400 text-xs">This repository has issues disabled. Please select another repository or enable issues in the repository settings.</span>
                </>
              ) : error.includes('fork') ? (
                <>
                  <strong>Forked Repository</strong>
                  <br />
                  <span className="text-gray-400 text-xs">This is a forked repository. Consider using the upstream repository or enabling issues on your fork.</span>
                </>
              ) : (
                error
              )}
            </p>
          </div>
        )}

        {/* Issues List */}
        {!cliStatus.gh || !cliStatus.ghAuthenticated || repositories.length === 0 || !selectedRepo ? (
          <div className="text-center py-12 px-4">
            <div className="text-gray-400 mb-4">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h3 className="text-white font-medium mb-2">Setup Required</h3>
              <p className="text-sm text-gray-400">
                {!cliStatus.gh ? 'GitHub CLI not found - please install it' :
                 !cliStatus.ghAuthenticated ? 'Please authenticate with GitHub' :
                 repositories.length === 0 ? 'Loading repositories...' :
                 !selectedRepo ? 'Please select a repository' :
                 'Complete the setup to start working'}
              </p>
            </div>
            <button
              onClick={showRepoSetup}
              className="px-6 py-2.5 bg-gradient-to-r from-purple-gradient-start to-purple-gradient-end text-white rounded-lg text-sm font-medium transition-all transform hover:scale-105 hover:shadow-lg"
            >
              Open Setup
            </button>
          </div>
        ) : loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-purple-gradient-start border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-400 text-sm">Loading issues...</p>
          </div>
        ) : issues.length === 0 && !error ? (
          <div className="text-center py-12 px-4">
            <svg className="w-12 h-12 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-white font-medium mb-2">No Open Issues</h3>
            <p className="text-gray-400 text-sm">All issues have been resolved!</p>
          </div>
        ) : issues.length > 0 ? (
          issues.map((issue: Issue) => {
            const hasActiveAgent = agents && agents[issue.number];
            const agentStatus = hasActiveAgent ? agents[issue.number].status : null;
            const isBeingClosed = closingIssues && closingIssues.has(issue.number);
            const hasPR = pullRequests && pullRequests.some((pr: PullRequest) => {
              // Method 1: Check if PR has issue field set
              if (pr.issue === issue.number) {
                Logger.debug('PR-DEBUG', `Issue #${issue.number} has PR via issue field: PR #${pr.number}`);
                return true;
              }
              
              // Method 2: Regex matching as fallback
              const issueRegex = new RegExp(`\\b#${issue.number}\\b`);
              const matchesTitle = pr.title && issueRegex.test(pr.title);
              const matchesBody = pr.body && issueRegex.test(pr.body);
              
              if (matchesTitle || matchesBody) {
                Logger.debug('PR-DEBUG', `Issue #${issue.number} has PR via regex: PR #${pr.number} (title: ${matchesTitle}, body: ${matchesBody})`);
                return true;
              }
              
              return false;
            });
            const isDisabled = hasPR || isBeingClosed;
            
            // Find the associated PR for display
            const associatedPR = hasPR ? pullRequests.find((pr: PullRequest) => 
              pr.issue === issue.number || 
              (new RegExp(`\\b#${issue.number}\\b`).test(pr.title || '') || 
               new RegExp(`\\b#${issue.number}\\b`).test(pr.body || ''))
            ) : null;
            
            return (
              <div
                key={issue.number}
                className={`relative bg-white/5 border rounded-lg p-3 mb-2 transition-all duration-150 text-sm ${
                  !isDisabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                } ${
                  selectedIssues.includes(issue.number) && !isDisabled
                    ? 'bg-purple-gradient-start/30 border-2 border-purple-gradient-start shadow-[0_0_0_2px_rgba(168,85,247,0.4),inset_0_2px_4px_rgba(0,0,0,0.3)] shadow-sm transform scale-[0.99]' 
                    : !isDisabled ? 'border border-white/10 hover:bg-gray-600 hover:shadow-[0_2px_8px_rgba(102,126,234,0.1)] active:transform active:scale-[0.99]' : 'border border-white/10'
                } ${hasActiveAgent ? 'issue-item-active' : ''} ${isBeingClosed ? 'opacity-50' : ''}`}
                onClick={() => !isDisabled && !isDeploying && toggleIssue(issue.number)}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {selectedIssues.includes(issue.number) && !isDisabled && (
                        <svg className="w-4 h-4 text-purple-gradient-start flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                      <span className="text-purple-gradient-start font-semibold text-sm">#{issue.number}</span>
                      {hasPR && associatedPR && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          associatedPR.state === 'MERGED' ? 'bg-purple-500/20 text-purple-400' :
                          associatedPR.state === 'CLOSED' ? 'bg-gray-500/20 text-gray-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          🔗 PR #{associatedPR.number || '[pending]'}
                        </span>
                      )}
                      {hasActiveAgent && (
                        <span className={`text-xs px-2 py-0.5 rounded-full agent-badge ${
                          agentStatus === 'completed' ? 'bg-green-status/20 text-green-status' :
                          agentStatus === 'failed' ? 'bg-red-status/20 text-red-status' :
                          agentStatus === 'working' || agentStatus === 'running' ? 'bg-purple-gradient-start/20 text-purple-gradient-start' :
                          agentStatus === 'starting' ? 'bg-yellow-status/20 text-yellow-status' :
                          'bg-gray-600/20 text-gray-600'
                        }`}>
                          {agentStatus === 'working' || agentStatus === 'running' ? '⚡ Active' :
                           agentStatus === 'starting' ? '🚀 Starting' :
                           agentStatus === 'completed' ? '✓ Done' :
                           agentStatus === 'failed' ? '⚠️ Failed' :
                           agentStatus}
                        </span>
                      )}
                    </div>
                    <div className="text-gray-300 text-sm mb-1">{cleanIssueTitle(issue.title)}</div>
                    {issue.labels && issue.labels.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {issue.labels.map((label: Label | string) => {
                          const labelName = typeof label === 'string' ? label : label.name;
                          const labelClass = labelName.split('-')[0];
                          return (
                            <span key={labelName} className={`text-xs py-[0.1rem] px-1.5 rounded-full bg-white/5 text-gray-300 ${labelClass === 'bug' ? 'bg-red-status/20 text-red-status' : labelClass === 'feature' ? 'bg-green-status/20 text-green-status' : labelClass === 'enhancement' ? 'bg-yellow-status/20 text-yellow-status' : ''}`}>{labelName}</span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      showEditIssue(issue);
                    }}
                    className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0 ml-2"
                    title="Edit issue"
                  >
                    <svg className="w-4 h-4 text-gray-500 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
                
                {/* Loading overlay when deleting */}
                {isBeingClosed && (
                  <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center backdrop-blur-sm">
                    <div className="w-6 h-6 border-2 border-purple-gradient-start border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
            );
          })
        ) : null}
      </div>

      {/* Fixed Deploy Agents Button */}
      <div className="p-4 border-t border-white/10">
        <button
          className="w-full p-3 bg-gradient-to-r from-purple-gradient-start to-purple-gradient-end text-white rounded-lg font-semibold cursor-pointer transition-all text-base transform hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
          onClick={() => {
          deployAgents();
          addActivity(`Deploying ${selectedIssues.length} agent${selectedIssues.length !== 1 ? 's' : ''}...`);
        }}
          disabled={selectedIssues.length === 0 || isDeploying}
        >
          {isDeploying ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Deploying...
            </span>
          ) : (
            `Deploy ${selectedIssues.length} Agent${selectedIssues.length !== 1 ? 's' : ''}`
          )}
        </button>
      </div>
    </aside>
  );
}

export default IssuesPanel;