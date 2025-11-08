import { Db } from 'mongodb';
import crypto from 'crypto';

/**
 * MFA (Multi-Factor Authentication) for Large Trades
 * Requirement 16: MFA for trades > $100
 */

export interface MFACode {
  code: string;
  tradeId: string;
  userId: string;
  expiresAt: Date;
  verified: boolean;
  tradeDetails: {
    type: 'buy' | 'sell';
    asset: string;
    quantity: number;
    estimatedValueUSD: number;
  };
}

// MFA threshold from env (default $100)
const MFA_THRESHOLD_USD = parseFloat(process.env.MFA_THRESHOLD_USD || '100');

// Code expiry (default 5 minutes)
const CODE_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Generate 6-digit OTP code
 */
function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Check if trade requires MFA
 */
export function requiresMFA(estimatedValueUSD: number): boolean {
  return estimatedValueUSD > MFA_THRESHOLD_USD;
}

/**
 * Request MFA code for a trade
 */
export async function requestMFA(
  db: Db,
  tradeDetails: {
    tradeId: string;
    userId: string;
    type: 'buy' | 'sell';
    asset: string;
    quantity: number;
    estimatedValueUSD: number;
  }
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateOTP();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

  const mfaCode: MFACode = {
    code,
    tradeId: tradeDetails.tradeId,
    userId: tradeDetails.userId,
    expiresAt,
    verified: false,
    tradeDetails: {
      type: tradeDetails.type,
      asset: tradeDetails.asset,
      quantity: tradeDetails.quantity,
      estimatedValueUSD: tradeDetails.estimatedValueUSD,
    },
  };

  await db.collection('mfaCodes').insertOne({
    ...mfaCode,
    createdAt: new Date(),
  });

  console.log(
    `[MFA] Code generated for ${tradeDetails.type} ${tradeDetails.quantity} ${tradeDetails.asset} (~$${tradeDetails.estimatedValueUSD.toFixed(2)}): ${code}`
  );

  // TODO: Send via email/SMS
  // For now, just log it (user can see in terminal)
  console.log(`[MFA] ⚠️ VERIFICATION CODE: ${code} (expires in 5 minutes)`);

  return { code, expiresAt };
}

/**
 * Verify MFA code
 */
export async function verifyMFA(
  db: Db,
  tradeId: string,
  code: string
): Promise<{ valid: boolean; reason?: string }> {
  const mfaRecord = await db
    .collection('mfaCodes')
    .findOne({ tradeId, code });

  if (!mfaRecord) {
    return { valid: false, reason: 'Invalid MFA code' };
  }

  if (mfaRecord.verified) {
    return { valid: false, reason: 'Code already used' };
  }

  if (new Date() > new Date(mfaRecord.expiresAt)) {
    return { valid: false, reason: 'Code expired. Request a new one.' };
  }

  // Mark as verified
  await db
    .collection('mfaCodes')
    .updateOne({ tradeId, code }, { $set: { verified: true, verifiedAt: new Date() } });

  console.log(`[MFA] ✅ Code verified for trade ${tradeId}`);

  return { valid: true };
}

/**
 * Cleanup expired MFA codes (run periodically)
 */
export async function cleanupExpiredMFA(db: Db): Promise<number> {
  const result = await db
    .collection('mfaCodes')
    .deleteMany({ expiresAt: { $lt: new Date() } });

  if (result.deletedCount > 0) {
    console.log(`[MFA] Cleaned up ${result.deletedCount} expired codes`);
  }

  return result.deletedCount;
}

/**
 * Get pending MFA requests for user
 */
export async function getPendingMFA(
  db: Db,
  userId: string
): Promise<MFACode[]> {
  return db
    .collection('mfaCodes')
    .find({
      userId,
      verified: false,
      expiresAt: { $gt: new Date() },
    })
    .sort({ createdAt: -1 })
    .toArray() as any;
}
