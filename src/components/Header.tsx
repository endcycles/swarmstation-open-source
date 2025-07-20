import React from 'react';
import RepositoryDropdown from './RepositoryDropdown';
import { Repository } from '../types';

interface HeaderProps {
  repositories: Repository[];
  selectedRepo: string;
  setSelectedRepo: (repo: string) => void;
  showRepoSetup: () => void;
  repositoriesLoading?: boolean;
  repositoryConnected?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  repositories,
  selectedRepo,
  setSelectedRepo,
  showRepoSetup,
  repositoriesLoading = false,
  repositoryConnected = false
}) => {
  // Helper function to show only repo name (not owner/repo)
  const getRepoName = (fullName: string) => fullName.split('/').pop() || fullName;
  return (
    <header className="p-4 px-6 pl-[90px] bg-gray-dark border-b border-white/10 flex items-center justify-between flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <h1 className="text-xl font-bold bg-gradient-to-r from-purple-gradient-start to-purple-gradient-end bg-clip-text text-transparent flex items-center gap-2">
        Swarm Station
        <span className="text-[0.6rem] font-medium py-[0.1rem] px-2 bg-purple-gradient-start/10 text-purple-gradient-start/80 border border-purple-gradient-start/20 rounded-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          BETA
        </span>
      </h1>
      <div className="flex items-center gap-8 text-[0.9rem]">
        {repositoriesLoading ? (
          <div className="flex items-center gap-2">
            <span className="text-gray-text flex items-center gap-1">
              Repository:
              <span className={`w-2 h-2 rounded-full ${repositoryConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </span>
            <div className="px-4 py-2 bg-gray-medium border border-white/10 rounded-lg text-gray-text text-sm min-w-[150px]">
              Loading...
            </div>
          </div>
        ) : repositories.length > 0 ? (
          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <span className="text-gray-text whitespace-nowrap flex items-center gap-1">
              Repository:
              <span className={`w-2 h-2 rounded-full ${repositoryConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </span>
            <RepositoryDropdown
              repositories={repositories}
              selectedRepo={selectedRepo}
              setSelectedRepo={setSelectedRepo}
              repositoriesLoading={repositoriesLoading}
            />
          </div>
        ) : (
          <button 
            onClick={showRepoSetup}
            className="px-4 py-2 bg-purple-gradient-start/20 text-purple-gradient-start border border-purple-gradient-start/30 rounded-lg text-sm font-medium hover:bg-purple-gradient-start/30 transition-colors cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            Setup Repository
          </button>
        )}
        
        {/* Settings Icon */}
        <button 
          onClick={showRepoSetup} 
          className="text-gray-400 hover:text-white hover:bg-white/5 rounded-lg p-2 transition-all"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        
        {/* Support Icon */}
        <button 
          onClick={() => window.electronAPI?.shell?.openExternal('https://discord.gg/swarmstation') || window.open('https://discord.gg/swarmstation', '_blank')} 
          className="text-gray-400 hover:text-white hover:bg-white/5 rounded-lg p-2 transition-all"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Support"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.546-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
    </header>
  );
};

export default Header;
