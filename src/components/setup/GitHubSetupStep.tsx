import React from 'react';
import { CLIStatus } from '../../types';

interface GitHubSetupStepProps {
  cliStatus: CLIStatus;
}

const GitHubSetupStep: React.FC<GitHubSetupStepProps> = ({ cliStatus }) => {
  return (
    <div className="p-6 bg-secondary border border-white/10 rounded-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-7 h-7 bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end text-white rounded-full text-sm font-semibold">
          2
        </div>
        <div className="text-base font-semibold text-white">GitHub CLI</div>
      </div>
      <div className="ml-10">
        <div className={`flex items-center gap-2 p-3 bg-white/3 rounded-lg mb-4 ${cliStatus.git && cliStatus.gh ? 'border-green-status/30' : 'border-red-status/30'}`}>
          <span className={`w-3 h-3 rounded-full ${cliStatus.git && cliStatus.gh ? 'bg-green-status' : 'bg-red-status'}`}></span>
          <span className={cliStatus.git && cliStatus.gh ? 'text-green-status' : 'text-red-status'}>
            {!cliStatus.git ? 'Git not found - required for GitHub CLI' : 
             !cliStatus.gh ? 'GitHub CLI not found' : 
             'GitHub CLI is installed ✓'}
          </span>
        </div>
        
        {(!cliStatus.git || !cliStatus.gh) && (
          <div className="mt-4 p-4 bg-white/3 rounded-lg font-mono text-sm text-gray-text">
            {!cliStatus.git && (
              <>
                <p>Please install Git first:</p>
                <pre className="mt-2 p-2 bg-black/30 rounded">
                  <code className="text-purple-gradient-start">
                    # Using Homebrew (recommended){'\n'}
                    brew install git{'\n\n'}
                    # Or download from git-scm.com
                  </code>
                </pre>
              </>
            )}
            {cliStatus.git && !cliStatus.gh && (
              <>
                <p>Please install GitHub CLI using Homebrew:</p>
                <pre className="mt-2 p-2 bg-black/30 rounded">
                  <code className="text-purple-gradient-start">brew install gh</code>
                </pre>
              </>
            )}
          </div>
        )}

        {cliStatus.gh && (
          <div className="mt-4">
            <div className={`flex items-center gap-2 p-3 bg-white/3 rounded-lg mb-4 ${cliStatus.ghAuthenticated ? 'border-green-status/30' : 'border-red-status/30'}`}>
              <span className={`w-3 h-3 rounded-full ${cliStatus.ghAuthenticated ? 'bg-green-status' : 'bg-red-status'}`}></span>
              <span className={cliStatus.ghAuthenticated ? 'text-green-status' : 'text-red-status'}>
                {cliStatus.ghAuthenticated ? `Authenticated as ${cliStatus.ghUser || 'user'} ✓` : 'Not authenticated with GitHub'}
              </span>
            </div>
            {!cliStatus.ghAuthenticated && (
              <div className="mt-4 p-4 bg-red-status/10 border border-red-status/30 rounded-lg text-red-status">
                <p>You need to authenticate with GitHub:</p>
                <pre className="mt-2 p-2 bg-black/30 rounded">
                  <code>gh auth login</code>
                </pre>
                <p className="mt-2 text-sm">Follow the prompts to authenticate via browser or token.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GitHubSetupStep;