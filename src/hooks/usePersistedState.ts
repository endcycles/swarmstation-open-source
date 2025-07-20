import { useState, useEffect, Dispatch, SetStateAction } from 'react';
import { safeSetJSON, monitorStorageUsage, truncateForStorage } from '../../core/utils/localStorageManager';
import { Logger } from '../../core/utils/logger';

// Type guard functions for runtime validation
function isRecord<T>(value: unknown, itemValidator?: (item: unknown) => item is T): value is Record<string, T> {
  return typeof value === 'object' && 
         value !== null && 
         !Array.isArray(value) &&
         (itemValidator ? Object.values(value).every(itemValidator) : true);
}

function validateStoredValue<T>(key: string, value: unknown, defaultValue: T): T {
  // If default is an array, stored should be array
  if (Array.isArray(defaultValue)) {
    if (!Array.isArray(value)) {
      Logger.warn('STORAGE', `Expected array for ${key}, got: ${typeof value}`, value);
      return defaultValue;
    }
    return value as T;
  }
  
  // If default is a string, check for empty
  if (typeof defaultValue === 'string') {
    if (typeof value !== 'string' || value === '') {
      Logger.warn('STORAGE', `Invalid string found for ${key}, using default`);
      return defaultValue;
    }
    return value as T;
  }
  
  // If default is an object (not array), validate structure
  if (defaultValue && typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      Logger.warn('STORAGE', `Expected object for ${key}, got: ${typeof value}`, value);
      return defaultValue;
    }
    
    // For Record types, ensure all values are arrays if expected
    if (isRecord(defaultValue) && Object.values(defaultValue).length > 0) {
      const firstValue = Object.values(defaultValue)[0];
      if (Array.isArray(firstValue)) {
        // Validate each property is an array
        const validatedRecord: any = {};
        for (const [k, v] of Object.entries(value as object)) {
          // For agentLogs, keys should be numeric issue numbers
          if (key === 'swarmstation_agentLogs' && isNaN(parseInt(k))) {
            Logger.warn('STORAGE', `Skipping invalid key "${k}" in ${key}`);
            continue;
          }
          
          if (Array.isArray(v)) {
            validatedRecord[k] = v;
          } else {
            Logger.warn('STORAGE', `Expected array for ${key}.${k}, got: ${typeof v}`);
            // Skip invalid entries
          }
        }
        return validatedRecord as T;
      }
    }
    
    return value as T;
  }
  
  return value as T;
}

// Custom hook for persisting state to localStorage with quota management
export function usePersistedState<T>(
  key: string, 
  defaultValue: T,
  cleanupFn?: (value: T) => T
): [T, Dispatch<SetStateAction<T>>] {
  // Get initial value from localStorage or use default
  const [state, setState] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return defaultValue;
      
      const parsed = JSON.parse(item);
      const validated = validateStoredValue(key, parsed, defaultValue);
      
      // Apply cleanup function if provided
      if (cleanupFn) {
        return cleanupFn(validated);
      }
      
      return validated;
    } catch (error) {
      Logger.error('STORAGE', `Error loading ${key} from localStorage`, error);
      return defaultValue;
    }
  });

  // Save to localStorage whenever state changes
  useEffect(() => {
    const saveState = async () => {
      try {
        // Save state without modification - no timestamp contamination
        const stateToSave = state;
        
        // Truncate large objects before saving
        const truncated = truncateForStorage(stateToSave);
        
        // Use safe storage with quota management
        const saved = await safeSetJSON(key, truncated);
        if (!saved) {
          Logger.error('STORAGE', `Failed to save ${key} - storage full`);
        }
        
        // Save metadata separately if needed for debugging
        if (state && typeof state === 'object' && !Array.isArray(state)) {
          const metadata = {
            timestamp: new Date().toISOString(),
            keys: Object.keys(state).length
          };
          // Only save metadata in development
          if (process.env.NODE_ENV === 'development') {
            localStorage.setItem(`${key}_meta`, JSON.stringify(metadata));
          }
        }
        
        // Monitor usage
        await monitorStorageUsage();
      } catch (error) {
        Logger.error('STORAGE', `Error saving ${key} to localStorage`, error);
      }
    };
    
    saveState();
  }, [key, state]);

  return [state, setState];
}

// App state interface
interface AppState {
  selectedRepo: string | null;
  repositories: any[];
  issues: any[];
  selectedIssues: number[];
  agents: Record<string, any>;
  pullRequests: any[];
  activityLog?: string[];
}

// Save entire app state
export async function saveAppState(state: AppState): Promise<void> {
  try {
    const stateToSave = {
      selectedRepo: state.selectedRepo,
      repositories: state.repositories,
      issues: state.issues,
      selectedIssues: state.selectedIssues,
      agents: state.agents,
      pullRequests: state.pullRequests,
      activityLog: state.activityLog ? state.activityLog.slice(-100) : [], // Keep only last 100 activities
      timestamp: new Date().toISOString()
    };
    
    // Truncate and save safely
    const truncated = truncateForStorage(stateToSave, 2 * 1024 * 1024); // Max 2MB
    const saved = await safeSetJSON('swarmstation_app_state', truncated);
    
    if (!saved) {
      Logger.error('STORAGE', 'Failed to save app state - storage full');
      // Try to save critical data only
      const minimalState = {
        selectedRepo: state.selectedRepo,
        selectedIssues: state.selectedIssues,
        timestamp: new Date().toISOString()
      };
      await safeSetJSON('swarmstation_app_state_minimal', minimalState);
    }
  } catch (error) {
    Logger.error('STORAGE', 'Error saving app state', error);
  }
}

// Load entire app state
export function loadAppState(): AppState | null {
  try {
    const saved = window.localStorage.getItem('swarmstation_app_state');
    if (saved) {
      const state = JSON.parse(saved);
      // Check if state is not too old (e.g., 7 days)
      const stateAge = Date.now() - new Date(state.timestamp).getTime();
      const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      
      if (stateAge < maxAge) {
        return state;
      } else {
        // Clear old state
        window.localStorage.removeItem('swarmstation_app_state');
      }
    }
  } catch (error) {
    Logger.error('STORAGE', 'Error loading app state', error);
  }
  return null;
}