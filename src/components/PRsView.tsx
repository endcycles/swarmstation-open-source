import React, { useState } from 'react';
import FeedbackModal from './FeedbackModal';
import EmptyState from './EmptyState';
import { Logger } from '../../core/utils/logger';

function PRsView(props) {
  Logger.debug('PRsView', 'Component props', props);
  
  const {
    pullRequests = [],
    viewPR,
    mergePR,
    closePR,
    closePRWithoutConfirm,
    checkForRealPRs,
    retryAgentWithFeedback,
    addActivity,
    selectedRepo,
    deployAgent
  } = props || {};
  
  
  // Safety check - ensure pullRequests is always an array
  const safePullRequests = Array.isArray(pullRequests) ? pullRequests : [];
  
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedPR, setSelectedPR] = useState(null);
  const [selectedPRs, setSelectedPRs] = useState(new Set());
  const [showConflictResolution, setShowConflictResolution] = useState(false);
  const [conflictedPRs, setConflictedPRs] = useState([]);
  
    hasAddActivity: !!addActivity,
    safePullRequests: safePullRequests
  });
  
  const selectAll = (e) => {
    if (e.target.checked && safePullRequests.length > 0) {
      setSelectedPRs(new Set(safePullRequests.map(pr => pr.number).filter(num => num)));
    } else {
      setSelectedPRs(new Set());
    }
  };
  
  const bulkMerge = async () => {
    if (selectedPRs.size === 0) return;
    
    const prNumbers = Array.from(selectedPRs);
    const conflicts = [];
    let successCount = 0;
    
    for (const prNumber of prNumbers) {
      const pr = safePullRequests.find(p => p.number === prNumber);
      if (pr) {
        try {
          // Pass silent = true to skip confirmation dialog
          await mergePR(pr.id, true);
          successCount++;
        } catch (error) {
        Logger.error('PRsView', `Failed to merge PR #${prNumber}`, error);
          const errorMessage = error?.message || String(error);
          if (errorMessage && errorMessage.toLowerCase().includes('conflict')) {
            conflicts.push(pr);
          }
        }
      }
    }
    
    setSelectedPRs(new Set());
    
    // Show single summary notification
    if (successCount > 0) {
      addActivity?.(`Successfully merged ${successCount} pull request${successCount > 1 ? 's' : ''}`);
    }
    
    if (conflicts.length > 0) {
      addActivity?.(`${conflicts.length} PR${conflicts.length > 1 ? 's' : ''} had merge conflicts`);
      setConflictedPRs(conflicts);
      setShowConflictResolution(true);
    }
  };
  
  const handleBulkClose = async () => {
    if (selectedPRs.size === 0) return;
    
    const prNumbers = Array.from(selectedPRs);
    let successCount = 0;
    const totalCount = prNumbers.length;
    const closedPRNumbers = [];
    
    // Process each PR
    for (const prNumber of prNumbers) {
      try {
        // Find the PR to get its ID
        const pr = safePullRequests.find(p => p.number === prNumber);
        if (pr) {
          // Skip the confirmation dialog by calling closePRWithoutConfirm directly
          // Pass true as second parameter to suppress individual activity notifications
          await closePRWithoutConfirm(pr.id || pr.number, true);
          successCount++;
          closedPRNumbers.push(pr.number);
        }
      } catch (error) {
        Logger.error('PRsView', `Failed to close PR #${prNumber}`, error);
      }
    }
    
    // Clear selections
    setSelectedPRs(new Set());
    
    // Show single summary notification after all PRs are processed
    if (addActivity) {
      if (successCount === totalCount) {
        const prText = totalCount === 1 ? 'pull request' : 'pull requests';
        addActivity(`✅ Successfully closed ${totalCount} ${prText}`);
      } else if (successCount > 0) {
        const prText = totalCount === 1 ? 'pull request' : 'pull requests';
        addActivity(`⚠️ Closed ${successCount} of ${totalCount} ${prText}`);
      } else {
        addActivity(`❌ Failed to close all selected pull requests`);
      }
    }
  };
  
  try {
    return (
      <div id="prs-view" className="tab-content">
      {/* Bulk Actions Bar */}
      {safePullRequests.length > 0 && (
        <div className="mb-4 p-4 bg-secondary border border-white/10 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedPRs.size === safePullRequests.length && safePullRequests.length > 0}
                onChange={selectAll}
                className="w-4 h-4 cursor-pointer"
              />
              <span className="text-sm text-white">Select All ({selectedPRs.size} of {safePullRequests.length} selected)</span>
            </label>
          </div>
          
          {selectedPRs.size > 0 && (
            <div className="flex gap-2">
              <button
                onClick={bulkMerge}
                className="py-1 px-3 rounded-md border border-green-status bg-green-status/20 text-green-status text-sm cursor-pointer transition-colors hover:bg-green-status/30"
              >
                Merge {selectedPRs.size} PRs
              </button>
              <button
                onClick={handleBulkClose}
                className="py-1 px-3 rounded-md border border-red-status bg-red-status/20 text-red-status text-sm cursor-pointer transition-colors hover:bg-red-status/30"
              >
                Close {selectedPRs.size} PRs
              </button>
            </div>
          )}
        </div>
      )}

      {safePullRequests && safePullRequests.length > 0 && safePullRequests.some(pr => !pr.number) && (
        <div className="mb-4 flex justify-between items-center">
          <p className="text-sm text-yellow-status">Some PRs are still being created...</p>
          <button 
            onClick={() => checkForRealPRs && checkForRealPRs(true)}
            className="py-1.5 px-4 rounded-lg border border-white/20 bg-white/10 text-white text-sm font-medium cursor-pointer transition-all transform hover:scale-105 hover:bg-white/20"
          >
            Refresh PRs
          </button>
        </div>
      )}
      <div id="prs-grid" className="grid gap-4">
        {safePullRequests.length === 0 ? (
          <div className="empty-state-gradient-border">
            <div className="p-8 bg-secondary rounded-md">
              <EmptyState
                icon={
                  <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                }
                title="No Pull Requests Yet"
                description="Agents will create PRs as they complete their work"
                action={{
                  label: "Check for PRs",
                  onClick: () => checkForRealPRs && checkForRealPRs(true),
                  variant: 'secondary'
                }}
              />
            </div>
          </div>
        ) : (
          safePullRequests.map((pr, index) => (
            <div key={pr.id || `pr-${index}`} className="bg-secondary border border-white/10 rounded-lg p-6 flex items-center">
              <input
                type="checkbox"
                checked={selectedPRs.has(pr.number)}
                onChange={(e) => {
                  const newSelected = new Set(selectedPRs);
                  if (e.target.checked) {
                    newSelected.add(pr.number);
                  } else {
                    newSelected.delete(pr.number);
                  }
                  setSelectedPRs(newSelected);
                }}
                disabled={!pr.number}
                className="w-4 h-4 cursor-pointer mr-4"
              />
              <div className="pr-info flex-1">
                <h3 className="text-base mb-2 text-white">{pr.title}</h3>
                <div className="flex gap-4 text-sm text-gray-text">
                  <span>PR #{pr.number || '[pending]'}</span>
                  <span>Fixes #{pr.issue?.number || pr.issue}</span>
                  {!pr.url && (
                    <span className="text-yellow-status">Creating PR...</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button 
                  className="py-2 px-4 rounded-lg border border-white/20 bg-white/10 text-white text-sm font-medium cursor-pointer transition-all transform hover:scale-105 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed" 
                  onClick={() => viewPR(pr.id || pr.number)}
                  disabled={!pr.url}
                  title={!pr.url ? 'PR URL not available yet' : ''}
                >
                  View
                </button>
                <button 
                  className="py-2 px-4 rounded-lg border border-green-status/40 bg-green-status/20 text-green-status text-sm font-medium cursor-pointer transition-all transform hover:scale-105 hover:bg-green-status/30 disabled:opacity-50 disabled:cursor-not-allowed" 
                  onClick={() => mergePR(pr.id || pr.number)}
                  disabled={!pr.number}
                  title={!pr.number ? 'PR not created yet' : ''}
                >
                  Merge
                </button>
                <button 
                  className="py-2 px-4 rounded-lg border border-red-status/40 bg-red-status/20 text-red-status text-sm font-medium cursor-pointer transition-all transform hover:scale-105 hover:bg-red-status/30 disabled:opacity-50 disabled:cursor-not-allowed" 
                  onClick={() => closePR(pr.id || pr.number)}
                  disabled={!pr.number}
                  title={!pr.number ? 'PR not created yet' : ''}
                >
                  Close PR
                </button>
                <button 
                  className="py-2 px-4 rounded-lg bg-gradient-to-r from-purple-gradient-start to-purple-gradient-end text-white text-sm font-medium cursor-pointer transition-all transform hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed" 
                  onClick={() => {
                    setSelectedPR(pr);
                    setShowFeedbackModal(true);
                  }}
                  disabled={!pr.number}
                  title={!pr.number ? 'PR not created yet' : 'Retry agent with PR feedback'}
                >
                  Retry with Feedback
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      
      {showFeedbackModal && selectedPR && (
        <FeedbackModal
          pr={selectedPR}
          onSubmit={(feedback) => {
            const issueNumber = typeof selectedPR.issue === 'number' ? selectedPR.issue : selectedPR.issue?.number;
            if (issueNumber && retryAgentWithFeedback) {
              retryAgentWithFeedback(issueNumber, feedback);
            }
            setShowFeedbackModal(false);
            setSelectedPR(null);
          }}
          onClose={() => {
            setShowFeedbackModal(false);
            setSelectedPR(null);
          }}
        />
      )}
      
      {showConflictResolution && conflictedPRs.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-secondary border border-white/20 rounded-lg p-6 max-w-md">
            <h3 className="text-xl font-semibold mb-4">Merge Conflicts Detected</h3>
            <p className="text-gray-text mb-4">
              {conflictedPRs.length} PR{conflictedPRs.length > 1 ? 's have' : ' has'} merge conflicts:
            </p>
            <ul className="mb-4 text-sm text-gray-text">
              {conflictedPRs.map(pr => (
                <li key={pr.number}>• PR #{pr.number}: {pr.title}</li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  const prompt = `Fix merge conflicts for the following PRs: ${conflictedPRs.map(pr => `#${pr.number}`).join(', ')}

For each PR:
1. Checkout the PR branch
2. Merge or rebase with main
3. Resolve any conflicts intelligently
4. Push the fixed branch
5. Try to merge the PR again

Work through them sequentially. If a PR merges successfully, move to the next one.`;

                  try {
                    if (deployAgent && selectedRepo) {
                      // Deploy agent with special context for conflict resolution
                      await deployAgent('conflict-resolver', selectedRepo, prompt);
                      setShowConflictResolution(false);
                      setConflictedPRs([]);
                      addActivity?.('Deployed Claude to resolve merge conflicts');
                    } else {
                      Logger.error('PRsView', 'Cannot deploy agent: missing deployAgent function or selectedRepo');
                      addActivity?.('Error: Cannot deploy agent - missing configuration');
                    }
                  } catch (error) {
                    Logger.error('PRsView', 'Error deploying conflict resolver', error);
                    addActivity?.(`Error deploying conflict resolver: ${error.message}`);
                  }
                }}
                className="flex-1 py-2 px-4 bg-gradient-to-r from-purple-gradient-start to-purple-gradient-end text-white rounded-lg hover:shadow-glow transition-all"
              >
                Deploy Claude to Fix
              </button>
              <button
                onClick={() => {
                  setShowConflictResolution(false);
                  setConflictedPRs([]);
                }}
                className="flex-1 py-2 px-4 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  } catch (error) {
    Logger.error('PRsView', 'Component render error', { error, props: { pullRequests, viewPR, mergePR } });
    return <div className="text-red-500">Error in PRsView: {error.message}</div>;
  }
}

export default PRsView;