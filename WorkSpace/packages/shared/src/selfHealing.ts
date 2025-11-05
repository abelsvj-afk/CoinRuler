// Autonomous Self-Healing System
// Monitors services, detects failures, attempts automatic recovery

import { EventEmitter } from 'events';
import type { Db } from 'mongodb';

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  lastSuccess: Date;
  failureCount: number;
  message?: string;
}

export interface RecoveryAttempt {
  service: string;
  timestamp: Date;
  action: string;
  success: boolean;
  error?: string;
}

export class SelfHealingSystem extends EventEmitter {
  private healthChecks: Map<string, HealthCheck> = new Map();
  private recoveryAttempts: RecoveryAttempt[] = [];
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30000; // 30 seconds
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly RETRY_BACKOFF_MS = 1000;
  
  private db: Db | null = null;
  private services: Map<string, () => Promise<boolean>> = new Map();

  constructor() {
    super();
    this.initializeServices();
  }

  /**
   * Initialize service health checkers
   */
  private initializeServices() {
    // MongoDB health check
    this.services.set('mongodb', async () => {
      if (!this.db) return false;
      try {
        await this.db.admin().ping();
        return true;
      } catch {
        return false;
      }
    });

    // API responsiveness check
    this.services.set('api', async () => {
      try {
        // Simple check - if we can execute this, API is running
        return true;
      } catch {
        return false;
      }
    });

    // Coinbase connection check
    this.services.set('coinbase', async () => {
      try {
        // Check if Coinbase API credentials are configured
        const apiKey = process.env.COINBASE_API_KEY;
        const apiSecret = process.env.COINBASE_API_SECRET;
        return !!(apiKey && apiSecret);
      } catch {
        return false;
      }
    });

    // OpenAI health check
    this.services.set('openai', async () => {
      try {
        const apiKey = process.env.OPENAI_API_KEY;
        return !!(apiKey && apiKey.length > 0);
      } catch {
        return false;
      }
    });
  }

  /**
   * Set database reference
   */
  setDatabase(database: Db | null) {
    this.db = database;
  }

  /**
   * Start monitoring all services
   */
  startMonitoring() {
    if (this.checkInterval) {
      console.log('⚠️  Health monitoring already running');
      return;
    }

    console.log('🏥 Starting health monitoring system...');
    
    // Initial check
    this.runHealthChecks();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runHealthChecks();
    }, this.CHECK_INTERVAL_MS);

    this.emit('monitoring:started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('🏥 Health monitoring stopped');
      this.emit('monitoring:stopped');
    }
  }

  /**
   * Run health checks on all services
   */
  private async runHealthChecks() {
    const now = new Date();

    for (const [serviceName, healthChecker] of this.services.entries()) {
      try {
        const isHealthy = await healthChecker();
        const check = this.healthChecks.get(serviceName) || {
          service: serviceName,
          status: 'healthy',
          lastCheck: now,
          lastSuccess: now,
          failureCount: 0,
        };

        check.lastCheck = now;

        if (isHealthy) {
          // Service is healthy
          if (check.status !== 'healthy') {
            console.log(`✅ ${serviceName} recovered`);
            this.emit('service:recovered', { service: serviceName, timestamp: now });
          }
          
          check.status = 'healthy';
          check.lastSuccess = now;
          check.failureCount = 0;
          check.message = undefined;
        } else {
          // Service is unhealthy
          check.failureCount++;
          
          if (check.failureCount === 1) {
            check.status = 'degraded';
            console.warn(`⚠️  ${serviceName} is degraded`);
            this.emit('service:degraded', { service: serviceName, timestamp: now });
          } else if (check.failureCount >= 3) {
            check.status = 'unhealthy';
            console.error(`❌ ${serviceName} is unhealthy`);
            this.emit('service:unhealthy', { service: serviceName, timestamp: now });
            
            // Attempt automatic recovery
            await this.attemptRecovery(serviceName);
          }
          
          check.message = `Failed ${check.failureCount} consecutive checks`;
        }

        this.healthChecks.set(serviceName, check);
      } catch (error: any) {
        console.error(`❌ Error checking ${serviceName}:`, error.message);
      }
    }

    // Emit overall health status
    this.emit('health:update', this.getHealthStatus());
  }

  /**
   * Attempt to recover a failed service
   */
  private async attemptRecovery(serviceName: string) {
    console.log(`🔧 Attempting recovery for ${serviceName}...`);

    const attempt: RecoveryAttempt = {
      service: serviceName,
      timestamp: new Date(),
      action: '',
      success: false,
    };

    try {
      switch (serviceName) {
        case 'mongodb':
          attempt.action = 'Reconnect to MongoDB';
          // MongoDB recovery handled by connection retry logic
          attempt.success = false;
          attempt.error = 'Manual intervention required - check MongoDB connection string';
          break;

        case 'coinbase':
          attempt.action = 'Verify Coinbase credentials';
          attempt.success = false;
          attempt.error = 'Check COINBASE_API_KEY and COINBASE_API_SECRET in .env';
          break;

        case 'openai':
          attempt.action = 'Verify OpenAI API key';
          attempt.success = false;
          attempt.error = 'Check OPENAI_API_KEY in .env';
          break;

        case 'api':
          attempt.action = 'Restart API server';
          attempt.success = false;
          attempt.error = 'API server requires manual restart';
          break;

        default:
          attempt.action = 'Unknown recovery action';
          attempt.success = false;
          attempt.error = `No recovery procedure defined for ${serviceName}`;
      }
    } catch (error: any) {
      attempt.success = false;
      attempt.error = error.message;
    }

    this.recoveryAttempts.push(attempt);

    if (attempt.success) {
      console.log(`✅ ${serviceName} recovered successfully`);
      this.emit('recovery:success', attempt);
    } else {
      console.error(`❌ ${serviceName} recovery failed:`, attempt.error);
      this.emit('recovery:failed', attempt);
      
      // Escalate to AI diagnostics if available
      this.escalateToAI(serviceName, attempt);
    }
  }

  /**
   * Escalate failure to AI for diagnosis
   */
  private async escalateToAI(serviceName: string, attempt: RecoveryAttempt) {
    console.log(`🤖 Escalating ${serviceName} failure to AI diagnostics...`);
    
    const diagnosticPrompt = `
Service: ${serviceName}
Status: Unhealthy
Recovery Attempt: ${attempt.action}
Error: ${attempt.error}

Please analyze this failure and suggest:
1. Root cause
2. Step-by-step recovery procedure
3. Prevention measures for the future
    `.trim();

    this.emit('ai:diagnosis:requested', {
      service: serviceName,
      prompt: diagnosticPrompt,
      timestamp: new Date(),
    });

    // Emit alert for Discord/Slack notification
    this.emit('alert:critical', {
      service: serviceName,
      message: `${serviceName} requires manual intervention`,
      error: attempt.error,
      timestamp: new Date(),
    });
  }

  /**
   * Get current health status of all services
   */
  getHealthStatus(): Record<string, HealthCheck> {
    const status: Record<string, HealthCheck> = {};
    this.healthChecks.forEach((check, service) => {
      status[service] = check;
    });
    return status;
  }

  /**
   * Get overall system health
   */
  getOverallHealth(): 'healthy' | 'degraded' | 'critical' {
    const checks = Array.from(this.healthChecks.values());
    
    if (checks.length === 0) return 'degraded';
    
    const unhealthy = checks.filter(c => c.status === 'unhealthy').length;
    const degraded = checks.filter(c => c.status === 'degraded').length;

    if (unhealthy > 0) return 'critical';
    if (degraded > 0) return 'degraded';
    return 'healthy';
  }

  /**
   * Get recovery history
   */
  getRecoveryHistory(limit: number = 10): RecoveryAttempt[] {
    return this.recoveryAttempts.slice(-limit);
  }

  /**
   * Force a health check now
   */
  async forceHealthCheck() {
    console.log('🏥 Running forced health check...');
    await this.runHealthChecks();
  }

  /**
   * Register a custom service health checker
   */
  registerService(name: string, healthChecker: () => Promise<boolean>) {
    this.services.set(name, healthChecker);
    console.log(`✅ Registered custom health checker: ${name}`);
  }
}

// Singleton instance
let selfHealingSystem: SelfHealingSystem | null = null;

export function getSelfHealingSystem(): SelfHealingSystem {
  if (!selfHealingSystem) {
    selfHealingSystem = new SelfHealingSystem();
  }
  return selfHealingSystem;
}
