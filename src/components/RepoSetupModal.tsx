import React, { useState, useEffect } from 'react';
import { CLIStatus, Repository } from '../types';

interface RepoSetupModalProps {
  show: boolean;
  onClose: () => void;
  cliStatus: CLIStatus;
  refreshCLIStatus: () => void;
  loadUserRepositories: () => void;
  selectRepository: (repo: string) => void;
  selectedRepo: string;
  continueSetup: () => void;
  repositories: Repository[];
}

const RepoSetupModal: React.FC<RepoSetupModalProps> = ({
  show,
  onClose,
  cliStatus,
  refreshCLIStatus,
  loadUserRepositories,
  selectRepository,
  selectedRepo,
  continueSetup,
  repositories
}) => {
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    if (show) {
      // Reset to step 1 when modal opens
      setCurrentStep(1);
      refreshCLIStatus();
    }
  }, [show]);

  useEffect(() => {
    // Auto-advance steps when dependencies are met (only on initial load)
    if (show && currentStep === 1) {
      if (cliStatus.claude && cliStatus.gh && cliStatus.ghAuthenticated) {
        setCurrentStep(3);
      } else if (cliStatus.claude && cliStatus.gh && !cliStatus.ghAuthenticated) {
        setCurrentStep(2);
      }
    }
  }, [show, cliStatus.claude, cliStatus.gh, cliStatus.ghAuthenticated]);

  useEffect(() => {
    if (cliStatus.gh && cliStatus.ghAuthenticated && repositories.length === 0) {
      loadUserRepositories();
    }
  }, [cliStatus.gh, cliStatus.ghAuthenticated, repositories.length, loadUserRepositories]);

  if (!show) return null;

  const renderStep = () => {
    switch(currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-semibold mb-2 text-white">Welcome to Swarm Station</h3>
              <p className="text-gray-400 text-sm">Let's check your setup to get started</p>
            </div>
            
            <div className="space-y-3">
              <div className="p-4 bg-bg-tertiary border rounded-lg border-green-status">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-white">Claude SDK</h4>
                    <p className="text-sm text-gray-400 mt-1">AI agent functionality</p>
                  </div>
                  <span className="text-green-status">✓ Integrated</span>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  Claude Code SDK is built into SwarmStation
                </div>
              </div>

              <div className={`p-4 bg-bg-tertiary border rounded-lg ${cliStatus.gh ? 'border-green-status' : 'border-primary'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-white">GitHub CLI</h4>
                    <p className="text-sm text-gray-400 mt-1">Required for repository access</p>
                  </div>
                  {cliStatus.gh ? (
                    <span className="text-green-status">✓ Installed</span>
                  ) : (
                    <span className="text-red-500">✗ Not found</span>
                  )}
                </div>
                {!cliStatus.gh && (
                  <div className="mt-4 p-4 bg-bg-tertiary rounded text-xs">
                    <code className="text-purple-gradient-start">brew install gh</code>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between gap-4">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-bg-tertiary border border-primary rounded-lg text-sm hover:bg-gray-600 transition-colors text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (cliStatus.gh) {
                    setCurrentStep(2);
                  } else {
                    refreshCLIStatus();
                  }
                }}
                className="px-6 py-2 bg-purple-gradient-start text-white rounded-lg text-sm font-medium hover:bg-purple-gradient-start/80 transition-colors disabled:opacity-50"
                disabled={!cliStatus.gh}
              >
                {cliStatus.gh ? 'Continue' : 'Check Again'}
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-semibold mb-2 text-white">Connect GitHub</h3>
              <p className="text-gray-400 text-sm">Authenticate to access your repositories</p>
            </div>

            <div className={`p-4 bg-bg-tertiary border rounded-lg ${cliStatus.ghAuthenticated ? 'border-green-status' : 'border-primary'}`}>
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-white">GitHub Authentication</h4>
                {cliStatus.ghAuthenticated ? (
                  <span className="text-green-status">✓ Connected</span>
                ) : (
                  <span className="text-yellow-500">⚠ Not authenticated</span>
                )}
              </div>
              
              {!cliStatus.ghAuthenticated && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400">Run this command in your terminal:</p>
                  <div className="p-4 bg-bg-tertiary rounded text-xs">
                    <code className="text-purple-gradient-start">gh auth login</code>
                  </div>
                  <p className="text-xs text-gray-500">Follow the prompts to authenticate with GitHub</p>
                </div>
              )}

              {cliStatus.ghAuthenticated && cliStatus.ghUser && (
                <p className="text-sm text-gray-400">Logged in as <span className="text-white font-medium">{cliStatus.ghUser}</span></p>
              )}
            </div>

            <div className="flex justify-between gap-4">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 bg-bg-tertiary border border-primary rounded-lg text-sm hover:bg-gray-600 transition-colors text-white"
              >
                Back
              </button>
              <button
                onClick={() => {
                  if (cliStatus.ghAuthenticated) {
                    setCurrentStep(3);
                    if (repositories.length === 0) {
                      loadUserRepositories();
                    }
                  } else {
                    refreshCLIStatus();
                  }
                }}
                className="px-6 py-2 bg-purple-gradient-start text-white rounded-lg text-sm font-medium hover:bg-purple-gradient-start/80 transition-colors disabled:opacity-50"
                disabled={!cliStatus.ghAuthenticated}
              >
                {cliStatus.ghAuthenticated ? 'Continue' : 'Check Status'}
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-semibold mb-2 text-white">Select Repository</h3>
              <p className="text-gray-400 text-sm">Choose a repository to work with</p>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
              {repositories.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>Loading repositories...</p>
                </div>
              ) : (
                repositories.map(repo => {
                  const repoName = typeof repo === 'string' ? repo : repo.nameWithOwner;
                  return (
                    <button
                      key={repoName}
                      onClick={() => selectRepository(repoName)}
                      className={`w-full p-4 bg-bg-tertiary border rounded-lg text-left hover:bg-gray-600 transition-colors ${selectedRepo === repoName ? 'border-purple-gradient-start bg-purple-gradient-start/10' : 'border-primary'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white">{repoName}</span>
                        {selectedRepo === repoName && (
                          <span className="text-purple-gradient-start">✓</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {selectedRepo && (
              <div className="p-4 bg-purple-gradient-start/10 border border-purple-gradient-start/30 rounded-lg">
                <p className="text-sm text-purple-gradient-start">
                  Selected: <span className="font-medium">{selectedRepo}</span>
                </p>
              </div>
            )}

            <div className="flex justify-between gap-4">
              <button
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 bg-bg-tertiary border border-primary rounded-lg text-sm hover:bg-gray-600 transition-colors text-white"
              >
                Back
              </button>
              <button
                onClick={() => {
                  continueSetup();
                  onClose();
                }}
                className="px-6 py-2 bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end text-white rounded-lg text-sm font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50"
                disabled={!selectedRepo}
              >
                Start Working
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-1000" onClick={onClose}>
      <div 
        className="bg-gray-medium border border-white/10 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress indicator */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${currentStep >= 1 ? 'bg-purple-gradient-start text-white' : 'bg-[rgba(255,255,255,0.1)] text-gray-500'}`}>
              1
            </div>
            <div className={`w-16 h-0.5 ${currentStep >= 2 ? 'bg-purple-gradient-start' : 'bg-[rgba(255,255,255,0.1)]'}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${currentStep >= 2 ? 'bg-purple-gradient-start text-white' : 'bg-[rgba(255,255,255,0.1)] text-gray-500'}`}>
              2
            </div>
            <div className={`w-16 h-0.5 ${currentStep >= 3 ? 'bg-purple-gradient-start' : 'bg-[rgba(255,255,255,0.1)]'}`} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${currentStep >= 3 ? 'bg-purple-gradient-start text-white' : 'bg-[rgba(255,255,255,0.1)] text-gray-500'}`}>
              3
            </div>
          </div>
        </div>

        {renderStep()}
      </div>
    </div>
  );
};

export default RepoSetupModal;