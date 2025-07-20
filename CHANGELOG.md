# Changelog

All notable changes to SwarmStation will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2025-01-17

### Fixed
- 🛡️ **Critical**: Added global unhandled promise rejection handler to prevent app crashes
- 🔄 **Auto-updater**: Fixed crashes when checking for updates with network issues
  - Wrapped all auto-updater operations in try-catch blocks
  - Disabled auto-download to prevent unexpected updates
  - Added 30-second delay before first update check
  - Changed update check interval from 1 hour to 4 hours
- 🧹 **Worktree cleanup**: Implemented comprehensive cleanup strategy
  - Automatic cleanup 30 seconds after PR merge
  - New periodic cleanup service removes stale worktrees (7+ days old)
  - Prevents duplicate cleanup attempts with tracking
- 📊 **Error logging**: Added persistent error logging
  - Unhandled rejections logged to `error-log.json`
  - Auto-updater errors logged to `update-errors.json`
  - Last 100 errors kept for debugging

### Added
- Renderer-side error notifications for critical errors
- WorktreeCleanupService for automatic maintenance
- Error event handlers in preload script

### Changed
- Auto-updater now fails gracefully instead of crashing
- Improved error messages and user notifications

## [0.1.1] - Previous Release

### Added
- Initial release of SwarmStation
- Multi-agent deployment for GitHub issues
- Real-time log streaming
- PR creation and management
- Bulk issue creation