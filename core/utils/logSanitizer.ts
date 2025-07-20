/**
 * Log sanitizer utilities
 */

export function sanitizeLogEntry(entry: any): any {
  if (!entry) return entry;
  
  // If it's a string, just return it
  if (typeof entry === 'string') {
    return entry;
  }
  
  // If it's an object, sanitize recursively
  if (typeof entry === 'object') {
    const sanitized: any = Array.isArray(entry) ? [] : {};
    
    for (const key in entry) {
      if (entry.hasOwnProperty(key)) {
        // Skip sensitive keys
        if (key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('password') ||
            key.toLowerCase().includes('secret') ||
            key.toLowerCase().includes('key')) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = sanitizeLogEntry(entry[key]);
        }
      }
    }
    
    return sanitized;
  }
  
  // For other types, return as-is
  return entry;
}

export function sanitizeLogObject(obj: any): any {
  return sanitizeLogEntry(obj);
}