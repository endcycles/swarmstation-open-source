# SwarmStation Direct Testing

This directory contains scripts to test the Claude agent workflow directly,
bypassing the Electron UI. Use these to debug core functionality.

## Setup
1. Ensure `claude` CLI is installed and authenticated
2. Ensure `gh` CLI is installed and authenticated
3. Run tests from the project root: `node test/test-claude-spawn.js`

## Tests
- `test-claude-spawn.js` - Basic Claude process spawning
- `test-worktree.js` - Git worktree management
- `test-full-workflow.js` - Complete agent workflow
- `test-output-capture.js` - Output streaming and capture
- `test-concurrent.js` - Multiple concurrent agents

## Quick Start
```bash
# Test basic Claude functionality
node test/test-claude-spawn.js

# Test output capture mechanisms
node test/test-output-capture.js

# Test full workflow without creating PR
node test/test-full-workflow.js --no-pr
```