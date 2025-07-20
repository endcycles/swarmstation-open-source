/**
 * Sanitizer utility for log entries and activity messages
 */

export function sanitizeLogEntry(entry: any): any {
  if (!entry) return entry;
  
  // If it's a string, just return it
  if (typeof entry === 'string') {
    return entry;
  }
  
  // If it's an object, sanitize recursively
  if (typeof entry === 'object') {
    const sanitized: any = Array.isArray(entry) ? [] : {};
    
    for (const key in entry) {
      if (entry.hasOwnProperty(key)) {
        // Skip sensitive keys
        if (key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('password') ||
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('key')) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = sanitizeLogEntry(entry[key]);
        }
      }
    }
    
    return sanitized;
  }
  
  // For other types, return as-is
  return entry;
}

export function sanitizeActivityMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return message || '';
  }
  
  // Redact sensitive patterns in activity messages
  let sanitized = message;
  
  // Redact tokens (various formats)
  sanitized = sanitized.replace(/\b(token|api_key|apikey|auth|bearer)\s*[:=]\s*[^\s]+/gi, '$1: [REDACTED]');
  sanitized = sanitized.replace(/\b[a-f0-9]{40}\b/g, '[REDACTED_HASH]'); // Git SHA or tokens
  sanitized = sanitized.replace(/\bgithub_pat_[a-zA-Z0-9_]+/g, '[REDACTED_TOKEN]'); // GitHub PAT
  sanitized = sanitized.replace(/\bghp_[a-zA-Z0-9]+/g, '[REDACTED_TOKEN]'); // GitHub token
  
  return sanitized;
}

export function sanitizeRepoName(repo: string): string {
  if (!repo || typeof repo !== 'string') {
    throw new Error('Invalid repository name');
  }
  
  // Basic validation for owner/repo format
  if (!repo.match(/^[a-zA-Z0-9-_.]+\/[a-zA-Z0-9-_.]+$/)) {
    throw new Error('Invalid repository format. Expected: owner/repo');
  }
  
  return repo;
}

export function sanitizeIssueTitle(title: string): string {
  if (!title || typeof title !== 'string') {
    throw new Error('Issue title is required');
  }
  
  // Remove any control characters and limit length
  return title.replace(/[\x00-\x1F\x7F]/g, '').substring(0, 256);
}

export function sanitizeIssueBody(body: string): string {
  if (typeof body !== 'string') {
    return '';
  }
  
  // Remove any control characters except newlines and tabs
  return body.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function createSafeWorktreePath(projectPath: string, issueNumber: number): string {
  const path = require('path');
  
  // Validate inputs
  if (!projectPath || typeof projectPath !== 'string') {
    throw new Error('Invalid project path');
  }
  
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('Invalid issue number');
  }
  
  // Create safe worktree name
  const worktreeName = `issue-${issueNumber}`;
  
  // Construct path safely
  return path.join(projectPath, 'worktrees', worktreeName);
}

export function sanitizePath(targetPath: string, basePath: string): void {
  const path = require('path');
  
  // Resolve both paths to absolute
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBase = path.resolve(basePath);
  
  // Ensure target is within base directory
  if (!resolvedTarget.startsWith(resolvedBase)) {
    throw new Error('Path traversal attempt detected');
  }
}

export function sanitizeBranchName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Invalid branch name');
  }
  
  // Remove special characters, replace spaces with hyphens
  // Git branch names can't contain spaces, colons, question marks, asterisks, etc.
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')           // Replace multiple hyphens with single
    .replace(/^-|-$/g, '')         // Remove leading/trailing hyphens
    .substring(0, 63);             // Git branch name limit
}

export function sanitizeIssueNumber(issueNumber: number): number {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('Invalid issue number');
  }
  return issueNumber;
}