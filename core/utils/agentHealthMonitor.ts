/**
 * Agent Health Monitoring System
 * Monitors agent status and implements auto-recovery mechanisms
 */

import { Agent } from '../types';

export interface AgentHealthStatus {
  issueNumber: number;
  isHealthy: boolean;
  lastActivity: Date;
  stuckDuration?: number;
  errorCount: number;
  recommendation: 'none' | 'restart' | 'cleanup' | 'investigate';
  details?: string;
}

export interface AgentHealthConfig {
  stuckThreshold: number; // Time in ms before agent is considered stuck
  maxErrorCount: number; // Max errors before intervention
  checkInterval: number; // How often to check health
  maxAgentRuntime: number; // Maximum time an agent should run
}

const DEFAULT_CONFIG: AgentHealthConfig = {
  stuckThreshold: 300000, // 5 minutes without activity
  maxErrorCount: 10,
  checkInterval: 30000, // Check every 30 seconds
  maxAgentRuntime: 3600000 // 1 hour max runtime
};

export class AgentHealthMonitor {
  private config: AgentHealthConfig;
  private agentActivity: Map<number, Date> = new Map();
  private agentErrors: Map<number, number> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private onUnhealthy?: (status: AgentHealthStatus) => void;
  private addActivity?: (message: string) => void;
  
  constructor(options: {
    config?: Partial<AgentHealthConfig>;
    onUnhealthy?: (status: AgentHealthStatus) => void;
    addActivity?: (message: string) => void;
  }) {
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.onUnhealthy = options.onUnhealthy;
    this.addActivity = options.addActivity;
  }
  
  /**
   * Start monitoring agents
   */
  start(getAgents: () => Record<number, Agent>): void {
    if (this.monitorInterval) {
      this.stop();
    }
    
    this.addActivity?.('Agent health monitoring started');
    
    this.monitorInterval = setInterval(() => {
      this.checkAgentHealth(getAgents());
    }, this.config.checkInterval);
    
    // Initial check
    this.checkAgentHealth(getAgents());
  }
  
  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.agentActivity.clear();
    this.agentErrors.clear();
    this.addActivity?.('Agent health monitoring stopped');
  }
  
  /**
   * Record agent activity
   */
  recordActivity(issueNumber: number): void {
    this.agentActivity.set(issueNumber, new Date());
  }
  
  /**
   * Record agent error
   */
  recordError(issueNumber: number): void {
    const current = this.agentErrors.get(issueNumber) || 0;
    this.agentErrors.set(issueNumber, current + 1);
  }
  
  /**
   * Clear agent data (when agent completes or is removed)
   */
  clearAgent(issueNumber: number): void {
    this.agentActivity.delete(issueNumber);
    this.agentErrors.delete(issueNumber);
  }
  
  /**
   * Check health of all agents
   */
  private checkAgentHealth(agents: Record<number, Agent>): void {
    const now = new Date();
    
    for (const [issueNumber, agent] of Object.entries(agents)) {
      const issue = parseInt(issueNumber);
      
      // Skip if agent is not in working state
      if (agent.status !== 'working' && agent.status !== 'starting' && agent.status !== 'running') {
        continue;
      }
      
      const healthStatus = this.getAgentHealthStatus(issue, agent, now);
      
      if (!healthStatus.isHealthy) {
        this.addActivity?.(`Agent #${issue} health check failed: ${healthStatus.details}`);
        this.onUnhealthy?.(healthStatus);
      }
    }
  }
  
  /**
   * Get health status for a specific agent
   */
  getAgentHealthStatus(issueNumber: number, agent: Agent, now: Date = new Date()): AgentHealthStatus {
    const lastActivity = this.agentActivity.get(issueNumber) || new Date(agent.startTime || now);
    const errorCount = this.agentErrors.get(issueNumber) || 0;
    const runtime = now.getTime() - (agent.startTime || now.getTime());
    const timeSinceActivity = now.getTime() - lastActivity.getTime();
    
    // Check various health conditions
    const isStuck = timeSinceActivity > this.config.stuckThreshold;
    const tooManyErrors = errorCount > this.config.maxErrorCount;
    const runningTooLong = runtime > this.config.maxAgentRuntime;
    
    let isHealthy = true;
    let recommendation: AgentHealthStatus['recommendation'] = 'none';
    let details: string | undefined;
    
    if (runningTooLong) {
      isHealthy = false;
      recommendation = 'restart';
      details = `Agent has been running for ${Math.round(runtime / 60000)} minutes (max: ${Math.round(this.config.maxAgentRuntime / 60000)})`;
    } else if (tooManyErrors) {
      isHealthy = false;
      recommendation = 'investigate';
      details = `Agent has encountered ${errorCount} errors (max: ${this.config.maxErrorCount})`;
    } else if (isStuck) {
      isHealthy = false;
      recommendation = 'restart';
      details = `No activity for ${Math.round(timeSinceActivity / 60000)} minutes`;
    }
    
    return {
      issueNumber,
      isHealthy,
      lastActivity,
      stuckDuration: isStuck ? timeSinceActivity : undefined,
      errorCount,
      recommendation,
      details
    };
  }
  
  /**
   * Get all unhealthy agents
   */
  getUnhealthyAgents(agents: Record<number, Agent>): AgentHealthStatus[] {
    const unhealthy: AgentHealthStatus[] = [];
    const now = new Date();
    
    for (const [issueNumber, agent] of Object.entries(agents)) {
      const issue = parseInt(issueNumber);
      const status = this.getAgentHealthStatus(issue, agent, now);
      
      if (!status.isHealthy) {
        unhealthy.push(status);
      }
    }
    
    return unhealthy;
  }
  
  /**
   * Get monitoring statistics
   */
  getStats(): {
    monitoredAgents: number;
    totalErrors: number;
    averageTimeSinceActivity: number;
  } {
    const activities = Array.from(this.agentActivity.values());
    const now = new Date();
    
    const timeSinceActivities = activities.map(activity => 
      now.getTime() - activity.getTime()
    );
    
    const averageTime = timeSinceActivities.length > 0
      ? timeSinceActivities.reduce((sum, time) => sum + time, 0) / timeSinceActivities.length
      : 0;
    
    const totalErrors = Array.from(this.agentErrors.values())
      .reduce((sum, count) => sum + count, 0);
    
    return {
      monitoredAgents: this.agentActivity.size,
      totalErrors,
      averageTimeSinceActivity: averageTime
    };
  }
}

/**
 * Utility to format health status for display
 */
export function formatHealthStatus(status: AgentHealthStatus): string {
  const parts = [`Agent #${status.issueNumber}`];
  
  if (!status.isHealthy) {
    parts.push('❌ Unhealthy');
    if (status.details) {
      parts.push(`- ${status.details}`);
    }
    parts.push(`- Recommendation: ${status.recommendation}`);
  } else {
    parts.push('✅ Healthy');
  }
  
  return parts.join(' ');
}

/**
 * Determine if an agent should be auto-restarted
 */
export function shouldAutoRestart(status: AgentHealthStatus): boolean {
  return status.recommendation === 'restart' && status.errorCount < 3;
}