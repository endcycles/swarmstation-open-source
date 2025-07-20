/**
 * LocalStorage quota management utility
 * Handles quota checking, cleanup, and safe storage operations
 */

import { Logger } from './logger';

interface StorageStats {
  used: number;
  total: number;
  available: number;
  percentage: number;
}

interface StorageItem {
  key: string;
  size: number;
  lastModified: number;
  priority: 'high' | 'medium' | 'low';
}

// Storage keys and their priorities
const STORAGE_PRIORITIES: Record<string, 'high' | 'medium' | 'low'> = {
  'swarmstation_app_state': 'high',
  'swarmstation_selectedRepo': 'high',
  'agentLogs': 'low',
  'completedAgentLogs': 'low',
  'activityLog': 'medium',
  'pullRequests': 'medium',
};

// Maximum percentage of quota to use before cleanup
const QUOTA_THRESHOLD = 0.8; // 80%

// Maximum size for individual items (5MB)
const MAX_ITEM_SIZE = 5 * 1024 * 1024;

/**
 * Estimate localStorage usage (works in most browsers)
 */
export async function getStorageStats(): Promise<StorageStats> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const total = estimate.quota || 10 * 1024 * 1024; // Default 10MB
      return {
        used,
        total,
        available: total - used,
        percentage: used / total,
      };
    } catch (error) {
      Logger.error('STORAGE', 'Failed to estimate storage', error);
    }
  }

  // Fallback: estimate based on localStorage content
  let totalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key) || '';
      totalSize += key.length + value.length;
    }
  }

  const estimatedTotal = 10 * 1024 * 1024; // 10MB default
  return {
    used: totalSize * 2, // UTF-16 encoding
    total: estimatedTotal,
    available: estimatedTotal - (totalSize * 2),
    percentage: (totalSize * 2) / estimatedTotal,
  };
}

/**
 * Get size of a localStorage item
 */
function getItemSize(key: string): number {
  const value = localStorage.getItem(key) || '';
  return (key.length + value.length) * 2; // UTF-16
}

/**
 * Get all storage items with metadata
 */
function getAllStorageItems(): StorageItem[] {
  const items: StorageItem[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    // Try to parse item to get timestamp
    let lastModified = 0;
    try {
      const value = localStorage.getItem(key);
      if (value) {
        const parsed = JSON.parse(value);
        if (parsed.timestamp) {
          lastModified = new Date(parsed.timestamp).getTime();
        }
      }
    } catch {
      // Not JSON or no timestamp
    }

    items.push({
      key,
      size: getItemSize(key),
      lastModified,
      priority: STORAGE_PRIORITIES[key] || 'low',
    });
  }

  return items;
}

/**
 * Clean up localStorage to free space
 */
export async function cleanupStorage(targetPercentage: number = 0.6): Promise<number> {
  const stats = await getStorageStats();
  
  if (stats.percentage < QUOTA_THRESHOLD) {
    return 0; // No cleanup needed
  }

  Logger.info('STORAGE', `Storage cleanup triggered: ${(stats.percentage * 100).toFixed(1)}% used`);

  const items = getAllStorageItems();
  
  // Sort by priority (low first) and age (oldest first)
  items.sort((a, b) => {
    if (a.priority !== b.priority) {
      const priorityOrder = { low: 0, medium: 1, high: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return a.lastModified - b.lastModified;
  });

  let freedSpace = 0;
  const targetUsed = stats.total * targetPercentage;
  const toFree = stats.used - targetUsed;

  for (const item of items) {
    if (freedSpace >= toFree) break;
    
    // Skip high priority items unless absolutely necessary
    if (item.priority === 'high' && stats.percentage < 0.95) continue;

    try {
      localStorage.removeItem(item.key);
      freedSpace += item.size;
      Logger.info('STORAGE', `Removed ${item.key} (${(item.size / 1024).toFixed(1)}KB)`);
    } catch (error) {
      Logger.error('STORAGE', `Failed to remove ${item.key}`, error);
    }
  }

  return freedSpace;
}

/**
 * Safely set item in localStorage with quota checking
 */
export async function safeSetItem(key: string, value: string): Promise<boolean> {
  // Check item size
  const itemSize = (key.length + value.length) * 2;
  if (itemSize > MAX_ITEM_SIZE) {
    Logger.error('STORAGE', `Item ${key} too large: ${(itemSize / 1024 / 1024).toFixed(1)}MB`);
    return false;
  }

  // Check quota before saving
  const stats = await getStorageStats();
  if (stats.percentage > QUOTA_THRESHOLD) {
    await cleanupStorage();
  }

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.code === 22) {
      // QuotaExceededError
      Logger.error('STORAGE', 'localStorage quota exceeded, attempting cleanup...');
      await cleanupStorage(0.5); // Aggressive cleanup to 50%
      
      // Try again
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (retryError) {
        Logger.error('STORAGE', 'Failed to save after cleanup', retryError);
        return false;
      }
    }
    throw error;
  }
}

/**
 * Safe JSON stringify and set
 */
export async function safeSetJSON(key: string, value: any): Promise<boolean> {
  try {
    const stringified = JSON.stringify(value);
    return await safeSetItem(key, stringified);
  } catch (error) {
    Logger.error('STORAGE', `Failed to stringify ${key}`, error);
    return false;
  }
}

/**
 * Monitor storage usage and warn when approaching limits
 */
export async function monitorStorageUsage(): Promise<void> {
  const stats = await getStorageStats();
  
  if (stats.percentage > 0.9) {
    Logger.error('STORAGE', `⚠️ localStorage critically full: ${(stats.percentage * 100).toFixed(1)}%`);
  } else if (stats.percentage > QUOTA_THRESHOLD) {
    Logger.warn('STORAGE', `⚠️ localStorage nearly full: ${(stats.percentage * 100).toFixed(1)}%`);
  }
}

/**
 * Truncate large objects before storage
 */
export function truncateForStorage(obj: any, maxSize: number = 1024 * 1024): any {
  const str = JSON.stringify(obj);
  if (str.length * 2 > maxSize) {
    // For arrays, keep only recent items
    if (Array.isArray(obj)) {
      const itemSize = str.length / obj.length;
      const maxItems = Math.floor(maxSize / itemSize / 2);
      return obj.slice(-maxItems);
    }
    
    // For objects with logs, truncate logs
    if (obj.logs && Array.isArray(obj.logs)) {
      return {
        ...obj,
        logs: obj.logs.slice(-100), // Keep last 100 logs
        truncated: true,
      };
    }
    
    // Generic truncation
    return {
      ...obj,
      _truncated: true,
      _originalSize: str.length,
    };
  }
  return obj;
}