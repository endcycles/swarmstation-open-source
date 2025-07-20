import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Logger } from './utils/logger';

// Common paths for macOS tools
const COMMON_MAC_PATHS = [
  '/usr/bin',
  '/usr/local/bin',
  '/opt/homebrew/bin',  // Homebrew on Apple Silicon
  '/usr/local/opt/homebrew/bin',  // Alternative Homebrew location
  '/opt/local/bin',  // MacPorts
  '/Users/Shared/homebrew/bin',  // Alternative homebrew location
];

// Common paths for Windows tools
const COMMON_WINDOWS_PATHS = [
  'C:\\Program Files\\Git\\bin',
  'C:\\Program Files (x86)\\Git\\bin',
  'C:\\Program Files\\GitHub CLI',
  'C:\\ProgramData\\chocolatey\\bin',
  'C:\\tools\\git\\bin',
];

// Common paths for Linux tools
const COMMON_LINUX_PATHS = [
  '/usr/bin',
  '/usr/local/bin',
  '/snap/bin',
  '/home/linuxbrew/.linuxbrew/bin',
];

export type ExecutableType = 'git' | 'gh' | 'claude' | 'node';

/**
 * Find an executable in the system
 * @param execType The type of executable to find
 * @returns The full path to the executable or null if not found
 */
export async function findExecutable(execType: ExecutableType): Promise<string | null> {
  Logger.debug('FINDER', `Looking for ${execType} executable`);
  
  // Map executable types to their names
  const executableNames: Record<ExecutableType, string[]> = {
    git: ['git', 'git.exe'],
    gh: ['gh', 'gh.exe'],
    claude: ['claude', 'claude.exe'],
    node: ['node', 'node.exe']
  };
  
  const names = executableNames[execType] || [execType];
  
  // Get platform-specific paths
  const platformPaths = getPlatformPaths();
  
  // Add user's local bin if available
  if (process.env.HOME) {
    platformPaths.push(path.join(process.env.HOME, '.local', 'bin'));
    platformPaths.push(path.join(process.env.HOME, 'bin'));
  }
  
  // Add paths from PATH environment variable
  if (process.env.PATH) {
    const pathDirs = process.env.PATH.split(path.delimiter);
    platformPaths.push(...pathDirs);
  }
  
  // Check if we're in a packaged app
  const isPackaged = app?.isPackaged || false;
  
  // For packaged apps, also check relative to app resources
  if (isPackaged && process.resourcesPath) {
    platformPaths.unshift(
      path.join(process.resourcesPath, 'bin'),
      path.join(process.resourcesPath, '..', 'bin'),
      path.join(process.resourcesPath, '..', '..', 'bin')
    );
  }
  
  // Remove duplicates
  const uniquePaths = [...new Set(platformPaths)];
  
  Logger.debug('FINDER', `Checking ${uniquePaths.length} paths for ${execType}`);
  
  // Check each path for the executable
  for (const dir of uniquePaths) {
    for (const name of names) {
      const fullPath = path.join(dir, name);
      try {
        const stats = await fs.promises.stat(fullPath);
        if (stats.isFile()) {
          // On Unix, check if executable
          if (process.platform !== 'win32') {
            try {
              await fs.promises.access(fullPath, fs.constants.X_OK);
            } catch {
              continue; // Not executable
            }
          }
          Logger.info('FINDER', `Found ${execType} at: ${fullPath}`);
          return fullPath;
        }
      } catch {
        // File doesn't exist or can't be accessed
      }
    }
  }
  
  // Special handling for Node.js - use current process if nothing else found
  if (execType === 'node' && !isPackaged) {
    Logger.info('FINDER', `Using current Node.js process: ${process.execPath}`);
    return process.execPath;
  }
  
  // For system Node.js, try which command as last resort
  if (execType === 'node') {
    try {
      const { execSync } = require('child_process');
      const result = execSync('which node', { encoding: 'utf8' }).trim();
      if (result) {
        Logger.info('FINDER', `Found ${execType} via which: ${result}`);
        return result;
      }
    } catch {
      // which command failed
    }
  }
  
  Logger.warn('FINDER', `${execType} not found in any location`);
  return null;
}

/**
 * Get platform-specific paths to check
 */
function getPlatformPaths(): string[] {
  switch (process.platform) {
    case 'darwin':
      return [...COMMON_MAC_PATHS];
    case 'win32':
      return [...COMMON_WINDOWS_PATHS];
    case 'linux':
      return [...COMMON_LINUX_PATHS];
    default:
      return [...COMMON_LINUX_PATHS]; // Fallback to Linux paths
  }
}

/**
 * Get all checked executable paths for debugging
 */
export function getExecutablePaths(): string[] {
  const paths = getPlatformPaths();
  if (process.env.PATH) {
    paths.push(...process.env.PATH.split(path.delimiter));
  }
  return [...new Set(paths)];
}