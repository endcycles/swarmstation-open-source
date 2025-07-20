/**
 * Debounce utility function
 * Delays execution of a function until after wait milliseconds have elapsed
 * since the last time it was invoked
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, wait);
  };
}

/**
 * Debounce with immediate option
 * Executes immediately on first call, then debounces subsequent calls
 */
export function debounceWithImmediate<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate: boolean = false
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  let hasBeenCalled = false;

  return function debounced(...args: Parameters<T>) {
    const callNow = immediate && !hasBeenCalled;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      hasBeenCalled = false;
      if (!callNow) {
        func(...args);
      }
    }, wait);

    if (callNow) {
      hasBeenCalled = true;
      func(...args);
    }
  };
}