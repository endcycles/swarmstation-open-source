import { ClaudeSDK, ParsedIssue } from './claude-service-types';
import { parseMultipleIssues, detectIssueType, detectPriority, suggestLabels } from './utils/issueParser';
import { Logger } from './utils/logger';

// Load SDK dynamically
let claudeSDK: ClaudeSDK | null = null;

async function loadClaudeSDK(): Promise<ClaudeSDK> {
  if (!claudeSDK) {
    const module = await import('@anthropic-ai/claude-code');
    claudeSDK = module as ClaudeSDK;
  }
  return claudeSDK;
}

/**
 * Enhanced issue parsing with intelligent middleware
 */
export async function parseIssuesFromText(text: string): Promise<ParsedIssue[]> {
  // First, try local parsing for common patterns
  const localParsed = parseMultipleIssues(text);
  
  // If we got reasonable results, return them quickly
  if (localParsed.length > 0 && localParsed.every(issue => issue.title && issue.body)) {
    Logger.debug('PARSER', 'Used local parser for faster results');
    return localParsed;
  }
  
  // For complex text, use Claude for better understanding
  Logger.debug('PARSER', 'Using Claude SDK for complex parsing');
  const { query } = await loadClaudeSDK();
  
  const ENHANCED_PARSING_PROMPT = `You are an expert at parsing user requests into GitHub issues.

Parse the following text and extract ALL distinct issues/tasks mentioned.
For each issue, intelligently determine:

1. Title: Clear, actionable, specific (50-80 chars ideal)
   - Start with action verb (Fix, Add, Update, Implement, etc.)
   - Be specific about what needs to be done
   
2. Body: Detailed description with:
   - Problem statement or feature description
   - Acceptance criteria (if applicable) 
   - Technical details (if mentioned)
   - Use markdown formatting
   
3. Type: Detect from content
   - bug: fixing errors, crashes, incorrect behavior
   - feature: new functionality, enhancements
   - documentation: docs, guides, readme updates
   - performance: speed, optimization, resource usage
   - security: auth, permissions, vulnerabilities
   - refactor: code cleanup, reorganization
   
4. Labels: Choose relevant labels based on content
   - Include the type as a label
   - Add technology labels (frontend, backend, api, etc.)
   - Add area labels (ui/ux, database, testing, etc.)
   
5. Priority: Detect urgency
   - critical: urgent, blocker, asap, breaking
   - high: important, major, soon
   - medium: normal, standard (default)
   - low: minor, nice-to-have, eventually

Common patterns to recognize:
- "Fix [problem]" → bug
- "Add/Create/Implement [feature]" → feature  
- "Document/Update docs" → documentation
- "[Thing] is slow" → performance
- Multiple issues in one sentence → split them
- Numbered/bulleted lists → separate issues

Input text:
${text}

Return ONLY a valid JSON array. Each object must have ALL fields:
{
  "title": "Clear action title",
  "body": "Detailed description with markdown...",
  "labels": ["bug", "frontend"],
  "type": "bug",
  "priority": "high"
}

Make sure to:
- Extract ALL distinct issues (don't combine unrelated tasks)
- Generate professional, detailed descriptions
- Use appropriate markdown in body (headers, lists, code blocks)
- Choose accurate types and priorities`;

  try {
    const abortController = new AbortController();
    const queryIterator = query({
      prompt: ENHANCED_PARSING_PROMPT,
      abortController,
      options: {
        maxTurns: 1,
        permissionMode: 'bypassPermissions',
        outputFormat: 'json',
        cwd: process.cwd()
      }
    });

    let result = '';
    for await (const message of queryIterator) {
      if (message.type === 'assistant' && message.message?.content) {
        result += message.message.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('');
      }
    }

    // Clean up the result (remove markdown code blocks if present)
    result = result.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    
    const parsed = JSON.parse(result);
    
    // Validate and enhance parsed issues
    if (Array.isArray(parsed)) {
      return parsed.map(issue => ({
        title: issue.title || 'Untitled Issue',
        body: issue.body || 'No description provided.',
        labels: Array.isArray(issue.labels) ? issue.labels : [],
        type: issue.type || 'other',
        priority: issue.priority || 'medium'
      }));
    }
    
    throw new Error('Invalid response format from Claude');
  } catch (error) {
    Logger.error('PARSER', 'Claude parsing failed, falling back to local parser', error);
    // Fallback to local parser
    return localParsed;
  }
}

/**
 * Quick parse for simple formats
 */
export function quickParseIssues(text: string): ParsedIssue[] {
  return parseMultipleIssues(text);
}

/**
 * Get suggested templates based on keywords
 */
export function getSuggestedTemplates(text: string): string[] {
  const templates = [];
  const lower = text.toLowerCase();
  
  if (/\b(bug|fix|error|broken)\b/.test(lower)) {
    templates.push(`BUG: [Component] - [What's broken]
Steps to reproduce:
1. 
2. 
Expected: 
Actual: `);
  }
  
  if (/\b(feature|add|new|want)\b/.test(lower)) {
    templates.push(`FEATURE: [What you want]
Why: 
Acceptance criteria:
- [ ] `);
  }
  
  if (/\b(slow|performance|optimize)\b/.test(lower)) {
    templates.push(`PERF: [What's slow] takes [X seconds]
Context: 
Expected: < [Y seconds]`);
  }
  
  return templates;
}

export default {
  parseIssuesFromText,
  quickParseIssues,
  getSuggestedTemplates
};