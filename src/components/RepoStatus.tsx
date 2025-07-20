import React, { useEffect, useState } from 'react';

function RepoStatus({
  repositoryCloned,
  showRepoSetup
}) {
  const [statusClass, setStatusClass] = useState('');

  useEffect(() => {
    if (repositoryCloned === 'cloned') {
      setStatusClass('cloned');
    } else if (repositoryCloned === 'syncing') {
      setStatusClass('syncing');
    } else {
      setStatusClass('');
    }
  }, [repositoryCloned]);

  return (
    <div className="p-4 bg-secondary border-b border-white/10 flex items-center gap-4">
      <span className={`w-2 h-2 rounded-full ${repositoryCloned ? 'bg-green-status' : 'bg-gray-500'}`}></span>
      <span className="text-sm text-gray-400">
        {repositoryCloned ? (
          <span className="text-white">Repository Ready</span>
        ) : (
          'No repository selected'
        )}
      </span>
      {!repositoryCloned && (
        <button 
          className="ml-auto py-1 px-4 bg-purple-gradient-start/10 border border-purple-gradient-start/30 rounded-full text-purple-gradient-start text-xs cursor-pointer transition-colors hover:bg-purple-gradient-start/20"
          onClick={showRepoSetup}
        >
          Setup
        </button>
      )}
    </div>
  );
}

export default RepoStatus;