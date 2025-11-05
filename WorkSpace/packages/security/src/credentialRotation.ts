/**
 * Credential Rotation System
 * Automatically rotate API keys, secrets, and passwords on a schedule
 */

import type { Db } from 'mongodb';
import { getSecret, setSecret, rotateSecret } from './index';

export type CredentialService =
  | 'coinbase'
  | 'discord'
  | 'mongodb'
  | 'openai'
  | 'newsapi'
  | 'whalealert'
  | 'tradingecon'
  | 'twilio';

export interface RotationPolicy {
  service: CredentialService;
  rotationIntervalDays: number;
  gracePeriodHours: number;
  enabled: boolean;
  lastRotation?: Date;
  nextRotation?: Date;
}

export interface RotationResult {
  service: CredentialService;
  success: boolean;
  timestamp: Date;
  newKeyId?: string;
  oldKeyId?: string;
  error?: string;
  gracePeriodEnd?: Date;
}

export interface RotationAuditLog {
  service: CredentialService;
  action: 'rotate' | 'deactivate' | 'rollback';
  success: boolean;
  timestamp: Date;
  newKeyId?: string;
  oldKeyId?: string;
  error?: string;
  initiatedBy?: string;
}

// Default rotation policies
const DEFAULT_POLICIES: RotationPolicy[] = [
  {
    service: 'coinbase',
    rotationIntervalDays: 90,
    gracePeriodHours: 24,
    enabled: true,
  },
  {
    service: 'discord',
    rotationIntervalDays: 180,
    gracePeriodHours: 12,
    enabled: true,
  },
  {
    service: 'mongodb',
    rotationIntervalDays: 90,
    gracePeriodHours: 48,
    enabled: true,
  },
  {
    service: 'openai',
    rotationIntervalDays: 60,
    gracePeriodHours: 6,
    enabled: true,
  },
  {
    service: 'newsapi',
    rotationIntervalDays: 180,
    gracePeriodHours: 24,
    enabled: false,
  },
  {
    service: 'whalealert',
    rotationIntervalDays: 180,
    gracePeriodHours: 24,
    enabled: false,
  },
  {
    service: 'tradingecon',
    rotationIntervalDays: 180,
    gracePeriodHours: 24,
    enabled: false,
  },
  {
    service: 'twilio',
    rotationIntervalDays: 120,
    gracePeriodHours: 12,
    enabled: false,
  },
];

/**
 * Get rotation policy for a service
 */
export async function getRotationPolicy(
  db: Db | null,
  service: CredentialService
): Promise<RotationPolicy | null> {
  if (!db) {
    return DEFAULT_POLICIES.find((p) => p.service === service) || null;
  }

  const policy = await db
    .collection<RotationPolicy>('credential_rotation_policies')
    .findOne({ service });

  if (policy) {
    return policy;
  }

  // Return default policy if not found in DB
  return DEFAULT_POLICIES.find((p) => p.service === service) || null;
}

/**
 * Update rotation policy
 */
export async function updateRotationPolicy(
  db: Db | null,
  policy: RotationPolicy
): Promise<boolean> {
  if (!db) {
    console.log('[RotationPolicy - dryrun] update policy:', policy);
    return false;
  }

  await db
    .collection<RotationPolicy>('credential_rotation_policies')
    .updateOne(
      { service: policy.service },
      { $set: policy },
      { upsert: true }
    );

  return true;
}

/**
 * Log rotation audit entry
 */
async function logRotationAudit(
  db: Db | null,
  entry: RotationAuditLog
): Promise<void> {
  if (!db) {
    console.log('[RotationAudit - dryrun]', entry);
    return;
  }

  await db.collection<RotationAuditLog>('credential_rotation_audit').insertOne(entry);
}

/**
 * Generate new API key (service-specific implementation)
 */
async function generateNewKey(
  service: CredentialService
): Promise<{ keyId: string; secret: string }> {
  // This is a placeholder - actual implementation would call service APIs
  // to generate new keys programmatically

  const keyId = `${service}_key_${Date.now()}`;
  const secret = `${service}_secret_${Math.random().toString(36).slice(2)}`;

  console.log(`[GenerateKey - placeholder] ${service}: ${keyId}`);

  // TODO: Implement actual key generation for each service:
  // - Coinbase: Use Coinbase API to create new API key
  // - Discord: Generate new bot token via Discord Developer Portal API
  // - MongoDB: Create new database user with rotated password
  // - OpenAI: Generate new API key via OpenAI API
  // - etc.

  return { keyId, secret };
}

/**
 * Deactivate old API key after grace period
 */
async function deactivateOldKey(
  service: CredentialService,
  keyId: string
): Promise<boolean> {
  console.log(`[DeactivateKey - placeholder] ${service}: ${keyId}`);

  // TODO: Implement actual key deactivation for each service:
  // - Coinbase: Revoke API key via Coinbase API
  // - Discord: Regenerate bot token (invalidates old one)
  // - MongoDB: Delete or disable database user
  // - OpenAI: Revoke API key via OpenAI API
  // - etc.

  return true;
}

/**
 * Rotate API key for a service
 */
export async function rotateAPIKey(
  db: Db | null,
  service: CredentialService
): Promise<RotationResult> {
  const result: RotationResult = {
    service,
    success: false,
    timestamp: new Date(),
  };

  try {
    // Get current policy
    const policy = await getRotationPolicy(db, service);
    if (!policy || !policy.enabled) {
      result.error = `Rotation disabled for ${service}`;
      await logRotationAudit(db, {
        service,
        action: 'rotate',
        success: false,
        timestamp: new Date(),
        error: result.error,
      });
      return result;
    }

    // Get current key from vault
    const oldSecret = await getSecret(`${service}_api_key`);
    const oldKeyId = oldSecret || 'unknown';

    // Generate new key
    const { keyId: newKeyId, secret: newSecret } = await generateNewKey(service);

    // Store new key in vault
    await setSecret(`${service}_api_key`, newSecret);

    // Store old key with _old suffix during grace period
    await setSecret(`${service}_api_key_old`, oldSecret || '');

    // Calculate grace period end
    const gracePeriodEnd = new Date();
    gracePeriodEnd.setHours(
      gracePeriodEnd.getHours() + policy.gracePeriodHours
    );

    // Update rotation timestamp in policy
    const nextRotation = new Date();
    nextRotation.setDate(nextRotation.getDate() + policy.rotationIntervalDays);

    await updateRotationPolicy(db, {
      ...policy,
      lastRotation: new Date(),
      nextRotation,
    });

    result.success = true;
    result.newKeyId = newKeyId;
    result.oldKeyId = oldKeyId;
    result.gracePeriodEnd = gracePeriodEnd;

    await logRotationAudit(db, {
      service,
      action: 'rotate',
      success: true,
      timestamp: new Date(),
      newKeyId,
      oldKeyId,
    });

    console.log(
      `[CredentialRotation] ${service}: Rotated successfully. Old key will be deactivated at ${gracePeriodEnd.toISOString()}`
    );

    // Schedule old key deactivation after grace period
    setTimeout(
      async () => {
        const deactivated = await deactivateOldKey(service, oldKeyId);
        await logRotationAudit(db, {
          service,
          action: 'deactivate',
          success: deactivated,
          timestamp: new Date(),
          oldKeyId,
        });

        // Remove old key from vault
        await rotateSecret(`${service}_api_key_old`);
      },
      policy.gracePeriodHours * 60 * 60 * 1000
    );

    return result;
  } catch (error: any) {
    result.error = error?.message || String(error);
    await logRotationAudit(db, {
      service,
      action: 'rotate',
      success: false,
      timestamp: new Date(),
      error: result.error,
    });
    console.error(`[CredentialRotation] ${service} failed:`, result.error);
    return result;
  }
}

/**
 * Rotate all enabled credentials
 */
export async function rotateAllCredentials(
  db: Db | null
): Promise<RotationResult[]> {
  const results: RotationResult[] = [];

  for (const policy of DEFAULT_POLICIES) {
    const currentPolicy = await getRotationPolicy(db, policy.service);
    if (!currentPolicy || !currentPolicy.enabled) {
      continue;
    }

    const result = await rotateAPIKey(db, policy.service);
    results.push(result);
  }

  return results;
}

/**
 * Check if rotation is due for a service
 */
export async function isRotationDue(
  db: Db | null,
  service: CredentialService
): Promise<boolean> {
  const policy = await getRotationPolicy(db, service);
  if (!policy || !policy.enabled || !policy.lastRotation) {
    return false;
  }

  const daysSinceRotation =
    (Date.now() - policy.lastRotation.getTime()) / (1000 * 60 * 60 * 24);

  return daysSinceRotation >= policy.rotationIntervalDays;
}

/**
 * Get rotation status for all services
 */
export async function getRotationStatus(
  db: Db | null
): Promise<
  Array<{
    service: CredentialService;
    enabled: boolean;
    lastRotation?: Date;
    nextRotation?: Date;
    isDue: boolean;
  }>
> {
  const status = [];

  for (const policy of DEFAULT_POLICIES) {
    const currentPolicy = await getRotationPolicy(db, policy.service);
    if (!currentPolicy) continue;

    const isDue = await isRotationDue(db, policy.service);

    status.push({
      service: policy.service,
      enabled: currentPolicy.enabled,
      lastRotation: currentPolicy.lastRotation,
      nextRotation: currentPolicy.nextRotation,
      isDue,
    });
  }

  return status;
}

/**
 * Initialize rotation policies in database
 */
export async function initializeRotationPolicies(db: Db | null): Promise<void> {
  if (!db) {
    console.log('[RotationPolicies - dryrun] Initialize policies');
    return;
  }

  for (const policy of DEFAULT_POLICIES) {
    const existing = await db
      .collection<RotationPolicy>('credential_rotation_policies')
      .findOne({ service: policy.service });

    if (!existing) {
      await db
        .collection<RotationPolicy>('credential_rotation_policies')
        .insertOne(policy);
    }
  }

  console.log('[RotationPolicies] Initialized default policies');
}
