/**
 * Utility to clear corrupted localStorage data
 */

import { Logger } from './logger';

export function clearCorruptedLocalStorageData() {
  const keysToCheck = [
    'swarmstation_activityLog',
    'swarmstation_repositories', 
    'swarmstation_issues',
    'swarmstation_agents',
    'swarmstation_agentLogs',
    'swarmstation_completedAgentLogs',
    'swarmstation_selectedRepo'
  ];

  let clearedCount = 0;

  keysToCheck.forEach(key => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return;

      const parsed = JSON.parse(item);
      
      // Check if the data structure is corrupted
      if (key.includes('activityLog') || key.includes('repositories') || key.includes('issues')) {
        // These should be arrays
        if (!Array.isArray(parsed)) {
          Logger.warn('CLEAR_CORRUPTED', `Clearing corrupted ${key} - expected array, got: ${typeof parsed}`);
          localStorage.removeItem(key);
          clearedCount++;
        }
      } else if (key.includes('agents') || key.includes('Logs')) {
        // These should be objects (not arrays)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          Logger.warn('CLEAR_CORRUPTED', `Clearing corrupted ${key} - expected object, got: ${typeof parsed}`);
          localStorage.removeItem(key);
          clearedCount++;
        }
      } else if (key === 'swarmstation_selectedRepo') {
        // Should be a string in format "owner/repo"
        if (typeof parsed !== 'string' || !parsed.includes('/')) {
          Logger.warn('CLEAR_CORRUPTED', `Clearing corrupted ${key} - expected owner/repo format, got: ${parsed}`);
          localStorage.removeItem(key);
          clearedCount++;
        }
      }
    } catch (error) {
      // If we can't parse it, it's corrupted
      Logger.error('CLEAR_CORRUPTED', `Failed to parse ${key}, removing:`, error);
      localStorage.removeItem(key);
      clearedCount++;
    }
  });

  if (clearedCount > 0) {
    Logger.info('CLEAR_CORRUPTED', `Cleared ${clearedCount} corrupted localStorage entries`);
  }

  return clearedCount;
}

// Check and clear on load
if (typeof window !== 'undefined') {
  clearCorruptedLocalStorageData();
}