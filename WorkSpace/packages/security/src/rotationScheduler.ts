/**
 * Credential Rotation Scheduler
 * Automatically checks and rotates credentials on schedule
 */

import type { Db } from 'mongodb';
import {
  getRotationStatus,
  rotateAPIKey,
  isRotationDue,
  initializeRotationPolicies,
  type CredentialService,
} from './credentialRotation';

// Notification interface (to avoid circular dependency)
interface NotificationPayload {
  channel: 'discord' | 'sms' | 'email';
  body: string;
  priority?: 'low' | 'medium' | 'high';
}

// Simple notification stub - can be replaced with full notifier integration
async function notify(payload: NotificationPayload): Promise<void> {
  console.log(`[Notification] ${payload.channel}: ${payload.body}`);
  // TODO: Integrate with full notifier module from root lib/notifier.ts
}

export interface SchedulerConfig {
  checkIntervalHours: number;
  enabled: boolean;
  notifyOnRotation: boolean;
  notifyOnFailure: boolean;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  checkIntervalHours: 24, // Check daily
  enabled: true,
  notifyOnRotation: true,
  notifyOnFailure: true,
};

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Check and rotate credentials that are due
 */
async function checkAndRotate(db: Db | null, config: SchedulerConfig): Promise<void> {
  console.log('[RotationScheduler] Checking for credentials due for rotation...');

  try {
    const status = await getRotationStatus(db);

    for (const item of status) {
      if (!item.enabled || !item.isDue) {
        continue;
      }

      console.log(
        `[RotationScheduler] Rotating ${item.service} (last rotation: ${item.lastRotation?.toISOString() || 'never'})`
      );

      const result = await rotateAPIKey(db, item.service);

      if (result.success && config.notifyOnRotation) {
        await notify({
          channel: 'discord',
          body: `✅ Credential rotation successful for ${item.service}. New key ID: ${result.newKeyId}. Grace period ends: ${result.gracePeriodEnd?.toISOString()}`,
          priority: 'medium',
        });
      }

      if (!result.success && config.notifyOnFailure) {
        await notify({
          channel: 'discord',
          body: `❌ Credential rotation FAILED for ${item.service}: ${result.error}`,
          priority: 'high',
        });
      }
    }
  } catch (error: any) {
    console.error('[RotationScheduler] Error during rotation check:', error?.message || error);

    if (config.notifyOnFailure) {
      await notify({
        channel: 'discord',
        body: `❌ Credential rotation scheduler error: ${error?.message || error}`,
        priority: 'high',
      });
    }
  }
}

/**
 * Start the credential rotation scheduler
 */
export async function startRotationScheduler(
  db: Db | null,
  config: SchedulerConfig = DEFAULT_CONFIG
): Promise<void> {
  if (!config.enabled) {
    console.log('[RotationScheduler] Scheduler disabled');
    return;
  }

  if (schedulerInterval) {
    console.log('[RotationScheduler] Scheduler already running');
    return;
  }

  // Initialize rotation policies on startup
  await initializeRotationPolicies(db);

  console.log(
    `[RotationScheduler] Starting scheduler (check interval: ${config.checkIntervalHours}h)`
  );

  // Run initial check immediately
  await checkAndRotate(db, config);

  // Schedule periodic checks
  const intervalMs = config.checkIntervalHours * 60 * 60 * 1000;
  schedulerInterval = setInterval(() => {
    checkAndRotate(db, config);
  }, intervalMs);

  console.log('[RotationScheduler] Scheduler started successfully');
}

/**
 * Stop the credential rotation scheduler
 */
export function stopRotationScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[RotationScheduler] Scheduler stopped');
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): { running: boolean } {
  return { running: schedulerInterval !== null };
}

/**
 * Force rotation check (manual trigger)
 */
export async function forceRotationCheck(
  db: Db | null,
  config: SchedulerConfig = DEFAULT_CONFIG
): Promise<void> {
  console.log('[RotationScheduler] Manual rotation check triggered');
  await checkAndRotate(db, config);
}
