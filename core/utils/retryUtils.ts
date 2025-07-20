/**
 * Retry utilities for handling transient failures
 */

import { Logger } from './logger';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryCondition?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryCondition: (error) => {
    // Retry on network errors and specific HTTP status codes
    if (!error) return false;
    
    // Network errors
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET') {
      return true;
    }
    
    // GitHub API rate limiting or server errors
    if (error.status === 429 || // Rate limited
        error.status === 502 || // Bad gateway
        error.status === 503 || // Service unavailable
        error.status === 504) { // Gateway timeout
      return true;
    }
    
    // GitHub API specific errors
    const message = error.message?.toLowerCase() || '';
    if (message.includes('rate limit') ||
        message.includes('timeout') ||
        message.includes('econnreset') ||
        message.includes('socket hang up') ||
        message.includes('service unavailable')) {
      return true;
    }
    
    return false;
  },
  onRetry: () => {}
};

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (attempt < opts.maxRetries && opts.retryCondition(error)) {
        // Calculate delay with exponential backoff
        const delay = Math.min(
          opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt),
          opts.maxDelay
        );
        
        // Notify about retry
        opts.onRetry(error, attempt + 1);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Don't retry, throw the error
        throw error;
      }
    }
  }
  
  // All retries exhausted
  throw lastError;
}

/**
 * Create a retry wrapper for a specific function
 */
export function createRetryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  defaultOptions: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>) => {
    return withRetry(() => fn(...args), defaultOptions);
  }) as T;
}

/**
 * Retry specifically for GitHub API operations
 */
export async function withGitHubRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  onStatusUpdate?: (message: string) => void
): Promise<T> {
  return withRetry(operation, {
    maxRetries: 3,
    initialDelay: 2000,
    retryCondition: (error) => {
      // Always retry on rate limits with longer delay
      if (error.status === 429 || error.message?.includes('rate limit')) {
        const resetTime = error.headers?.['x-ratelimit-reset'];
        if (resetTime) {
          const waitTime = Math.max(0, parseInt(resetTime) * 1000 - Date.now());
          if (waitTime > 0 && waitTime < 300000) { // Max 5 minutes
            return true;
          }
        }
        return true;
      }
      
      return DEFAULT_OPTIONS.retryCondition(error);
    },
    onRetry: (error, attempt) => {
      const message = `${operationName} failed (attempt ${attempt}/${3}): ${error.message || error}`;
      Logger.debug('RETRY', message);
      onStatusUpdate?.(message);
    }
  });
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: any): boolean {
  return DEFAULT_OPTIONS.retryCondition(error);
}

/**
 * Calculate retry delay based on rate limit headers
 */
export function calculateRateLimitDelay(headers: any): number {
  const resetTime = headers?.['x-ratelimit-reset'];
  if (resetTime) {
    const waitTime = Math.max(0, parseInt(resetTime) * 1000 - Date.now());
    // Add a small buffer to ensure we're past the reset time
    return waitTime + 1000;
  }
  return 60000; // Default to 1 minute if no reset header
}