import React, { useState, useEffect } from 'react';
import { Logger } from '../../core/utils/logger';

interface IssueModalProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    labels?: string[];
    issueNumber?: number;
  }) => Promise<void>;
  onDelete?: (issueNumber: number) => Promise<void>;
  issue?: {
    number: number;
    title: string;
    body?: string;
    labels?: Array<{ name: string }>;
  } | null;
  mode: 'create' | 'edit';
}

function IssueModal({
  show,
  onClose,
  onSubmit,
  onDelete,
  issue,
  mode
}: IssueModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && issue) {
      setTitle(issue.title || '');
      setDescription(issue.body || '');
      setSelectedLabels(issue.labels?.map(l => l.name) || []);
    } else if (mode === 'create') {
      // Reset form for create mode
      setTitle('');
      setDescription('');
      setSelectedLabels([]);
    }
  }, [issue, mode]);

  const handleLabelClick = (label: string) => {
    setSelectedLabels(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);

    try {
      await onSubmit({
        title,
        description,
        labels: selectedLabels,
        issueNumber: mode === 'edit' && issue ? issue.number : undefined
      });

      // Reset form on success for create mode
      if (mode === 'create') {
        setTitle('');
        setDescription('');
        setSelectedLabels([]);
      }

      onClose();
    } catch (error) {
      // Error is handled by parent component
      Logger.error('IssueModal', `Error ${mode === 'create' ? 'creating' : 'updating'} issue`, error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!issue || !onDelete) return;

    if (window.confirm(`Are you sure you want to close issue #${issue.number}?`)) {
      // Don't set isClosing here since modal will close immediately
      // The parent component handles the loading state
      onDelete(issue.number);
    }
  };

  if (!show) return null;
  if (mode === 'edit' && !issue) return null;

  const isEditMode = mode === 'edit';
  const modalTitle = isEditMode ? `Update Issue #${issue?.number}` : 'Create New Issue';
  const submitButtonText = isEditMode ? 'Update Issue' : 'Create Issue';
  const loadingText = isEditMode ? 'Updating...' : 'Creating...';

  return (
    <div className={`fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-1000 transition-opacity duration-300 ease-in-out ${show ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
      <div className={`bg-gray-medium border border-white/10 rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl transition-transform duration-300 ease-in-out ${show ? 'scale-100' : 'scale-95'}`}>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-white">{modalTitle}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2">Issue Title</label>
            <input
              type="text"
              className="w-full p-4 bg-white/5 border border-white/10 rounded-md text-white text-sm transition-colors focus:outline-none focus:border-purple-gradient-start focus:bg-gray-600"
              id="issue-title"
              placeholder="Brief description of the issue"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2">Description</label>
            <textarea
              className="w-full p-4 bg-white/5 border border-white/10 rounded-md text-white text-sm transition-colors focus:outline-none focus:border-purple-gradient-start focus:bg-gray-600 min-h-[100px] resize-none"
              id="issue-description"
              placeholder="Detailed description of what needs to be done..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
            ></textarea>
          </div>

          <div className="mb-6">
            <label className="block text-sm text-gray-400 mb-2">Labels</label>
            <div className="flex gap-2 flex-wrap">
              <button type="button" className={`py-2 px-4 rounded-full border text-xs cursor-pointer transition-all ${selectedLabels.includes('bug') ? 'border-purple-gradient-start bg-purple-gradient-start/20 text-white' : 'border-white/20 bg-transparent text-gray-text hover:border-white/40'} ${isSubmitting || isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={() => handleLabelClick('bug')} disabled={isSubmitting || isDeleting}>Bug</button>
              <button type="button" className={`py-2 px-4 rounded-full border text-xs cursor-pointer transition-all ${selectedLabels.includes('feature') ? 'border-purple-gradient-start bg-purple-gradient-start/20 text-white' : 'border-white/20 bg-transparent text-gray-text hover:border-white/40'} ${isSubmitting || isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={() => handleLabelClick('feature')} disabled={isSubmitting || isDeleting}>Feature</button>
              <button type="button" className={`py-2 px-4 rounded-full border text-xs cursor-pointer transition-all ${selectedLabels.includes('enhancement') ? 'border-purple-gradient-start bg-purple-gradient-start/20 text-white' : 'border-white/20 bg-transparent text-gray-text hover:border-white/40'} ${isSubmitting || isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={() => handleLabelClick('enhancement')} disabled={isSubmitting || isDeleting}>Enhancement</button>
              <button type="button" className={`py-2 px-4 rounded-full border text-xs cursor-pointer transition-all ${selectedLabels.includes('docs') ? 'border-purple-gradient-start bg-purple-gradient-start/20 text-white' : 'border-white/20 bg-transparent text-gray-text hover:border-white/40'} ${isSubmitting || isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`} data-label="docs" onClick={() => handleLabelClick('docs')} disabled={isSubmitting || isDeleting}>Documentation</button>
              <button type="button" className={`py-2 px-4 rounded-full border text-xs cursor-pointer transition-all ${selectedLabels.includes('performance') ? 'border-purple-gradient-start bg-purple-gradient-start/20 text-white' : 'border-white/20 bg-transparent text-gray-text hover:border-white/40'} ${isSubmitting || isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`} data-label="performance" onClick={() => handleLabelClick('performance')} disabled={isSubmitting || isDeleting}>Performance</button>
              <button type="button" className={`py-2 px-4 rounded-full border text-xs cursor-pointer transition-all ${selectedLabels.includes('typescript') ? 'border-purple-gradient-start bg-purple-gradient-start/20 text-white' : 'border-white/20 bg-transparent text-gray-text hover:border-white/40'} ${isSubmitting || isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`} data-label="typescript" onClick={() => handleLabelClick('typescript')} disabled={isSubmitting || isDeleting}>TypeScript</button>
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-6">
            <button
              type="button"
              className="px-4 py-2 rounded-lg border border-white/10 bg-transparent text-gray-text font-medium cursor-pointer transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onClose}
              disabled={isSubmitting || isDeleting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg bg-gradient-to-br from-purple-gradient-start to-purple-gradient-end text-white font-semibold cursor-pointer transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={isSubmitting || isDeleting || !title.trim()}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>{loadingText}</span>
                </>
              ) : (
                submitButtonText
              )}
            </button>
          </div>

          {mode === 'edit' && onDelete && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <button
                type="button"
                className="text-sm text-status-error text-red-500 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleDelete}
                disabled={isSubmitting || isDeleting}
              >
                {isDeleting ? 'Closing issue...' : 'Close this issue'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default IssueModal;