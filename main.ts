import { app, BrowserWindow, ipcMain, dialog, shell, IpcMainInvokeEvent } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const isDev = process.env.NODE_ENV === 'development';

// Import services with types
import type { ClaudeService } from './core/claude-service-types';
import type { GitService } from './core/git-service-types';
import { WorktreeCleanupService } from './core/worktree-cleanup-service';
import { Logger } from './core/utils/logger';

// Service instances
let claudeService: ClaudeService | null = null;
let gitService: GitService | null = null;
let cleanupService: WorktreeCleanupService | null = null;

// Load services with error handling
try {
  // Using require for CommonJS compatibility in Electron main process
  claudeService = require('./core-dist/claude-service') as ClaudeService;
  Logger.info('MAIN', 'Claude service loaded successfully');
} catch (error) {
  Logger.error('MAIN', 'Failed to load claude-service', error);
}

try {
  // Using require for CommonJS compatibility in Electron main process
  gitService = require('./core-dist/git-service') as GitService;
  Logger.info('MAIN', 'Git service loaded successfully');
} catch (error) {
  Logger.error('MAIN', 'Failed to load git-service', error);
}

let mainWindow: BrowserWindow | null = null;

// Global unhandled rejection handler
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  Logger.error('UNHANDLED_REJECTION', 'Reason:', reason);
  Logger.error('UNHANDLED_REJECTION', 'Promise:', promise);
  
  // Log to file for debugging
  const errorLog = {
    timestamp: new Date().toISOString(),
    type: 'unhandledRejection',
    reason: reason?.toString(),
    stack: reason?.stack
  };
  
  // Send to renderer for user notification
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('critical-error', {
      type: 'unhandledRejection',
      message: 'An unexpected error occurred',
      details: reason?.toString()
    });
  }
  
  // Log to file
  try {
    const userDataPath = app.getPath('userData');
    const errorLogPath = path.join(userDataPath, 'error-log.json');
    let errorLogs: any[] = [];
    
    // Read existing logs
    if (fs.existsSync(errorLogPath)) {
      try {
        const existingLogs = fs.readFileSync(errorLogPath, 'utf8');
        errorLogs = JSON.parse(existingLogs);
      } catch (e) {
        Logger.error('MAIN', 'Failed to read error log file', e);
      }
    }
    
    // Add new error and keep last 100 entries
    errorLogs.push(errorLog);
    if (errorLogs.length > 100) {
      errorLogs = errorLogs.slice(-100);
    }
    
    // Write back
    fs.writeFileSync(errorLogPath, JSON.stringify(errorLogs, null, 2));
  } catch (e) {
    Logger.error('MAIN', 'Failed to write error log', e);
  }
});

// Auto-updater configuration
function configureAutoUpdater(): void {
  // Disable auto-download to prevent unexpected updates
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  
  // Configure update feed URL
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'endcycles',  // Your GitHub username
    repo: 'SwarmStation',  // Public distribution repo
    private: false // Set to true if using a private repo
  });
  
  // Wrap check for updates in try-catch
  const checkForUpdates = async () => {
    try {
      await autoUpdater.checkForUpdatesAndNotify();
    } catch (error) {
      Logger.error('AUTO_UPDATER', 'Failed to check for updates', error);
      // Don't crash the app if update check fails
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-error', {
          message: 'Failed to check for updates',
          details: (error as Error).message
        });
      }
    }
  };
  
  // Check for updates on startup (with delay)
  setTimeout(() => {
    checkForUpdates();
  }, 30000); // 30 second delay
  
  // Check periodically (every 4 hours)
  setInterval(() => {
    checkForUpdates();
  }, 4 * 60 * 60 * 1000);

  // Auto-updater events
  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow('Checking for updates...');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    sendStatusToWindow('Update available!');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    sendStatusToWindow('App is up to date.');
  });

  autoUpdater.on('error', (err: Error) => {
    Logger.error('AUTO_UPDATER', 'Error', err);
    sendStatusToWindow('Error in auto-updater: ' + err);
    
    // Send detailed error to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: 'Update error occurred',
        details: err.message,
        stack: err.stack
      });
    }
    
    // Log error for debugging
    try {
      const userDataPath = app.getPath('userData');
      const updateErrorPath = path.join(userDataPath, 'update-errors.json');
      let updateErrors: any[] = [];
      
      if (fs.existsSync(updateErrorPath)) {
        try {
          updateErrors = JSON.parse(fs.readFileSync(updateErrorPath, 'utf8'));
        } catch (e) {
          Logger.error('AUTO_UPDATER', 'Failed to read update error log', e);
        }
      }
      
      updateErrors.push({
        timestamp: new Date().toISOString(),
        error: err.message,
        stack: err.stack
      });
      
      // Keep last 50 update errors
      if (updateErrors.length > 50) {
        updateErrors = updateErrors.slice(-50);
      }
      
      fs.writeFileSync(updateErrorPath, JSON.stringify(updateErrors, null, 2));
    } catch (e) {
      Logger.error('AUTO_UPDATER', 'Failed to log update error', e);
    }
  });

  autoUpdater.on('download-progress', (progressObj: ProgressInfo) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    sendStatusToWindow(log_message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    sendStatusToWindow('Update downloaded');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info);
      
      // Show dialog to user
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: 'A new version has been downloaded. Restart the app to apply the update.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0
      }).then(result => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    }
  });
}

function sendStatusToWindow(text: string): void {
  Logger.info('AUTO_UPDATER', text);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', text);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#0a0a0a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 20 }
  });

  // Pass the window object to services so they can send data back
  if (claudeService && claudeService.setWindow) {
    claudeService.setWindow(mainWindow);
  }
  if (gitService && gitService.setWindow) {
    gitService.setWindow(mainWindow);
  }

  // Load the appropriate URL based on environment
  if (isDev) {
    mainWindow.loadURL('http://localhost:1234').catch((err: Error) => {
      Logger.error('MAIN', 'Failed to load dev server', err);
      if (mainWindow) {
        mainWindow.loadFile('index.html');
      }
    });
  } else {
    // In production, files are in the app.asar
    const indexPath = path.join(__dirname, 'index.html');
    Logger.info('MAIN', `Loading production app from: ${indexPath}`);
    Logger.debug('MAIN', `__dirname is: ${__dirname}`);
    Logger.debug('MAIN', 'Files in directory:', fs.readdirSync(__dirname));
    
    mainWindow.loadFile(indexPath).catch((err: Error) => {
      Logger.error('MAIN', 'Failed to load app', err);
      Logger.error('MAIN', `Error details: ${err.message}`);
      
      // Show error in window
      if (mainWindow) {
        mainWindow.loadURL(`data:text/html,<h1>Error loading app</h1><pre>${err.message}</pre><p>Path: ${indexPath}</p>`);
      }
    });
  }

  // Log when page loads
  mainWindow.webContents.on('did-finish-load', () => {
    Logger.info('MAIN', 'Page loaded successfully');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    Logger.error('MAIN', `Page failed to load: ${errorCode} - ${errorDescription}`);
  });
}

app.whenReady().then(() => {
  createWindow();
  
  // Configure auto-updater with error handling
  try {
    configureAutoUpdater();
  } catch (error) {
    Logger.error('MAIN', 'Failed to configure auto-updater', error);
    // App should still work without auto-updates
  }
  
  // Initialize worktree cleanup service
  if (claudeService && gitService) {
    try {
      const projectPath = process.cwd(); // Or get from config
      cleanupService = new WorktreeCleanupService({
        projectPath,
        staleThresholdDays: 7,
        checkInterval: 60 * 60 * 1000, // 1 hour
        claudeService,
        gitService
      });
      
      cleanupService.start();
      Logger.info('MAIN', 'Worktree cleanup service started');
    } catch (error) {
      Logger.error('MAIN', 'Failed to start cleanup service', error);
    }
  } else {
    Logger.warn('MAIN', 'Cannot start cleanup service - missing required services');
  }
});

app.on('window-all-closed', () => {
  // Stop cleanup service
  if (cleanupService) {
    cleanupService.stop();
  }
  
  // Clean up any running Claude processes before quitting
  if (claudeService) {
    claudeService.cleanupAllAgents();
  }
  
  // Force quit on all platforms to prevent zombie processes
  app.quit();
});

// Also clean up on app quit
app.on('before-quit', () => {
  if (claudeService) {
    claudeService.cleanupAllAgents();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers - Delegate to services

// Auto-updater handlers
ipcMain.handle('updater:check', async (): Promise<any> => {
  return await autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.handle('updater:download', async (): Promise<any> => {
  return await autoUpdater.downloadUpdate();
});

ipcMain.handle('updater:install', async (): Promise<void> => {
  autoUpdater.quitAndInstall();
});

// Claude service handlers
ipcMain.handle('claude:run', async (event: IpcMainInvokeEvent, command: string): Promise<void> => {
  if (!claudeService) throw new Error('Claude service not loaded');
  return claudeService.run(command);
});

ipcMain.handle('claude:deploy-agent', async (event: IpcMainInvokeEvent, issueNumber: number, repo: string): Promise<void> => {
  if (!claudeService) throw new Error('Claude service not loaded');
  return await claudeService.deployAgent(issueNumber, repo);
});

ipcMain.handle('claude:deploy-agent-with-context', async (event: IpcMainInvokeEvent, issueNumber: number, repo: string, context: string): Promise<void> => {
  if (!claudeService) throw new Error('Claude service not loaded');
  return await claudeService.deployAgentWithContext(issueNumber, repo, context);
});

ipcMain.handle('claude:get-agent-status', async (event: IpcMainInvokeEvent, issueNumber: number): Promise<any> => {
  if (!claudeService) throw new Error('Claude service not loaded');
  return claudeService.getAgentStatus(issueNumber);
});

ipcMain.handle('claude:get-all-agents', async (): Promise<any[]> => {
  if (!claudeService) throw new Error('Claude service not loaded');
  return claudeService.getAllAgents();
});

ipcMain.handle('claude:stop-agent', async (event: IpcMainInvokeEvent, issueNumber: number): Promise<void> => {
  if (!claudeService) throw new Error('Claude service not loaded');
  return await claudeService.stopAgent(issueNumber);
});

ipcMain.handle('claude:cleanup-worktree', async (event: IpcMainInvokeEvent, issueNumber: number): Promise<void> => {
  if (!claudeService) throw new Error('Claude service not loaded');
  return await claudeService.cleanupWorktree(issueNumber);
});

ipcMain.handle('claude:read-agent-log-file', async (event: IpcMainInvokeEvent, issueNumber: number): Promise<any> => {
  if (!claudeService) throw new Error('Claude service not loaded');
  return await claudeService.readAgentLogFile(issueNumber);
});

ipcMain.handle('claude:parse-issues-from-text', async (event: IpcMainInvokeEvent, text: string): Promise<any[]> => {
  if (!claudeService) throw new Error('Claude service not loaded');
  return await claudeService.parseIssuesFromText(text);
});

ipcMain.handle('claude:is-available', async (): Promise<boolean> => {
  if (!claudeService || !claudeService.checkClaudeAvailable) {
    return false;
  }
  return await claudeService.checkClaudeAvailable();
});

// Git service handlers
ipcMain.handle('git:status', async (): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.getStatus();
});

ipcMain.handle('git:list-repos', async (): Promise<any[]> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.listRepositories();
});

ipcMain.handle('git:list-issues', async (event: IpcMainInvokeEvent, repo: string): Promise<any[]> => {
  if (!gitService) throw new Error('Git service not loaded');
  Logger.debug('IPC', `Listing issues for repo: ${repo}`);
  return await gitService.listIssues(repo);
});

ipcMain.handle('git:list-prs', async (event: IpcMainInvokeEvent, repo: string): Promise<any[]> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.listPullRequests(repo);
});

ipcMain.handle('git:create-issue', async (event: IpcMainInvokeEvent, repo: string, title: string, body: string): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.createIssue(repo, title, body);
});

ipcMain.handle('git:update-issue', async (event: IpcMainInvokeEvent, repo: string, issueNumber: number, title: string, body: string): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.updateIssue(repo, issueNumber, title, body);
});

ipcMain.handle('git:close-issue', async (event: IpcMainInvokeEvent, repo: string, issueNumber: number): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.closeIssue(repo, issueNumber);
});

ipcMain.handle('git:add-labels', async (event: IpcMainInvokeEvent, repo: string, issueNumber: number, labels: string[]): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.addLabels(repo, issueNumber, labels);
});

ipcMain.handle('git:remove-labels', async (event: IpcMainInvokeEvent, repo: string, issueNumber: number, labels: string[]): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.removeLabels(repo, issueNumber, labels);
});

ipcMain.handle('git:create-branch', async (event: IpcMainInvokeEvent, branchName: string): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.createBranch(branchName);
});

ipcMain.handle('git:create-pr', async (event: IpcMainInvokeEvent, title: string, body: string): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.createPullRequest(title, body);
});

ipcMain.handle('git:merge-pr', async (event: IpcMainInvokeEvent, prNumber: number): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.mergePullRequest(prNumber);
});

ipcMain.handle('git:close-pr', async (event: IpcMainInvokeEvent, prNumber: number): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.closePullRequest(prNumber);
});

ipcMain.handle('git:get-pr', async (event: IpcMainInvokeEvent, prNumber: number): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  return await gitService.getPullRequest(prNumber);
});

// System utilities
ipcMain.handle('system:check-dependencies', async (): Promise<any> => {
  if (!gitService) throw new Error('Git service not loaded');
  // gitService.checkCLI() already checks both git and gh
  return await gitService.checkCLI();
});

ipcMain.handle('system:open-workspace', async (): Promise<string> => {
  const workspacePath = path.join(os.homedir(), 'SwarmStation', 'agents');
  await shell.openPath(workspacePath);
  return workspacePath;
});

// Shell handlers
ipcMain.handle('shell:openExternal', async (event: IpcMainInvokeEvent, url: string): Promise<void> => {
  await shell.openExternal(url);
});