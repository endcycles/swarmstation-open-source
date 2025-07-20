import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { findExecutable } from './executable-finder';
import { Logger } from './utils/logger';

/**
 * Finds a working Node.js executable for the Claude SDK
 * Tries multiple strategies to ensure we can spawn Node processes
 */
export async function findNodeExecutable(): Promise<string | undefined> {
  Logger.debug('NODE-HELPER', 'Finding Node.js executable...');
  
  // Strategy 1: Check for bundled Node.js in resources
  if (app && app.isPackaged) {
    const resourcesPath = process.resourcesPath;
    const bundledNodePaths = [
      path.join(resourcesPath, 'bin', process.platform === 'win32' ? 'node.exe' : 'node'),
      path.join(resourcesPath, process.platform === 'win32' ? 'node.exe' : 'node')
    ];
    
    for (const bundledPath of bundledNodePaths) {
      if (fs.existsSync(bundledPath) && await testNodeExecutable(bundledPath)) {
        Logger.info('NODE-HELPER', `Found bundled Node.js: ${bundledPath}`);
        return bundledPath;
      }
    }
  }
  
  // Strategy 2: Try to find system Node.js
  try {
    const systemNode = await findExecutable('node');
    if (systemNode && await testNodeExecutable(systemNode)) {
      Logger.info('NODE-HELPER', `Found working system Node.js: ${systemNode}`);
      return systemNode;
    }
  } catch (error) {
    Logger.debug('NODE-HELPER', 'System Node.js not found or not working');
  }
  
  // Strategy 3: Check if Node is in PATH
  try {
    const pathNode = await testNodeInPath();
    if (pathNode) {
      Logger.info('NODE-HELPER', 'Found Node.js in PATH');
      return 'node'; // Let the system resolve it
    }
  } catch (error) {
    Logger.debug('NODE-HELPER', 'Node.js not in PATH');
  }
  
  // Strategy 4: Check common Node.js installation locations
  const commonPaths = getCommonNodePaths();
  for (const nodePath of commonPaths) {
    if (fs.existsSync(nodePath) && await testNodeExecutable(nodePath)) {
      Logger.info('NODE-HELPER', `Found Node.js at common location: ${nodePath}`);
      return nodePath;
    }
  }
  
  // Strategy 5: Use Electron as Node (last resort)
  // This requires special handling in the SDK
  Logger.debug('NODE-HELPER', 'No standalone Node.js found, will try Electron as Node');
  return undefined;
}

/**
 * Test if a given executable path works as Node.js
 */
async function testNodeExecutable(execPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(execPath, ['--version'], {
        timeout: 2000,
        stdio: 'pipe'
      });
      
      let output = '';
      proc.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      proc.on('close', (code) => {
        // Check if it's actually Node.js (not Electron)
        const isNode = code === 0 && output.includes('v') && !output.includes('Electron');
        resolve(isNode);
      });
      
      proc.on('error', () => resolve(false));
      
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 2000);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Test if 'node' command works in PATH
 */
async function testNodeInPath(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn('node', ['--version'], {
        timeout: 2000,
        stdio: 'pipe',
        shell: true
      });
      
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
      
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 2000);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Get common Node.js installation paths
 */
function getCommonNodePaths(): string[] {
  const paths: string[] = [];
  
  if (process.platform === 'win32') {
    // Windows paths
    paths.push(
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(process.env.APPDATA || '', 'npm', 'node.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'node', 'node.exe')
    );
    
    // Check NVM for Windows
    const nvmHome = process.env.NVM_HOME;
    if (nvmHome) {
      paths.push(path.join(nvmHome, 'node.exe'));
    }
  } else if (process.platform === 'darwin') {
    // macOS paths
    paths.push(
      '/usr/local/bin/node',
      '/opt/homebrew/bin/node',
      '/opt/homebrew/opt/node/bin/node',
      '/opt/homebrew/opt/node@18/bin/node',
      '/opt/homebrew/opt/node@20/bin/node',
      '/usr/bin/node',
      '/opt/local/bin/node'
    );
    
    // Check NVM paths
    const home = process.env.HOME;
    if (home) {
      paths.push(
        path.join(home, '.nvm', 'versions', 'node', 'v18.0.0', 'bin', 'node'),
        path.join(home, '.nvm', 'versions', 'node', 'v20.0.0', 'bin', 'node')
      );
      
      // Check for any NVM version
      const nvmDir = path.join(home, '.nvm', 'versions', 'node');
      if (fs.existsSync(nvmDir)) {
        try {
          const versions = fs.readdirSync(nvmDir);
          for (const version of versions) {
            paths.push(path.join(nvmDir, version, 'bin', 'node'));
          }
        } catch {
          // Ignore errors
        }
      }
    }
  } else {
    // Linux paths
    paths.push(
      '/usr/bin/node',
      '/usr/local/bin/node',
      '/snap/bin/node',
      '/opt/node/bin/node'
    );
  }
  
  return paths;
}

/**
 * Create a wrapper script that uses Electron as Node
 * This is a fallback when no standalone Node.js is found
 */
export function createElectronNodeWrapper(): string {
  const wrapperPath = path.join(app.getPath('temp'), 'electron-node-wrapper.js');
  
  const wrapperContent = `
#!/usr/bin/env node
// This wrapper allows Electron to act as Node.js
process.env.ELECTRON_RUN_AS_NODE = '1';
require(process.argv[2]);
`;
  
  fs.writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });
  return wrapperPath;
}