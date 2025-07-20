import { useState, useCallback, useEffect } from 'react';
import { ParsedIssue } from '../types';
import gitServiceOptimized from '../../core/git-service-optimized';
import { parseIssuesFromText } from '../../core/claude-service-enhanced';
import { Logger } from '../../core/utils/logger';

interface UseOptimizedIssueCreationOptions {
  selectedRepo: string | null;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  onIssueCreated?: (issue: any) => void;
}

export function useOptimizedIssueCreation({
  selectedRepo,
  onSuccess,
  onError,
  onIssueCreated
}: UseOptimizedIssueCreationOptions) {
  const [isCreating, setIsCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState({ current: 0, total: 0 });

  // Pre-warm caches when repo changes
  useEffect(() => {
    if (selectedRepo) {
      gitServiceOptimized.prewarmRepository(selectedRepo).catch(error => 
        Logger.error('useOptimizedIssueCreation', 'Failed to prewarm repository', error)
      );
    }
  }, [selectedRepo]);

  // Create single issue with optimization
  const createSingleIssue = useCallback(async (
    title: string,
    body: string,
    labels?: string[]
  ) => {
    if (!selectedRepo) {
      onError?.('No repository selected');
      return null;
    }

    setIsCreating(true);
    try {
      const issue = await gitServiceOptimized.createIssueOptimized(
        selectedRepo,
        title,
        body,
        labels
      );
      
      onSuccess?.(`Created issue #${issue.number}: ${issue.title}`);
      onIssueCreated?.(issue);
      return issue;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      onError?.(`Failed to create issue: ${message}`);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [selectedRepo, onSuccess, onError, onIssueCreated]);

  // Create multiple issues in batch
  const createBulkIssues = useCallback(async (issues: ParsedIssue[]) => {
    if (!selectedRepo) {
      onError?.('No repository selected');
      return [];
    }

    setIsCreating(true);
    setCreationProgress({ current: 0, total: issues.length });

    try {
      // Convert ParsedIssue to the format expected by batch creator
      const issuesToCreate = issues.map(issue => ({
        title: issue.title,
        body: issue.body,
        labels: issue.labels
      }));

      const results = await gitServiceOptimized.createIssuesBatch(
        selectedRepo,
        issuesToCreate
      );

      // Process results
      const created = [];
      const failed = [];
      
      for (const result of results) {
        if (result.error) {
          failed.push(result);
          onError?.(`Failed to create "${result.issue.title}": ${result.error.message}`);
        } else {
          created.push(result);
          onIssueCreated?.(result);
        }
        setCreationProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }

      if (created.length > 0) {
        onSuccess?.(`Successfully created ${created.length} issue${created.length !== 1 ? 's' : ''}`);
      }

      return created;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      onError?.(`Bulk creation failed: ${message}`);
      return [];
    } finally {
      setIsCreating(false);
      setCreationProgress({ current: 0, total: 0 });
    }
  }, [selectedRepo, onSuccess, onError, onIssueCreated]);

  // Parse issues from text
  const parseIssues = useCallback(async (text: string): Promise<ParsedIssue[]> => {
    try {
      return await parseIssuesFromText(text);
    } catch (error) {
      onError?.('Failed to parse issues from text');
      return [];
    }
  }, [onError]);

  return {
    createSingleIssue,
    createBulkIssues,
    parseIssues,
    isCreating,
    creationProgress
  };
}