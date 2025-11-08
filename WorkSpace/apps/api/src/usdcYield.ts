import type { Db } from 'mongodb';

// Simple USDC yield tracker (placeholder APY) - can be replaced with real DeFi API
const DEFAULT_APY = parseFloat(process.env.USDC_APY || '0.05'); // 5% annual

export async function recordUSDCProfit(db: Db, amountUSD: number) {
  if (!db) return;
  await db.collection('usdc_yield').updateOne(
    { key: 'yield' },
    { $inc: { principal: amountUSD }, $setOnInsert: { createdAt: new Date() }, $set: { updatedAt: new Date(), apy: DEFAULT_APY } },
    { upsert: true }
  );
}

export async function computeUSDCYield(db: Db) {
  const doc = await db.collection('usdc_yield').findOne({ key: 'yield' });
  if (!doc) return { principal: 0, apy: DEFAULT_APY, accrued: 0 };
  const principal = doc.principal || 0;
  const apy = doc.apy || DEFAULT_APY;
  // Simple daily accrual approximation
  const days = (Date.now() - new Date(doc.createdAt || Date.now()).getTime()) / (24*60*60*1000);
  const accrued = principal * apy * (days / 365);
  return { principal, apy, accrued, updatedAt: new Date() };
}
