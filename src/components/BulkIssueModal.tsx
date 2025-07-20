import React, { useState } from 'react';
import { Logger } from '../../core/utils/logger';

interface ParsedIssue {
  title: string;
  description: string;
  labels: string[];
}

interface BulkIssueModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (issues: ParsedIssue[]) => Promise<void>;
  parseIssues: (text: string) => Promise<ParsedIssue[]>;
}

function BulkIssueModal({ show, onClose, onSubmit, parseIssues }: BulkIssueModalProps) {
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [inputText, setInputText] = useState('');
  const [parsedIssues, setParsedIssues] = useState<ParsedIssue[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParseIssues = async () => {
    setIsParsing(true);
    setError(null);

    try {
      if (!inputText.trim()) {
        setError('Please enter some text to parse.');
        setIsParsing(false);
        return;
      }

      // Use Claude to parse the issues from any format
      const issues = await parseIssues(inputText);
      
      if (!issues || issues.length === 0) {
        setError('No issues could be identified in the text. Please try rephrasing.');
        setIsParsing(false);
        return;
      }

      // Convert the parsed format to match our interface
      const formattedIssues: ParsedIssue[] = issues.map(issue => ({
        title: issue.title || '',
        description: issue.body || issue.description || '',
        labels: issue.labels || []
      }));

      setParsedIssues(formattedIssues);
      setStep('preview');
    } catch (err) {
      Logger.error('BulkIssueModal', 'Error parsing issues', err);
      setError('An error occurred while parsing the issues. Please try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSubmit = async () => {
    if (parsedIssues.length === 0) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit(parsedIssues);
      
      // Reset form on success
      setInputText('');
      setParsedIssues([]);
      setStep('input');
      onClose();
    } catch (error) {
      setError('Failed to create issues. Please try again.');
      Logger.error('BulkIssueModal', 'Error creating bulk issues', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting && !isParsing) {
      setInputText('');
      setParsedIssues([]);
      setStep('input');
      setError(null);
      onClose();
    }
  };

  const handleBack = () => {
    setStep('input');
    setError(null);
  };

  const toggleLabel = (issueIndex: number, label: string) => {
    setParsedIssues(prev => prev.map((issue, idx) => {
      if (idx !== issueIndex) return issue;
      
      const newLabels = issue.labels.includes(label)
        ? issue.labels.filter(l => l !== label)
        : [...issue.labels, label];
      
      return { ...issue, labels: newLabels };
    }));
  };

  if (!show) return null;

  return (
    <div className={`fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-1000 transition-opacity duration-300 ease-in-out ${show ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      <div className={`bg-gray-medium border border-white/10 rounded-xl p-6 w-full max-w-2xl mx-4 shadow-2xl transition-transform duration-300 ease-in-out ${show ? 'scale-100' : 'scale-95'}`}>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white">
            {step === 'input' ? 'Create Issues' : `Preview ${parsedIssues.length} Issue${parsedIssues.length !== 1 ? 's' : ''}`}
          </h2>
        </div>

        {step === 'input' ? (
          <>
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">
                Enter your issue(s) - single or multiple, any format
              </label>
              <textarea
                className="w-full p-4 bg-white/5 border border-white/10 rounded-md text-white text-sm transition-colors focus:outline-none focus:border-purple-gradient-start focus:bg-gray-600 min-h-[300px] resize-none font-mono"
                placeholder="Examples:&#10;&#10;Single issue:&#10;Fix the login bug where users can't reset passwords&#10;&#10;Multiple issues:&#10;- Add dark mode to settings&#10;- Update API documentation&#10;- Dashboard is slow with 1000+ items&#10;&#10;Or natural language:&#10;We need to fix the critical login bug and add dark mode. Also the API docs are outdated."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isParsing}
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-2">
                Paste any text containing issues - Claude will intelligently parse and extract them for you.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-4">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-white/10 bg-transparent text-gray-text font-medium cursor-pointer transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleClose}
                disabled={isParsing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-6 py-2 rounded-lg bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end text-white font-semibold cursor-pointer transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                onClick={handleParseIssues}
                disabled={isParsing || !inputText.trim()}
              >
                {isParsing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Parsing...</span>
                  </>
                ) : (
                  'Parse Issues'
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 max-h-[400px] overflow-y-auto">
              <div className="space-y-4">
                {parsedIssues.map((issue, index) => (
                  <div key={index} className="p-4 bg-white/5 border border-white/10 rounded-md">
                    <h3 className="text-white font-medium mb-2">
                      <span className="text-gray-400 mr-2">#{index + 1}</span>
                      {issue.title}
                    </h3>
                    {issue.description && (
                      <p className="text-sm text-gray-400 mb-3 whitespace-pre-wrap">
                        {issue.description}
                      </p>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {['bug', 'feature', 'enhancement', 'docs', 'performance', 'typescript'].map(label => (
                        <button
                          key={label}
                          type="button"
                          className={`py-1 px-3 rounded-full border text-xs cursor-pointer transition-all ${
                            issue.labels.includes(label)
                              ? 'border-purple-gradient-start bg-purple-gradient-start/20 text-white'
                              : 'border-white/20 bg-transparent text-gray-text hover:border-white/40'
                          } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                          onClick={() => toggleLabel(index, label)}
                          disabled={isSubmitting}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="flex justify-between">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-white/10 bg-transparent text-gray-text font-medium cursor-pointer transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleBack}
                disabled={isSubmitting}
              >
                Back
              </button>
              <div className="flex gap-4">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border border-white/10 bg-transparent text-gray-text font-medium cursor-pointer transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-6 py-2 rounded-lg bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end text-white font-semibold cursor-pointer transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  onClick={handleSubmit}
                  disabled={isSubmitting || parsedIssues.length === 0}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Creating...</span>
                    </>
                  ) : (
                    `Create ${parsedIssues.length} Issues`
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default BulkIssueModal;