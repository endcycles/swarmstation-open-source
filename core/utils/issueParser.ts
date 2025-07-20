/**
 * Intelligent Issue Parser
 * Detects issue type, priority, and labels from natural language
 */

export type IssueType = 'bug' | 'feature' | 'documentation' | 'performance' | 'security' | 'refactor' | 'other';
export type Priority = 'critical' | 'high' | 'medium' | 'low';

export interface ParsedIssue {
  title: string;
  body: string;
  labels: string[];
  type: IssueType;
  priority: Priority;
}

// Pattern matching for issue types
const ISSUE_TYPE_PATTERNS: Record<IssueType, RegExp> = {
  bug: /\b(fix|bug|broken|error|crash|issue|fail|wrong|incorrect|problem)\b/i,
  feature: /\b(add|create|implement|feature|new|enhance|improvement|want|need)\b/i,
  documentation: /\b(document|docs|readme|guide|tutorial|explain|clarify)\b/i,
  performance: /\b(slow|performance|optimize|speed|fast|latency|lag|memory|cpu)\b/i,
  security: /\b(security|vulnerability|exploit|auth|permission|access|token|password)\b/i,
  refactor: /\b(refactor|cleanup|reorganize|restructure|simplify|improve code)\b/i,
  other: /.*/ // Catch-all
};

// Priority detection patterns
const PRIORITY_PATTERNS: Record<Priority, RegExp> = {
  critical: /\b(urgent|critical|asap|blocker|emergency|immediately|breaking)\b/i,
  high: /\b(important|high priority|soon|quickly|major)\b/i,
  medium: /\b(medium|normal|standard|moderate)\b/i,
  low: /\b(low|minor|eventually|nice to have|when possible|someday)\b/i
};

// Common label mappings
const LABEL_MAPPINGS: Record<string, string[]> = {
  frontend: ['ui', 'interface', 'button', 'form', 'page', 'component', 'react', 'view'],
  backend: ['api', 'server', 'database', 'endpoint', 'service', 'node'],
  testing: ['test', 'spec', 'unit test', 'integration', 'e2e'],
  deployment: ['deploy', 'ci/cd', 'pipeline', 'build', 'release'],
  ux: ['user experience', 'usability', 'design', 'workflow'],
  infrastructure: ['docker', 'kubernetes', 'aws', 'cloud', 'server'],
};

/**
 * Detect issue type from content
 */
export function detectIssueType(content: string): IssueType {
  const lowerContent = content.toLowerCase();
  
  // Check patterns in order of specificity
  for (const [type, pattern] of Object.entries(ISSUE_TYPE_PATTERNS)) {
    if (type === 'other') continue; // Skip catch-all
    if (pattern.test(lowerContent)) {
      return type as IssueType;
    }
  }
  
  return 'other';
}

/**
 * Detect priority from content
 */
export function detectPriority(content: string): Priority {
  const lowerContent = content.toLowerCase();
  
  // Check for explicit priority mentions first
  if (/priority:\s*(critical|high|medium|low)/i.test(content)) {
    const match = content.match(/priority:\s*(critical|high|medium|low)/i);
    return (match?.[1].toLowerCase() as Priority) || 'medium';
  }
  
  // Check patterns
  for (const [priority, pattern] of Object.entries(PRIORITY_PATTERNS)) {
    if (pattern.test(lowerContent)) {
      return priority as Priority;
    }
  }
  
  return 'medium'; // Default priority
}

/**
 * Suggest labels based on content
 */
export function suggestLabels(content: string, issueType: IssueType): string[] {
  const labels = new Set<string>();
  const lowerContent = content.toLowerCase();
  
  // Add issue type as label
  if (issueType !== 'other') {
    labels.add(issueType);
  }
  
  // Check for technology/area mentions
  for (const [label, keywords] of Object.entries(LABEL_MAPPINGS)) {
    if (keywords.some(keyword => lowerContent.includes(keyword))) {
      labels.add(label);
    }
  }
  
  // Add specific labels based on patterns
  if (/\b(ui|ux|interface|design)\b/i.test(content)) {
    labels.add('ui/ux');
  }
  if (/\b(api|endpoint|rest|graphql)\b/i.test(content)) {
    labels.add('api');
  }
  if (/\b(test|testing|spec)\b/i.test(content)) {
    labels.add('testing');
  }
  if (/\b(doc|documentation|readme)\b/i.test(content)) {
    labels.add('documentation');
  }
  
  return Array.from(labels);
}

/**
 * Generate a concise title from content
 */
export function generateTitle(content: string, issueType: IssueType): string {
  // Remove extra whitespace
  const cleaned = content.trim().replace(/\s+/g, ' ');
  
  // Extract first sentence or line
  const firstLine = cleaned.split(/[.\n]/)[0].trim();
  
  // If first line is too long, extract key parts
  if (firstLine.length > 80) {
    // Try to find the main action/object
    const actionMatch = firstLine.match(/\b(fix|add|create|update|remove|implement)\s+(.{10,50})/i);
    if (actionMatch) {
      return capitalizeFirst(actionMatch[0]);
    }
    
    // Fallback: take first 60 chars and add ellipsis
    return firstLine.substring(0, 60).trim() + '...';
  }
  
  // Add prefix based on type if not already present
  const typePrefix = {
    bug: 'Fix',
    feature: 'Add',
    documentation: 'Document',
    performance: 'Optimize',
    security: 'Secure',
    refactor: 'Refactor'
  };
  
  const prefix = (typePrefix as any)[issueType] || '';
  if (prefix && !new RegExp(`^${prefix}\\b`, 'i').test(firstLine)) {
    return `${prefix} ${firstLine.toLowerCase()}`;
  }
  
  return capitalizeFirst(firstLine);
}

/**
 * Parse a single issue from text
 */
export function parseIssue(text: string): ParsedIssue {
  const issueType = detectIssueType(text);
  const priority = detectPriority(text);
  const labels = suggestLabels(text, issueType);
  const title = generateTitle(text, issueType);
  
  // Generate body with structure
  const body = generateBody(text, issueType);
  
  return {
    title,
    body,
    labels,
    type: issueType,
    priority
  };
}

/**
 * Generate structured body based on issue type
 */
function generateBody(content: string, issueType: IssueType): string {
  switch (issueType) {
    case 'bug':
      return `## Description
${content}

## Steps to Reproduce
1. [Add steps if known]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]`;

    case 'feature':
      return `## Description
${content}

## Acceptance Criteria
- [ ] [Add specific requirements]

## Additional Context
[Any additional information]`;

    case 'documentation':
      return `## Description
${content}

## Sections to Cover
- [ ] [List key topics]

## Target Audience
[Who will read this documentation]`;

    case 'performance':
      return `## Description
${content}

## Current Performance
[Current metrics if known]

## Target Performance
[Desired metrics]

## Affected Areas
[What parts of the system are impacted]`;

    default:
      return content;
  }
}

/**
 * Parse multiple issues from text
 * Handles various formats: bullet points, numbered lists, paragraphs
 */
export function parseMultipleIssues(text: string): ParsedIssue[] {
  const issues: ParsedIssue[] = [];
  
  // Split by common separators
  const lines = text.split(/\n/);
  let currentIssue = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) {
      if (currentIssue) {
        issues.push(parseIssue(currentIssue));
        currentIssue = '';
      }
      continue;
    }
    
    // Check if this starts a new issue (bullet, number, or keyword)
    const isNewIssue = /^[-*•]\s|^\d+\.\s|^(BUG|FEATURE|TASK|TODO):/i.test(trimmed);
    
    if (isNewIssue && currentIssue) {
      // Save previous issue
      issues.push(parseIssue(currentIssue));
      currentIssue = trimmed.replace(/^[-*•]\s|^\d+\.\s/, '');
    } else if (isNewIssue) {
      currentIssue = trimmed.replace(/^[-*•]\s|^\d+\.\s/, '');
    } else {
      // Continue current issue
      currentIssue += ' ' + trimmed;
    }
  }
  
  // Don't forget the last issue
  if (currentIssue) {
    issues.push(parseIssue(currentIssue));
  }
  
  // If no issues found, treat entire text as one issue
  if (issues.length === 0 && text.trim()) {
    issues.push(parseIssue(text));
  }
  
  return issues;
}

// Helper functions
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}