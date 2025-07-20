import React from 'react';

function DetailsPanel({
  agents,
  pullRequests,
  activityLog,
  showRepoSetup,
  agentLogs,
  clearAllData
}) {
  const activeCount = Object.keys(agents).length;
  const completedCount = pullRequests.length;

  const switchToOrchestration = () => {
    const orchestrationTab = document.querySelector('[data-tab="orchestration"]');
    if (orchestrationTab) {
      orchestrationTab.click();
    }
  };

  const exportData = () => {
    const dataToExport = {
      agents,
      agentLogs,
      pullRequests,
      activityLog,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `swarmstation-history-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    if (window.confirm('Clear all agent logs and activity history?\n\nThis will NOT affect:\n• Current pull requests\n• Repository settings\n• Active agents\n\nThe page will reload after clearing.')) {
      // Clear history-related items from localStorage
      localStorage.removeItem('swarmstation_agents');
      localStorage.removeItem('swarmstation_agentLogs');
      localStorage.removeItem('swarmstation_completedAgentLogs');
      localStorage.removeItem('swarmstation_activityLog');
      // Reload to reset state
      window.location.reload();
    }
  };

  return (
    <aside className="w-80 bg-secondary border-l border-white/10 p-6 overflow-y-auto flex-shrink-0 custom-scrollbar">
      {/* Metrics */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold mb-3 text-white">Metrics</h3>
        <div className="grid grid-cols-2 gap-3">
          {/* Active Agents card */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-2xl font-bold bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end bg-clip-text text-transparent mb-1">{activeCount}</div>
            <div className="text-xs text-gray-400">Active Agents</div>
          </div>
          {/* Tasks Completed card */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-3">
            <div className="text-2xl font-bold text-green-status mb-1">{completedCount}</div>
            <div className="text-xs text-gray-400">PRs Created</div>
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="mt-6 relative">
        <h3 className="text-sm font-semibold mb-3 text-white flex items-center justify-between">
          Recent Activity
          {/* Add link to view all in Orchestration */}
          <button
            onClick={switchToOrchestration}
            className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            {/* <span>View All</span>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg> */}
          </button>
        </h3>

        <div
          className="relative max-h-64 overflow-hidden cursor-pointer group"
          onClick={switchToOrchestration}
        >
          <div id="activity-feed" className="space-y-2">
            {activityLog.length === 0 ? (
              <div className="text-xs text-gray-400 py-2">No recent activity</div>
            ) : (
              activityLog.slice(-10).map((item, index) => (
                <div key={index} className="text-xs text-gray-400 py-1.5 border-b border-white/10 group-hover:text-gray-300 transition-colors">
                  {item.message}
                  <div className="text-gray-500 text-[10px] mt-0.5">{item.time}</div>
                </div>
              ))
            )}
          </div>
          {/* Fade overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-secondary to-transparent pointer-events-none" />

          {/* Click hint overlay */}
          <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </div>
      </div>

      {/* Best Practices */}
      <div className="mt-8 p-4 bg-purple-gradient-start/10 border border-purple-gradient-start/20 rounded-lg">
        <h4 className="text-sm mb-2 text-purple-gradient-start">💡 Best Practices</h4>
        <ul className="list-none text-xs">
          <li className="best-practice-item mb-1 text-gray-400">Agents work in isolated branches</li>
          <li className="best-practice-item mb-1 text-gray-400">Repository is synced before each agent</li>
          <li className="best-practice-item mb-1 text-gray-400">Tests run automatically before PRs</li>
          <li className="best-practice-item mb-1 text-gray-400">Failed agents can be retried</li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 space-y-2">
        <button
          onClick={exportData}
          className="w-full py-2 px-3 bg-white/5 border border-white/10 rounded text-xs text-gray-300 hover:bg-gray-600 hover:text-white transition-colors text-left flex items-center gap-2"
        >
          <span>📥</span>
          <span>Export History (JSON)</span>
        </button>

        <button
          onClick={clearHistory}
          className="w-full py-2 px-3 bg-white/5 border border-white/10 rounded text-xs text-gray-300 hover:bg-gray-600 hover:text-white transition-colors text-left flex items-center gap-2"
        >
          <span>🗑️</span>
          <span>Clear Activity History</span>
        </button>

        {/* Developer Actions (only in dev) */}
        {process.env.NODE_ENV === 'development' && clearAllData && (
          <button
            onClick={clearAllData}
            className="w-full py-2 px-3 bg-red-900/20 border border-red-900/30 rounded text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors text-left flex items-center gap-2"
          >
            <span>💣</span>
            <span>Reset Application</span>
          </button>
        )}
      </div>

    </aside>
  );
}

export default DetailsPanel;