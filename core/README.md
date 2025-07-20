# Core Services

This directory contains the Electron main process services written in TypeScript.

## Why a Separate tsconfig.json?

This directory has its own `tsconfig.json` because:
- Main process code needs **CommonJS modules** (not ES modules like the frontend)
- Needs different compiler settings than the React frontend
- Compiles to `../core-dist/` to keep source directory clean

## Build Process

Run `npm run build:core` to compile TypeScript files.

The build script:
1. Compiles `.ts` files to `../core-dist/`
2. Copies the compiled `claude-service.js` back to this directory for Electron to use

## TypeScript Status

- ✅ `claude-service.ts` - Fully typed with interfaces
- ❌ `git-service.js` - Still JavaScript, needs TypeScript conversion

## Services

### claude-service.js

Handles Claude CLI agent spawning and management.

**Functions:**
- `setWindow(mainWindow)` - Set the main window for IPC communication
- `checkCLI()` - Check if Claude CLI is installed
- `deployAgent(issueNumber, repo)` - Deploy an agent to work on an issue
- `getAgentStatus(issueNumber)` - Get status of a specific agent
- `getAllAgents()` - Get status of all agents
- `getAgentLogs(issueNumber)` - Get logs for a specific agent

**Events emitted:**
- `claude-cli-status` - Claude CLI installation status
- `agent-status-update` - Agent status changes
- `agent-output` - Agent stdout output
- `agent-error` - Agent errors

### git-service.js

Handles GitHub CLI operations for repository and issue management.

**Functions:**
- `setWindow(mainWindow)` - Set the main window for IPC communication
- `checkCLI()` - Check GitHub CLI installation and authentication
- `listRepositories()` - List user's GitHub repositories
- `listIssues(repo)` - List issues for a repository
- `createIssue(repo, title, body)` - Create a new issue

**Events emitted:**
- `github-cli-status` - GitHub CLI status
- `repositories-loaded` - Repository list loaded
- `issues-loaded` - Issues list loaded
- `issue-created` - New issue created
- `github-error` - GitHub operation errors

## Usage Example

```javascript
// In main.js
const claudeService = require('./core/claude-service');
const gitService = require('./core/git-service');

// Set up services when window is ready
mainWindow.webContents.once('did-finish-load', () => {
  claudeService.setWindow(mainWindow);
  gitService.setWindow(mainWindow);
});

// Deploy an agent
const result = await claudeService.deployAgent(123, 'owner/repo');

// List repositories
const repos = await gitService.listRepositories();
```

## Frontend Access

Services are exposed through the preload script:

```javascript
// Check Claude CLI
const isInstalled = await window.api.services.claude.checkCLI();

// Deploy agent
const result = await window.api.services.claude.deployAgent(123, 'owner/repo');

// Listen for agent output
const cleanup = window.api.services.claude.onOutput((data) => {
  console.log('Agent output:', data);
});
// Later: cleanup() to remove listener

// List repositories
const repos = await window.api.services.git.listRepositories();
```