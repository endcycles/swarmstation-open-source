/**
 * Simple logger utility for SwarmStation
 * Provides consistent logging with levels and optional filtering
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export class Logger {
  private static currentLevel: LogLevel = LogLevel.INFO;
  private static isDevelopment = process.env.NODE_ENV === 'development';

  static setLevel(level: LogLevel) {
    this.currentLevel = level;
  }

  static error(context: string, message: string, error?: any) {
    if (this.currentLevel >= LogLevel.ERROR) {
      if (error) {
        // In production, send errors to error reporting service
        // For now, we'll just silently handle them
        if (this.isDevelopment) {
          console.error(`[${context}] ${message}`, error);
        }
      } else {
        if (this.isDevelopment) {
          console.error(`[${context}] ${message}`);
        }
      }
    }
  }

  static warn(context: string, message: string, data?: any) {
    if (this.currentLevel >= LogLevel.WARN && this.isDevelopment) {
      if (data) {
        console.warn(`[${context}] ${message}`, data);
      } else {
        console.warn(`[${context}] ${message}`);
      }
    }
  }

  static info(context: string, message: string, data?: any) {
    if (this.currentLevel >= LogLevel.INFO && this.isDevelopment) {
      if (data) {
        console.info(`[${context}] ${message}`, data);
      } else {
        console.info(`[${context}] ${message}`);
      }
    }
  }

  static debug(context: string, message: string, data?: any) {
    if (this.currentLevel >= LogLevel.DEBUG && this.isDevelopment) {
      if (data) {
        console.log(`[${context}] ${message}`, data);
      } else {
        console.log(`[${context}] ${message}`);
      }
    }
  }
}

// Set default level based on environment
if (process.env.NODE_ENV === 'development') {
  Logger.setLevel(LogLevel.DEBUG);
} else {
  Logger.setLevel(LogLevel.ERROR);
}