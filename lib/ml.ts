/**
 * ML module - TypeScript migration
 * Machine learning predictions and reinforcement learning training
 */
import { Db } from 'mongodb';

export interface Portfolio {
  [coin: string]: number | { [key: string]: number } | undefined;
  _prices?: { [coin: string]: number };
}

export interface MLPrediction {
  expectedValue: number;
  changePct: number;
  confidence: number;
}

export interface TrainingResult {
  status: 'ok' | 'no-db' | 'error';
  policy?: {
    sellSignals: number;
    stakeSignals: number;
    trainedAt: Date;
  };
  error?: string;
}

export interface MemoryEntry {
  type: string;
  timestamp?: Date;
  monteCarloMean?: number;
  portfolio?: Portfolio;
  [key: string]: any;
}

export interface PolicyModel {
  name: string;
  policy: {
    sellSignals: number;
    stakeSignals: number;
    trainedAt: Date;
  };
  updatedAt: Date;
}

export async function predictShortTerm(portfolio: Portfolio): Promise<MLPrediction> {
  // Simple heuristic: compute weighted USD value and return a tiny random drift
  const prices = (portfolio && portfolio._prices) || {};
  let total = 0;
  
  for (const k of Object.keys(portfolio || {})) {
    if (k === '_prices') continue;
    const amt = Number(portfolio[k]) || 0;
    const p = Number(prices[k]) || (k === 'USDC' ? 1 : 0);
    total += amt * p;
  }
  
  // Return a prediction object with expected change percentage and confidence
  const changePct = (Math.random() - 0.5) * 0.02; // +/-1%
  const confidence = 0.5 + Math.random() * 0.4;
  
  return { 
    expectedValue: total * (1 + changePct), 
    changePct, 
    confidence 
  };
}

export async function trainReinforcement(db: Db | null): Promise<TrainingResult> {
  // Naive trainer: look at memory entries and compute a simple policy summary
  if (!db) return { status: 'no-db' };
  
  try {
    const rows = await db
      .collection<MemoryEntry>('memory')
      .find({ type: 'analysis' })
      .sort({ timestamp: -1 })
      .limit(1000)
      .toArray();
    
    // Count how often analysis suggested sells vs stakes
    let sell = 0;
    let stake = 0;
    
    for (const r of rows) {
      if (r.monteCarloMean && r.monteCarloMean < 100) sell++;
      if (r.portfolio) stake += Object.keys(r.portfolio).length;
    }
    
    const policy = { 
      sellSignals: sell, 
      stakeSignals: stake, 
      trainedAt: new Date() 
    };
    
    await db
      .collection<PolicyModel>('models')
      .updateOne(
        { name: 'naive_policy' },
        { $set: { policy, updatedAt: new Date() } },
        { upsert: true }
      );
    
    return { status: 'ok', policy };
  } catch (e) {
    return { 
      status: 'error', 
      error: e instanceof Error ? e.message : String(e) 
    };
  }
}
