import React, { useState, useRef, useEffect } from 'react';

interface Repository {
  nameWithOwner: string;
}

interface RepositoryDropdownProps {
  repositories: Repository[];
  selectedRepo: string;
  setSelectedRepo: (repo: string) => void;
  repositoriesLoading?: boolean;
}

function RepositoryDropdown({ 
  repositories, 
  selectedRepo, 
  setSelectedRepo,
  repositoriesLoading = false 
}: RepositoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Extract repo name for display
  const getRepoName = (fullName: string) => {
    const parts = fullName.split('/');
    return parts.length > 1 ? parts[1] : fullName;
  };
  
  // Get owner from full name
  const getOwnerName = (fullName: string) => {
    const parts = fullName.split('/');
    return parts.length > 1 ? parts[0] : '';
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  if (repositoriesLoading) {
    return (
      <div className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-gray-400 text-sm">
        Loading...
      </div>
    );
  }
  
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-md text-white text-sm transition-all hover:bg-white/10 hover:border-white/20 focus:outline-none focus:ring-1 focus:ring-purple-gradient-start/50"
        style={{ minWidth: 'fit-content' }}
      >
        <span className="font-medium">{getRepoName(selectedRepo)}</span>
        
        <svg 
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute top-full mt-1 bg-gray-dark border border-white/10 rounded-md shadow-xl overflow-hidden z-50 min-w-full animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="max-h-64 overflow-y-auto custom-scrollbar">
            {repositories.map(repo => {
              const repoName = typeof repo === 'string' ? repo : repo.nameWithOwner;
              const displayName = getRepoName(repoName);
              const ownerName = getOwnerName(repoName);
              
              return (
                <button
                  key={repoName}
                  onClick={() => {
                    setSelectedRepo(repoName);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors flex items-center gap-1 group ${
                    selectedRepo === repoName ? 'bg-white/5' : ''
                  }`}
                >
                  <span className="text-gray-500 group-hover:text-gray-400 transition-colors">
                    {ownerName}/
                  </span>
                  <span className="text-white font-medium">
                    {displayName}
                  </span>
                  
                  {selectedRepo === repoName && (
                    <svg className="w-3.5 h-3.5 text-purple-gradient-start ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default RepositoryDropdown;