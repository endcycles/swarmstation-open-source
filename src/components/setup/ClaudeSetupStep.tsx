import React from 'react';
import { CLIStatus } from '../../types';

interface ClaudeSetupStepProps {
  cliStatus: CLIStatus;
}

const ClaudeSetupStep: React.FC<ClaudeSetupStepProps> = ({ cliStatus }) => {
  return (
    <div className="p-6 bg-secondary border border-white/10 rounded-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-7 h-7 bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end text-white rounded-full text-sm font-semibold">
          1
        </div>
        <div className="text-base font-semibold text-white">Claude Code SDK</div>
      </div>
      <div className="ml-10">
        <div className="flex items-center gap-2 p-3 bg-white/3 rounded-lg mb-4 border-green-status/30">
          <span className="w-3 h-3 rounded-full bg-green-status"></span>
          <span className="text-green-status">
            Claude Code SDK is integrated ✓
          </span>
        </div>
        <div className="mt-4 p-4 bg-white/3 rounded-lg text-sm text-gray-text">
          <p>SwarmStation uses the Claude Code SDK directly.</p>
          <p className="mt-2">No additional installation required!</p>
          <p className="mt-4 text-xs">
            The SDK is embedded in the application and handles all AI agent operations.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ClaudeSetupStep;