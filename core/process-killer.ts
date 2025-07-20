import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { Logger } from './utils/logger';

const execPromise = promisify(exec);

/**
 * Kill all child processes spawned by the Claude SDK
 * This is a more aggressive cleanup for zombie processes
 */
export async function killAllClaudeProcesses(): Promise<void> {
  Logger.debug('PROCESS-KILLER', 'Starting aggressive process cleanup');
  
  try {
    if (os.platform() === 'darwin' || os.platform() === 'linux') {
      // On Unix-like systems, use pkill
      const commands = [
        // Kill any processes with claude in the command
        'pkill -f "claude.*code" || true',
        'pkill -f "node.*claude" || true',
        'pkill -f "@anthropic-ai/claude-code" || true',
        // Kill any orphaned node processes that might be SDK-related
        'pkill -f "node.*sdk" || true',
        'pkill -f "node.*query" || true'
      ];
      
      for (const cmd of commands) {
        try {
          await execPromise(cmd);
          Logger.debug('PROCESS-KILLER', `Executed: ${cmd}`);
        } catch (error) {
          // Ignore errors - pkill returns non-zero if no processes found
        }
      }
      
      // Also try to find and kill processes by parent PID
      try {
        const { stdout } = await execPromise(`ps aux | grep -E "(claude|@anthropic)" | grep -v grep | awk '{print $2}'`);
        const pids = stdout.trim().split('\n').filter(pid => pid);
        
        for (const pid of pids) {
          try {
            await execPromise(`kill -9 ${pid}`);
            Logger.debug('PROCESS-KILLER', `Killed PID: ${pid}`);
          } catch {
            // Process might already be dead
          }
        }
      } catch {
        // No processes found
      }
      
    } else if (os.platform() === 'win32') {
      // On Windows, use taskkill
      const commands = [
        'taskkill /F /IM node.exe /FI "COMMANDLINE eq *claude*"',
        'taskkill /F /IM node.exe /FI "COMMANDLINE eq *anthropic*"'
      ];
      
      for (const cmd of commands) {
        try {
          await execPromise(cmd);
          Logger.debug('PROCESS-KILLER', `Executed: ${cmd}`);
        } catch (error) {
          // Ignore errors - taskkill returns error if no processes found
        }
      }
    }
    
    Logger.debug('PROCESS-KILLER', 'Aggressive cleanup completed');
  } catch (error) {
    Logger.error('PROCESS-KILLER', 'Error during cleanup', error);
  }
}

/**
 * Get all child processes of the current process
 */
export async function getChildProcesses(): Promise<number[]> {
  const currentPid = process.pid;
  const childPids: number[] = [];
  
  try {
    if (os.platform() === 'darwin' || os.platform() === 'linux') {
      // Use ps to find child processes
      const { stdout } = await execPromise(`ps -o pid,ppid -ax | grep " ${currentPid} " | awk '{print $1}'`);
      const pids = stdout.trim().split('\n').filter(pid => pid && pid !== currentPid.toString());
      childPids.push(...pids.map(pid => parseInt(pid)));
    } else if (os.platform() === 'win32') {
      // Use wmic on Windows
      const { stdout } = await execPromise(`wmic process where ParentProcessId=${currentPid} get ProcessId`);
      const lines = stdout.trim().split('\n').slice(1); // Skip header
      const pids = lines.map(line => line.trim()).filter(pid => pid);
      childPids.push(...pids.map(pid => parseInt(pid)));
    }
  } catch (error) {
    Logger.error('PROCESS-KILLER', 'Error getting child processes', error);
  }
  
  return childPids;
}

/**
 * Kill a specific process by PID
 */
export async function killProcess(pid: number): Promise<void> {
  try {
    if (os.platform() === 'win32') {
      await execPromise(`taskkill /F /PID ${pid}`);
    } else {
      await execPromise(`kill -9 ${pid}`);
    }
    Logger.debug('PROCESS-KILLER', `Killed process ${pid}`);
  } catch (error) {
    // Process might already be dead
  }
}