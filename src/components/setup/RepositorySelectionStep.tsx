import React, { useState } from 'react';
import { Repository } from '../../types';

interface RepositorySelectionStepProps {
  repositories: Repository[];
  selectedRepo: string;
  selectRepository: (repo: string) => void;
}

const RepositorySelectionStep: React.FC<RepositorySelectionStepProps> = ({
  repositories,
  selectedRepo,
  selectRepository
}) => {
  const [repoFilter, setRepoFilter] = useState('');

  const filteredRepos = repositories.filter(repo => {
    const repoName = repo.nameWithOwner || repo.name;
    return repoName.toLowerCase().includes(repoFilter.toLowerCase());
  });

  return (
    <div className="p-6 bg-secondary border border-white/10 rounded-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center justify-center w-7 h-7 bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end text-white rounded-full text-sm font-semibold">
          4
        </div>
        <div className="text-base font-semibold text-white">Select Repository</div>
      </div>
      <div className="ml-10">
        {repositories.length === 0 ? (
          <p className="text-gray-text text-center py-4">Loading your repositories...</p>
        ) : (
          <>
            <div className="mb-4">
              <input 
                type="text" 
                className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-purple-gradient-start" 
                placeholder="Filter repositories..." 
                value={repoFilter}
                onChange={(e) => setRepoFilter(e.target.value)}
                aria-label="Filter repositories"
              />
            </div>
            <div className="grid gap-2 max-h-[300px] overflow-y-auto">
              {filteredRepos.map(repo => {
                const repoName = repo.nameWithOwner || repo.name;
                const language = repo.primaryLanguage?.name || repo.language || 'Unknown';
                const visibility = repo.isPrivate ? 'private' : 'public';
                const isSelected = selectedRepo === repoName;

                return (
                  <button 
                    key={repoName} 
                    className={`p-3 bg-white/3 border border-white/10 rounded-lg cursor-pointer transition-colors flex justify-between items-center hover:bg-white/5 hover:border-white/20 ${isSelected ? 'bg-purple-gradient-start/10 border-purple-gradient-start' : ''}`} 
                    onClick={() => selectRepository(repoName)}
                    aria-pressed={isSelected}
                    aria-label={`Select repository ${repoName}`}
                  >
                    <div className="flex-1 text-left">
                      <div className="font-semibold text-white text-sm mb-1">{repoName}</div>
                      <div className="text-xs text-gray-600 flex gap-4">
                        <span>{language}</span>
                        <span>{repo.openIssuesCount || 0} open issues</span>
                      </div>
                    </div>
                    <span className="py-0.5 px-1.5 bg-white/10 rounded-full text-xs text-gray-text">
                      {visibility}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default RepositorySelectionStep;