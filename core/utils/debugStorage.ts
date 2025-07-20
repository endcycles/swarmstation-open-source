/**
 * Debug utilities for localStorage
 */

import { Logger } from './logger';

export function debugLocalStorage() {
  Logger.info('DEBUG_STORAGE', '=== SwarmStation localStorage Debug ===');
  
  const keys = [
    'swarmstation_selectedRepo',
    'swarmstation_repositories',
    'swarmstation_issues',
    'swarmstation_activityLog',
    'swarmstation_agents',
    'swarmstation_agentLogs',
    'swarmstation_completedAgentLogs'
  ];
  
  keys.forEach(key => {
    try {
      const value = localStorage.getItem(key);
      if (value) {
        const parsed = JSON.parse(value);
        Logger.debug('DEBUG_STORAGE', `${key}:`, parsed);
        
        // Special checks
        if (key === 'swarmstation_selectedRepo') {
          Logger.debug('DEBUG_STORAGE', `  - Type: ${typeof parsed}`);
          Logger.debug('DEBUG_STORAGE', `  - Valid format: ${typeof parsed === 'string' && parsed.includes('/')}`);
        }
      } else {
        Logger.debug('DEBUG_STORAGE', `${key}: (not set)`);
      }
    } catch (error) {
      Logger.error('DEBUG_STORAGE', `${key}: ERROR parsing`, error);
    }
  });
  
  Logger.info('DEBUG_STORAGE', '=====================================')
}

export function clearAllSwarmStationData() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('swarmstation_'));
  keys.forEach(k => localStorage.removeItem(k));
  Logger.info('DEBUG_STORAGE', `Cleared ${keys.length} SwarmStation keys from localStorage`);
  return keys.length;
}

export function clearCorruptedData() {
  const keys = [
    'swarmstation_selectedRepo',
    'swarmstation_repositories',
    'swarmstation_issues',
    'swarmstation_activityLog',
    'swarmstation_agents',
    'swarmstation_agentLogs',
    'swarmstation_completedAgentLogs'
  ];
  
  let clearedCount = 0;
  
  keys.forEach(key => {
    try {
      const value = localStorage.getItem(key);
      if (value) {
        JSON.parse(value); // Just try to parse
      }
    } catch (error) {
      Logger.error('DEBUG_STORAGE', `Clearing corrupted key ${key}:`, error);
      localStorage.removeItem(key);
      clearedCount++;
    }
  });
  
  return clearedCount;
}

export function removeSystemKeysFromStorage() {
  const recordKeys = [
    'swarmstation_agents',
    'swarmstation_agentLogs', 
    'swarmstation_completedAgentLogs'
  ];
  
  let cleanedCount = 0;
  
  recordKeys.forEach(key => {
    try {
      const value = localStorage.getItem(key);
      if (!value) return;
      
      const data = JSON.parse(value);
      if (typeof data !== 'object' || data === null) return;
      
      // Check if any system keys exist
      const systemKeys = Object.keys(data).filter(k => k.startsWith('__'));
      if (systemKeys.length > 0) {
        Logger.debug('DEBUG_STORAGE', `Found ${systemKeys.length} system keys in ${key}:`, systemKeys);
        
        // Remove system keys
        const cleaned: any = {};
        Object.entries(data).forEach(([k, v]) => {
          if (!k.startsWith('__')) {
            cleaned[k] = v;
          }
        });
        
        // Save cleaned data
        localStorage.setItem(key, JSON.stringify(cleaned));
        cleanedCount += systemKeys.length;
      }
    } catch (error) {
      Logger.error('DEBUG_STORAGE', `Error cleaning ${key}:`, error);
    }
  });
  
  Logger.info('DEBUG_STORAGE', `Removed ${cleanedCount} system keys from localStorage`);
  return cleanedCount;
}

// Make it available globally for easy debugging
if (typeof window !== 'undefined') {
  (window as any).debugStorage = debugLocalStorage;
  (window as any).clearStorage = clearAllSwarmStationData;
  (window as any).clearCorrupted = clearCorruptedData;
  (window as any).removeSystemKeys = removeSystemKeysFromStorage;
}