import { Issue } from './types';
import { detectIssueType, detectPriority } from './utils/issueParser';

export interface TaskClassification {
  taskType: 'bug' | 'feature' | 'documentation' | 'performance' | 'security' | 'refactor' | 'other';
  priority: 'critical' | 'high' | 'medium' | 'low';
  protectedFiles: string[];
  expectedDeliverables: string[];
  successCriteria: string[];
  estimatedComplexity: 'simple' | 'medium' | 'complex';
}

/**
 * Classify task based on issue content
 */
export function classifyTask(issue: Issue): TaskClassification {
  const content = `${issue.title} ${issue.body || ''}`;
  const taskType = detectIssueType(content);
  const priority = detectPriority(content);
  
  // Default protected files - never modify these
  const protectedFiles = [
    'CLAUDE.md',           // Project instructions
    'package-lock.json',   // Dependency lock
    '.github/workflows/*', // CI/CD workflows
    '*.env',              // Environment files
    '*.key',              // Security files
    '*.pem'               // Certificates
  ];
  
  // Add type-specific protections
  switch (taskType) {
    case 'documentation':
      // Don't protect README for docs tasks
      protectedFiles.push('package.json', 'tsconfig.json', 'src/**/*.ts', 'src/**/*.tsx');
      break;
    case 'bug':
      // Protect docs when fixing bugs
      protectedFiles.push('README.md', 'DOCS/**/*');
      break;
    case 'feature':
      // Be more permissive for features
      protectedFiles.push('.gitignore');
      break;
  }
  
  // Extract expected deliverables from issue
  const expectedDeliverables = extractDeliverables(issue, taskType);
  
  // Generate success criteria
  const successCriteria = generateSuccessCriteria(issue, taskType);
  
  // Estimate complexity
  const estimatedComplexity = estimateComplexity(content, taskType);
  
  return {
    taskType,
    priority,
    protectedFiles,
    expectedDeliverables,
    successCriteria,
    estimatedComplexity
  };
}

/**
 * Extract expected deliverables from issue
 */
function extractDeliverables(issue: Issue, taskType: string): string[] {
  const deliverables: string[] = [];
  const body = issue.body || '';
  const title = issue.title;
  
  // Look for explicit file mentions
  const fileMatches = body.match(/`([^`]+\.(md|ts|tsx|js|jsx|json|yml|yaml))`/g);
  if (fileMatches) {
    deliverables.push(...fileMatches.map(m => m.replace(/`/g, '')));
  }
  
  // Look for "create file" patterns
  const createMatches = body.match(/create\s+(?:a\s+)?(?:new\s+)?(?:file\s+)?(?:called\s+)?['"`]?([^\s'"`,]+\.[a-z]+)/gi);
  if (createMatches) {
    createMatches.forEach(match => {
      const filename = match.match(/['"`]?([^\s'"`,]+\.[a-z]+)/i)?.[1];
      if (filename) deliverables.push(filename);
    });
  }
  
  // Type-specific deliverables
  switch (taskType) {
    case 'documentation':
      if (title.toLowerCase().includes('readme')) {
        deliverables.push('README.md');
      }
      if (body.toLowerCase().includes('api')) {
        deliverables.push('docs/API.md');
      }
      break;
      
    case 'feature':
      // Features often need new components
      const componentMatch = title.match(/add\s+(\w+)\s+(?:component|feature|page)/i);
      if (componentMatch) {
        deliverables.push(`src/components/${componentMatch[1]}.tsx`);
      }
      break;
  }
  
  // Remove duplicates
  return [...new Set(deliverables)];
}

/**
 * Generate success criteria for the task
 */
function generateSuccessCriteria(issue: Issue, taskType: string): string[] {
  const criteria: string[] = [];
  
  // Universal criteria
  criteria.push('All changes are committed with descriptive messages');
  criteria.push('No protected files are modified');
  
  // Type-specific criteria
  switch (taskType) {
    case 'bug':
      criteria.push('The reported issue is fixed and verified');
      criteria.push('No new bugs are introduced');
      criteria.push('Relevant tests are updated or added');
      break;
      
    case 'feature':
      criteria.push('The feature works as described');
      criteria.push('User-facing features have appropriate UI/UX');
      criteria.push('New code follows existing patterns');
      break;
      
    case 'documentation':
      criteria.push('Documentation is clear and well-formatted');
      criteria.push('All mentioned topics are covered');
      criteria.push('Examples are provided where appropriate');
      break;
      
    case 'performance':
      criteria.push('Performance improvement is measurable');
      criteria.push('No functionality is broken');
      break;
  }
  
  // Extract specific requirements from issue body
  const body = issue.body || '';
  const requirements = body.match(/- \[ \] (.+)/g);
  if (requirements) {
    requirements.forEach(req => {
      criteria.push(req.replace('- [ ] ', ''));
    });
  }
  
  return criteria;
}

/**
 * Estimate task complexity
 */
function estimateComplexity(content: string, taskType: string): 'simple' | 'medium' | 'complex' {
  const words = content.split(/\s+/).length;
  
  // Simple heuristics
  if (taskType === 'documentation' && words < 100) return 'simple';
  if (taskType === 'bug' && content.includes('typo')) return 'simple';
  
  if (words > 300) return 'complex';
  if (content.includes('refactor') || content.includes('architecture')) return 'complex';
  if (content.includes('multiple') || content.includes('various')) return 'complex';
  
  return 'medium';
}

/**
 * Generate enhanced prompt for agent
 */
export function generateEnhancedPrompt(
  issue: Issue,
  classification: TaskClassification,
  worktreePath: string
): { systemPrompt: string; taskPrompt: string } {
  const systemPrompt = `You are a SwarmStation AI agent working on GitHub issue #${issue.number}.

CRITICAL RULES:
1. You work in a git worktree at: ${worktreePath}
2. Task type: ${classification.taskType} (Priority: ${classification.priority})
3. NEVER modify these protected files: ${classification.protectedFiles.join(', ')}
4. You must create/modify these deliverables: ${classification.expectedDeliverables.join(', ')}
5. Your work must meet these criteria: 
${classification.successCriteria.map(c => `   - ${c}`).join('\n')}

WORKFLOW:
1. Understand the requirements fully
2. Plan your approach
3. Implement the solution
4. Verify your work meets all criteria
5. Commit with clear messages
6. Create PR when complete`;

  const taskPrompt = `GitHub Issue #${issue.number}: ${issue.title}

Type: ${classification.taskType}
Priority: ${classification.priority}
Complexity: ${classification.estimatedComplexity}

Description:
${issue.body || 'No description provided'}

Expected Deliverables:
${classification.expectedDeliverables.map(d => `- ${d}`).join('\n')}

Remember:
- Focus only on what's asked
- Don't modify protected files
- Verify deliverables exist before creating PR
- Use git status to check your changes

Start by analyzing what needs to be done.`;

  return { systemPrompt, taskPrompt };
}

/**
 * Get allowed tools based on task type
 */
export function getAllowedTools(taskType: string): string[] {
  const baseTools = ['Read', 'Write', 'LS', 'Grep', 'Git'];
  
  switch (taskType) {
    case 'documentation':
      // Docs tasks don't need to run code
      return [...baseTools];
      
    case 'bug':
    case 'feature':
      // May need to run tests
      return [...baseTools, 'Bash', 'Edit'];
      
    case 'performance':
      // May need profiling
      return [...baseTools, 'Bash', 'Edit'];
      
    default:
      return [...baseTools, 'Bash', 'Edit'];
  }
}