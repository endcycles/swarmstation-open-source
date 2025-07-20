import React, { useState } from 'react';
import { PullRequest } from '../types';

interface FeedbackModalProps {
  pr: PullRequest;
  onSubmit: (feedback: string) => void;
  onClose: () => void;
}

function FeedbackModal({ pr, onSubmit, onClose }: FeedbackModalProps) {
  const [feedback, setFeedback] = useState('');
  
  const handleSubmit = () => {
    if (feedback.trim()) {
      onSubmit(feedback);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-secondary border border-white/10 rounded-lg p-6 max-w-2xl w-full mx-4">
        <h3 className="text-xl font-semibold text-white mb-4">Retry Agent with PR Feedback</h3>
        
        <div className="mb-4">
          <p className="text-sm text-gray-text mb-2">PR: {pr.title}</p>
          <p className="text-xs text-gray-600">Issue #{pr.issue?.number || pr.issue}</p>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-text mb-2">
            Feedback from PR Review
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Paste PR comments or describe what needs to be fixed. The agent will see this along with the original issue."
            className="w-full p-3 bg-white/5 border border-white/10 rounded-md text-white placeholder-gray-600 focus:outline-none focus:border-purple-gradient-start"
            rows={10}
          />
        </div>
        
        <div className="text-xs text-gray-600 mb-4">
          💡 Tip: Include specific error messages, failed tests, or code suggestions from the PR review.
        </div>
        
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="py-2 px-4 rounded-md border border-white/20 bg-transparent text-white text-sm cursor-pointer transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!feedback.trim()}
            className="py-2 px-4 rounded-md bg-purple-gradient-start text-white text-sm cursor-pointer transition-colors hover:bg-purple-gradient-end disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Retry Agent with Feedback
          </button>
        </div>
      </div>
    </div>
  );
}

export default FeedbackModal;