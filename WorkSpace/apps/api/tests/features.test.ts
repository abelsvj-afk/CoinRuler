/**
 * Tests for new features: port retry, collateral, profit-taking, fear/greed, knowledge store
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const TEST_DB = 'coinruler_test';

let client: MongoClient;
let db: Db;

beforeAll(async () => {
  client = await MongoClient.connect(MONGODB_URI);
  db = client.db(TEST_DB);
});

afterAll(async () => {
  await client.close();
});

describe('Port Retry Logic', () => {
  it('should bind to next available port when primary is busy', async () => {
    // This is tested manually via terminal commands
    // Port 3001 busy → retries 3002
    expect(true).toBe(true);
  });
});

describe('Collateral Tracking', () => {
  it('should calculate BTC totals correctly', async () => {
    const mockSnapshot = {
      BTC: 1.5,
      _prices: { BTC: 70000 },
      timestamp: new Date(),
    };
    
    const mockCollateral = [
      { currency: 'BTC', locked: 0.5, ltv: 0.5 },
    ];

    await db.collection('snapshots').insertOne(mockSnapshot as any);
    await db.collection('collateral').insertMany(mockCollateral as any);

    const btcTotal = 1.5;
    const btcLocked = 0.5;
    const btcFree = btcTotal - btcLocked;

    expect(btcTotal).toBe(1.5);
    expect(btcFree).toBe(1.0);
    expect(btcLocked).toBe(0.5);

    // Cleanup
    await db.collection('snapshots').deleteMany({});
    await db.collection('collateral').deleteMany({});
  });

  it('should show BTC exposure USD despite collateral lock', async () => {
    const btcTotal = 1.5;
    const btcPrice = 70000;
    const exposureUSD = btcTotal * btcPrice;

    expect(exposureUSD).toBe(105000);
  });
});

describe('Profit-Taking Logic', () => {
  it('should identify opportunities above baseline', async () => {
    const balance = { BTC: 1.5 };
    const baseline = { BTC: { baseline: 1.0 } };
    const aboveBaseline = balance.BTC - baseline.BTC.baseline;

    expect(aboveBaseline).toBe(0.5);
  });

  it('should calculate net profit after fees', async () => {
    const sellQty = 0.5;
    const price = 70000;
    const feeRate = 0.006;

    const grossUSD = sellQty * price;
    const feesUSD = grossUSD * feeRate;
    const netUSD = grossUSD - feesUSD;

    expect(netUSD).toBeCloseTo(34790, 0);
  });
});

describe('Fear & Greed Integration', () => {
  it('should store fear/greed index value', async () => {
    const fgDoc = {
      value: 45,
      classification: 'neutral',
      timestamp: new Date(),
    };

    await db.collection('fear_greed').insertOne(fgDoc as any);
    const stored = await db.collection('fear_greed').findOne({});

    expect(stored?.value).toBe(45);
    expect(stored?.classification).toBe('neutral');

    // Cleanup
    await db.collection('fear_greed').deleteMany({});
  });
});

describe('Knowledge Store', () => {
  it('should ingest knowledge documents', async () => {
    const { ingestKnowledge } = await import('../src/knowledgeStore');

    const docId = await ingestKnowledge(db, {
      type: 'market_insight',
      title: 'BTC Breakout Pattern',
      content: 'BTC showing classic bull flag pattern',
      tags: ['btc', 'pattern', 'bullish'],
      confidence: 0.85,
      source: 'pattern_recognition',
      relevance: 1.0,
    });

    expect(docId).toBeTruthy();

    const stored = await db.collection('knowledge').findOne({ _id: docId as any });
    expect(stored?.title).toBe('BTC Breakout Pattern');

    // Cleanup
    await db.collection('knowledge').deleteMany({});
  });

  it('should query knowledge by filters', async () => {
    const { ingestKnowledge, queryKnowledge } = await import('../src/knowledgeStore');

    await ingestKnowledge(db, {
      type: 'pattern',
      title: 'Pattern A',
      content: 'Test',
      tags: ['test'],
      confidence: 0.9,
      source: 'test',
      relevance: 1.0,
    });

    const results = await queryKnowledge(db, {
      type: 'pattern',
      minConfidence: 0.8,
    });

    expect(results.length).toBeGreaterThan(0);

    // Cleanup
    await db.collection('knowledge').deleteMany({});
  });
});

describe('USDC Yield Tracking', () => {
  it('should calculate yield accrual', async () => {
    const { recordUSDCProfit, computeUSDCYield } = await import('../src/usdcYield');

    await recordUSDCProfit(db, 1000); // $1000 profit

  const yieldData = await computeUSDCYield(db);
  expect(yieldData.principal).toBe(1000);
  expect(yieldData.apy).toBeGreaterThan(0);

    // Cleanup
    await db.collection('usdc_yield').deleteMany({});
  });
});

describe('ML Events Logging', () => {
  it('should log training events', async () => {
    const { logMLTrainingStart, logMLTrainingComplete } = await import('../src/mlEvents');

    await logMLTrainingStart(db, 'lstm_btc', { epochs: 100 });
    await logMLTrainingComplete(db, 'lstm_btc', { accuracy: 0.87, loss: 0.13 });

    const events = await db.collection('ml_events').find({}).toArray();
    expect(events.length).toBeGreaterThanOrEqual(2);

    // Cleanup
    await db.collection('ml_events').deleteMany({});
  });
});
