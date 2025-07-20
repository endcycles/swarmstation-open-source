import React from 'react';

const WorkspaceSetupStep: React.FC = () => {
  return (
    <div className="p-6 bg-white/3 border border-white/10 rounded-xl">
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center justify-center w-7 h-7 bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end text-white rounded-full text-sm font-semibold">
          3
        </div>
        <div className="text-base font-semibold text-white">Local Workspace</div>
      </div>
      <div className="ml-12">
        <p className="mb-4 text-gray-text">SwarmStation will create a workspace for agents:</p>
        <div className="bg-white/3 border border-white/10 rounded-lg p-4">
          <div className="text-gray-text text-sm">Workspace location:</div>
          <div className="flex items-center gap-4 mt-2">
            <code className="flex-1 p-2 bg-black/30 border border-white/10 rounded-md font-mono text-sm text-white">
              ~/SwarmStation/agents
            </code>
            <button 
              className="p-2 bg-white/5 border border-white/10 rounded-md text-gray-text cursor-pointer transition-colors hover:bg-white/10 hover:text-white" 
              onClick={() => window.electronAPI?.system.openWorkspace()} 
              title="Open folder"
              aria-label="Open workspace folder"
            >
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-text mt-4">
            Each agent works in an isolated directory
          </p>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceSetupStep;