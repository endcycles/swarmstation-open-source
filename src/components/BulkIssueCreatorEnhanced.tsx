import React, { useState, useEffect, useCallback } from 'react';
import { ParsedIssue } from '../types';
import { quickParseIssues } from '../../core/claude-service-enhanced';
import { debounce } from '../../core/utils/debounce';
import { Logger } from '../../core/utils/logger';

interface BulkIssueCreatorEnhancedProps {
  onCreateIssues: (issues: ParsedIssue[]) => Promise<void>;
  isCreating: boolean;
  selectedRepo: string;
}

const EXAMPLE_FORMATS = [
  {
    name: "Simple List",
    example: `Fix login bug where users can't reset password
Add dark mode toggle to settings page
Update API documentation for v2 endpoints`,
    description: "Simple bullet points or lines"
  },
  {
    name: "Detailed Format",
    example: `BUG: Users can't reset password - email service is broken
Steps: Go to login > Click forgot password > Enter email > No email received
Priority: Critical

FEATURE: Add dark mode toggle to settings
Users have been requesting this for months. Should save preference.
Priority: High`,
    description: "Include type, priority, and details"
  },
  {
    name: "Natural Language",
    example: `We have a critical bug where users can't log in after resetting their passwords. The email service seems to be broken and not sending reset emails.

Also, customers have been asking for dark mode for months now. We should add a toggle in the settings page that saves their preference.

The API documentation is outdated since we launched v2. Need to update all the endpoint docs.`,
    description: "Write naturally, AI will parse"
  }
];

const QUICK_TEMPLATES = [
  {
    name: "🐛 Bug Report",
    template: `BUG: [Component] - [What's broken]
Steps to reproduce:
1. 
2. 
Expected: 
Actual: 
Priority: `
  },
  {
    name: "✨ Feature",
    template: `FEATURE: [What you want]
Why it's needed: 
Acceptance criteria:
- [ ] 
Priority: `
  },
  {
    name: "🚀 Performance",
    template: `PERF: [What's slow] takes [X seconds]
Context: 
Current: X seconds
Target: < Y seconds
Priority: `
  },
  {
    name: "📚 Documentation",
    template: `DOCS: Update [what needs documenting]
Sections to cover:
- 
Target audience: `
  }
];

function BulkIssueCreatorEnhanced({ 
  onCreateIssues, 
  isCreating,
  selectedRepo 
}: BulkIssueCreatorEnhancedProps) {
  const [rawText, setRawText] = useState('');
  const [parsedIssues, setParsedIssues] = useState<ParsedIssue[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [selectedExample, setSelectedExample] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);

  // Debounced parsing function
  const debouncedParse = useCallback(
    debounce(async (text: string) => {
      if (text.trim().length < 10) {
        setParsedIssues([]);
        setParseError(null);
        return;
      }

      setIsParsing(true);
      setParseError(null);
      
      try {
        // Use quick local parser for real-time preview
        const issues = quickParseIssues(text);
        setParsedIssues(issues);
        
        if (issues.length === 0) {
          setParseError('No issues detected. Try using clearer action words like "Fix", "Add", "Update".');
        }
      } catch (error) {
        Logger.error('BulkIssueCreator', 'Parse error', error);
        setParseError('Failed to parse issues. Please check your format.');
        setParsedIssues([]);
      } finally {
        setIsParsing(false);
      }
    }, 500),
    []
  );

  // Parse on text change
  useEffect(() => {
    debouncedParse(rawText);
  }, [rawText, debouncedParse]);

  const handleExampleSelect = (index: number) => {
    setSelectedExample(index);
    setRawText(EXAMPLE_FORMATS[index].example);
  };

  const handleTemplateInsert = (template: string) => {
    const cursorPos = (document.activeElement as HTMLTextAreaElement)?.selectionStart || rawText.length;
    const newText = rawText.slice(0, cursorPos) + template + rawText.slice(cursorPos);
    setRawText(newText);
  };

  const handleCreateAll = async () => {
    if (parsedIssues.length === 0) return;
    await onCreateIssues(parsedIssues);
    setRawText('');
    setParsedIssues([]);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-500';
      case 'high': return 'text-orange-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bug': return '🐛';
      case 'feature': return '✨';
      case 'documentation': return '📚';
      case 'performance': return '🚀';
      case 'security': return '🔒';
      case 'refactor': return '🔧';
      default: return '📋';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <h3 className="text-lg font-semibold mb-2">Bulk Create Issues</h3>
        <p className="text-sm text-gray-400">
          Type or paste your issues in any format. AI will parse them into structured GitHub issues.
        </p>
      </div>

      {/* Examples */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Examples:</span>
          <div className="flex gap-2">
            {QUICK_TEMPLATES.map((template, i) => (
              <button
                key={i}
                onClick={() => handleTemplateInsert(template.template)}
                className="text-xs px-2 py-1 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
                title={`Insert ${template.name} template`}
              >
                {template.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {EXAMPLE_FORMATS.map((example, i) => (
            <button
              key={i}
              onClick={() => handleExampleSelect(i)}
              className={`flex-1 p-2 text-xs rounded transition-colors ${
                selectedExample === i 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              <div className="font-medium">{example.name}</div>
              <div className="text-xs opacity-75 mt-1">{example.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex gap-4 p-4 min-h-0">
        {/* Input */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">Input Text:</label>
            <span className="text-xs text-gray-400">
              {isParsing ? 'Parsing...' : `${parsedIssues.length} issues detected`}
            </span>
          </div>
          <textarea
            className="flex-1 p-3 bg-gray-800 border border-white/10 rounded-md text-white resize-none font-mono text-sm"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste your issues here in any format...

Examples:
- Fix the login bug
- Add dark mode to settings
- Update documentation

Or write naturally:
We need to fix the critical login bug and add dark mode..."
            disabled={isCreating}
          />
          <div className="mt-2 text-xs text-gray-400">
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to create all
          </div>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Preview:</label>
              <button
                onClick={() => setShowPreview(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Hide
              </button>
            </div>
            <div className="flex-1 bg-gray-900 border border-white/10 rounded-md p-3 overflow-y-auto">
              {parseError ? (
                <div className="text-yellow-500 text-sm">{parseError}</div>
              ) : parsedIssues.length === 0 ? (
                <div className="text-gray-500 text-sm">
                  Issues will appear here as you type...
                </div>
              ) : (
                <div className="space-y-3">
                  {parsedIssues.map((issue, i) => (
                    <div key={i} className="bg-gray-800 rounded p-3">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{getTypeIcon(issue.type)}</span>
                          <h4 className="font-medium">{issue.title}</h4>
                        </div>
                        <span className={`text-xs ${getPriorityColor(issue.priority)}`}>
                          {issue.priority}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mb-2 line-clamp-2">
                        {issue.body.split('\n')[0]}
                      </p>
                      <div className="flex gap-1 flex-wrap">
                        {issue.labels.map((label, j) => (
                          <span 
                            key={j} 
                            className="text-xs px-2 py-0.5 bg-gray-700 rounded"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Show preview button when hidden */}
        {!showPreview && (
          <button
            onClick={() => setShowPreview(true)}
            className="self-start mt-8 text-sm text-gray-400 hover:text-white"
          >
            Show Preview →
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-white/10 flex justify-between items-center">
        <div className="text-sm text-gray-400">
          {!selectedRepo && (
            <span className="text-yellow-500">⚠️ Select a repository first</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setRawText('');
              setParsedIssues([]);
            }}
            className="px-4 py-2 text-sm bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
            disabled={isCreating || !rawText}
          >
            Clear
          </button>
          <button
            onClick={handleCreateAll}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isCreating || parsedIssues.length === 0 || !selectedRepo}
          >
            {isCreating ? 'Creating...' : `Create ${parsedIssues.length} Issue${parsedIssues.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkIssueCreatorEnhanced;