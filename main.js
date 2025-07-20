"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const isDev = process.env.NODE_ENV === 'development';
const worktree_cleanup_service_1 = require("./core/worktree-cleanup-service");
const { Logger } = require('./core/utils/logger');
// Service instances
let claudeService = null;
let gitService = null;
let cleanupService = null;
// Load services with error handling
try {
    // Using require for CommonJS compatibility in Electron main process
    claudeService = require('./core-dist/claude-service');
    Logger.info('MAIN', 'Claude service loaded successfully');
}
catch (error) {
    Logger.error('MAIN', 'Failed to load claude-service', error);
}
try {
    // Using require for CommonJS compatibility in Electron main process
    gitService = require('./core-dist/git-service');
    Logger.info('MAIN', 'Git service loaded successfully');
}
catch (error) {
    Logger.error('MAIN', 'Failed to load git-service', error);
}
let mainWindow = null;
// Global unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
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
        const userDataPath = electron_1.app.getPath('userData');
        const errorLogPath = path.join(userDataPath, 'error-log.json');
        let errorLogs = [];
        // Read existing logs
        if (fs.existsSync(errorLogPath)) {
            try {
                const existingLogs = fs.readFileSync(errorLogPath, 'utf8');
                errorLogs = JSON.parse(existingLogs);
            }
            catch (e) {
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
    }
    catch (e) {
        Logger.error('MAIN', 'Failed to write error log', e);
    }
});
// Auto-updater configuration
function configureAutoUpdater() {
    // Disable auto-download to prevent unexpected updates
    electron_updater_1.autoUpdater.autoDownload = false;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    // Configure update feed URL
    electron_updater_1.autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'endcycles', // Your GitHub username
        repo: 'SwarmStation', // Public distribution repo
        private: false // Set to true if using a private repo
    });
    // Wrap check for updates in try-catch
    const checkForUpdates = async () => {
        try {
            await electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
        }
        catch (error) {
            Logger.error('AUTO_UPDATER', 'Failed to check for updates', error);
            // Don't crash the app if update check fails
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-error', {
                    message: 'Failed to check for updates',
                    details: error.message
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
    electron_updater_1.autoUpdater.on('checking-for-update', () => {
        sendStatusToWindow('Checking for updates...');
    });
    electron_updater_1.autoUpdater.on('update-available', (info) => {
        sendStatusToWindow('Update available!');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-available', info);
        }
    });
    electron_updater_1.autoUpdater.on('update-not-available', (info) => {
        sendStatusToWindow('App is up to date.');
    });
    electron_updater_1.autoUpdater.on('error', (err) => {
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
            const userDataPath = electron_1.app.getPath('userData');
            const updateErrorPath = path.join(userDataPath, 'update-errors.json');
            let updateErrors = [];
            if (fs.existsSync(updateErrorPath)) {
                try {
                    updateErrors = JSON.parse(fs.readFileSync(updateErrorPath, 'utf8'));
                }
                catch (e) {
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
        }
        catch (e) {
            Logger.error('AUTO_UPDATER', 'Failed to log update error', e);
        }
    });
    electron_updater_1.autoUpdater.on('download-progress', (progressObj) => {
        let log_message = "Download speed: " + progressObj.bytesPerSecond;
        log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
        log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
        sendStatusToWindow(log_message);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-progress', progressObj);
        }
    });
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
        sendStatusToWindow('Update downloaded');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-downloaded', info);
            // Show dialog to user
            electron_1.dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Update Ready',
                message: 'A new version has been downloaded. Restart the app to apply the update.',
                buttons: ['Restart Now', 'Later'],
                defaultId: 0
            }).then(result => {
                if (result.response === 0) {
                    electron_updater_1.autoUpdater.quitAndInstall();
                }
            });
        }
    });
}
function sendStatusToWindow(text) {
    Logger.info('AUTO_UPDATER', text);
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', text);
    }
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
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
        mainWindow.loadURL('http://localhost:1234').catch((err) => {
            Logger.error('MAIN', 'Failed to load dev server', err);
            if (mainWindow) {
                mainWindow.loadFile('index.html');
            }
        });
    }
    else {
        // In production, files are in the app.asar
        const indexPath = path.join(__dirname, 'index.html');
        Logger.info('MAIN', `Loading production app from: ${indexPath}`);
        Logger.debug('MAIN', `__dirname is: ${__dirname}`);
        Logger.debug('MAIN', 'Files in directory:', fs.readdirSync(__dirname));
        mainWindow.loadFile(indexPath).catch((err) => {
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
electron_1.app.whenReady().then(() => {
    createWindow();
    // Configure auto-updater with error handling
    try {
        configureAutoUpdater();
    }
    catch (error) {
        Logger.error('MAIN', 'Failed to configure auto-updater', error);
        // App should still work without auto-updates
    }
    // Initialize worktree cleanup service
    if (claudeService && gitService) {
        try {
            const projectPath = process.cwd(); // Or get from config
            cleanupService = new worktree_cleanup_service_1.WorktreeCleanupService({
                projectPath,
                staleThresholdDays: 7,
                checkInterval: 60 * 60 * 1000, // 1 hour
                claudeService,
                gitService
            });
            cleanupService.start();
            Logger.info('MAIN', 'Worktree cleanup service started');
        }
        catch (error) {
            Logger.error('MAIN', 'Failed to start cleanup service', error);
        }
    }
    else {
        Logger.warn('MAIN', 'Cannot start cleanup service - missing required services');
    }
});
electron_1.app.on('window-all-closed', () => {
    // Stop cleanup service
    if (cleanupService) {
        cleanupService.stop();
    }
    // Clean up any running Claude processes before quitting
    if (claudeService) {
        claudeService.cleanupAllAgents();
    }
    // Force quit on all platforms to prevent zombie processes
    electron_1.app.quit();
});
// Also clean up on app quit
electron_1.app.on('before-quit', () => {
    if (claudeService) {
        claudeService.cleanupAllAgents();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
// IPC Handlers - Delegate to services
// Auto-updater handlers
electron_1.ipcMain.handle('updater:check', async () => {
    return await electron_updater_1.autoUpdater.checkForUpdatesAndNotify();
});
electron_1.ipcMain.handle('updater:download', async () => {
    return await electron_updater_1.autoUpdater.downloadUpdate();
});
electron_1.ipcMain.handle('updater:install', async () => {
    electron_updater_1.autoUpdater.quitAndInstall();
});
// Claude service handlers
electron_1.ipcMain.handle('claude:run', async (event, command) => {
    if (!claudeService)
        throw new Error('Claude service not loaded');
    return claudeService.run(command);
});
electron_1.ipcMain.handle('claude:deploy-agent', async (event, issueNumber, repo) => {
    if (!claudeService)
        throw new Error('Claude service not loaded');
    return await claudeService.deployAgent(issueNumber, repo);
});
electron_1.ipcMain.handle('claude:deploy-agent-with-context', async (event, issueNumber, repo, context) => {
    if (!claudeService)
        throw new Error('Claude service not loaded');
    return await claudeService.deployAgentWithContext(issueNumber, repo, context);
});
electron_1.ipcMain.handle('claude:get-agent-status', async (event, issueNumber) => {
    if (!claudeService)
        throw new Error('Claude service not loaded');
    return claudeService.getAgentStatus(issueNumber);
});
electron_1.ipcMain.handle('claude:get-all-agents', async () => {
    if (!claudeService)
        throw new Error('Claude service not loaded');
    return claudeService.getAllAgents();
});
electron_1.ipcMain.handle('claude:stop-agent', async (event, issueNumber) => {
    if (!claudeService)
        throw new Error('Claude service not loaded');
    return await claudeService.stopAgent(issueNumber);
});
electron_1.ipcMain.handle('claude:cleanup-worktree', async (event, issueNumber) => {
    if (!claudeService)
        throw new Error('Claude service not loaded');
    return await claudeService.cleanupWorktree(issueNumber);
});
electron_1.ipcMain.handle('claude:read-agent-log-file', async (event, issueNumber) => {
    if (!claudeService)
        throw new Error('Claude service not loaded');
    return await claudeService.readAgentLogFile(issueNumber);
});
electron_1.ipcMain.handle('claude:parse-issues-from-text', async (event, text) => {
    if (!claudeService)
        throw new Error('Claude service not loaded');
    return await claudeService.parseIssuesFromText(text);
});
electron_1.ipcMain.handle('claude:is-available', async () => {
    if (!claudeService || !claudeService.checkClaudeAvailable) {
        return false;
    }
    return await claudeService.checkClaudeAvailable();
});
// Git service handlers
electron_1.ipcMain.handle('git:status', async () => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.getStatus();
});
electron_1.ipcMain.handle('git:list-repos', async () => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.listRepositories();
});
electron_1.ipcMain.handle('git:list-issues', async (event, repo) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    Logger.debug('IPC', `Listing issues for repo: ${repo}`);
    return await gitService.listIssues(repo);
});
electron_1.ipcMain.handle('git:list-prs', async (event, repo) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.listPullRequests(repo);
});
electron_1.ipcMain.handle('git:create-issue', async (event, repo, title, body) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.createIssue(repo, title, body);
});
electron_1.ipcMain.handle('git:update-issue', async (event, repo, issueNumber, title, body) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.updateIssue(repo, issueNumber, title, body);
});
electron_1.ipcMain.handle('git:close-issue', async (event, repo, issueNumber) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.closeIssue(repo, issueNumber);
});
electron_1.ipcMain.handle('git:add-labels', async (event, repo, issueNumber, labels) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.addLabels(repo, issueNumber, labels);
});
electron_1.ipcMain.handle('git:remove-labels', async (event, repo, issueNumber, labels) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.removeLabels(repo, issueNumber, labels);
});
electron_1.ipcMain.handle('git:create-branch', async (event, branchName) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.createBranch(branchName);
});
electron_1.ipcMain.handle('git:create-pr', async (event, title, body) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.createPullRequest(title, body);
});
electron_1.ipcMain.handle('git:merge-pr', async (event, prNumber) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.mergePullRequest(prNumber);
});
electron_1.ipcMain.handle('git:close-pr', async (event, prNumber) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.closePullRequest(prNumber);
});
electron_1.ipcMain.handle('git:get-pr', async (event, prNumber) => {
    if (!gitService)
        throw new Error('Git service not loaded');
    return await gitService.getPullRequest(prNumber);
});
// System utilities
electron_1.ipcMain.handle('system:check-dependencies', async () => {
    if (!gitService)
        throw new Error('Git service not loaded');
    // gitService.checkCLI() already checks both git and gh
    return await gitService.checkCLI();
});
electron_1.ipcMain.handle('system:open-workspace', async () => {
    const workspacePath = path.join(os.homedir(), 'SwarmStation', 'agents');
    await electron_1.shell.openPath(workspacePath);
    return workspacePath;
});
// Shell handlers
electron_1.ipcMain.handle('shell:openExternal', async (event, url) => {
    await electron_1.shell.openExternal(url);
});
//# sourceMappingURL=main.js.map