/**
 * MongoDB Collections Initialization
 * Requirement 2: Ensure all required collections exist and are seeded
 */

import type { Db } from 'mongodb';
import { getLogger } from '@coinruler/shared';

const logger = getLogger({ svc: 'collections' });

/**
 * Required collections per specification
 */
const REQUIRED_COLLECTIONS = [
  'snapshots',        // portfolioSnapshots - balances & prices over time
  'trades',           // trade execution history
  'baselines',        // baseline holdings per asset (XRP min 10)
  'deposits',         // deposit tracking for baseline auto-increment
  'approvals',        // trade approvals waiting for owner
  'collateral',       // loan collateral tracking
  'newsSentiment',    // news sentiment analysis
  'rlMetrics',        // reinforcement learning metrics
  'config',           // system configuration
  'prices',           // high-frequency price updates
  'reports',          // daily reports
  'alerts',           // system alerts
  'rules',            // trading rules
  'kill_switch',      // emergency stop
  'objectives',       // owner objectives
  'executions',       // executed trades
  'backtests',        // backtest results
  'ruleMetrics',      // rule performance metrics
  'chatLogs',         // AI chat conversation history
];

/**
 * Initialize all required MongoDB collections
 */
export async function initializeCollections(db: Db): Promise<void> {
  try {
    const existing = await db.listCollections().toArray();
    const existingNames = new Set(existing.map(c => c.name));

    for (const collectionName of REQUIRED_COLLECTIONS) {
      if (!existingNames.has(collectionName)) {
        await db.createCollection(collectionName);
        logger.info(`Created collection: ${collectionName}`);
      }
    }

    // Create indexes for performance
    await createIndexes(db);

    // Seed initial data
    await seedInitialData(db);

    logger.info('MongoDB collections initialized successfully');
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed to initialize collections');
    throw err;
  }
}

/**
 * Create indexes for frequently queried fields
 */
async function createIndexes(db: Db): Promise<void> {
  try {
    // Snapshots: sort by timestamp desc
    await db.collection('snapshots').createIndex({ timestamp: -1 });

    // Trades: sort by timestamp, filter by symbol
    await db.collection('trades').createIndex({ timestamp: -1 });
    await db.collection('trades').createIndex({ symbol: 1, timestamp: -1 });

    // Approvals: filter by status, sort by created
    await db.collection('approvals').createIndex({ status: 1, createdAt: -1 });

    // Prices: filter by timestamp (TTL index for 24h retention)
    await db.collection('prices').createIndex({ timestamp: -1 });

    // Alerts: filter by timestamp
    await db.collection('alerts').createIndex({ ts: -1 });

    // Executions: sort by timestamp
    await db.collection('executions').createIndex({ executedAt: -1 });

    // Backtests: sort by ranAt, filter by ruleId
    await db.collection('backtests').createIndex({ ranAt: -1 });
    await db.collection('backtests').createIndex({ ruleId: 1, ranAt: -1 });

    // Chat logs: sort by timestamp
    await db.collection('chatLogs').createIndex({ timestamp: -1 });

    logger.info('Indexes created successfully');
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Failed to create some indexes (may already exist)');
  }
}

/**
 * Seed initial data if collections are empty
 */
async function seedInitialData(db: Db): Promise<void> {
  try {
    // Seed kill_switch if empty
    const killSwitchExists = await db.collection('kill_switch').countDocuments();
    if (killSwitchExists === 0) {
      await db.collection('kill_switch').insertOne({
        enabled: false,
        reason: '',
        timestamp: new Date(),
        setBy: 'system',
      });
      logger.info('Seeded kill_switch: disabled');
    }

    // Seed baselines if empty (Requirement 6: XRP baseline min 10)
    const baselinesExist = await db.collection('baselines').countDocuments();
    if (baselinesExist === 0) {
      await db.collection('baselines').insertOne({
        key: 'owner',
        value: {
          BTC: { 
            baseline: 0, 
            autoIncrementOnDeposit: true,
            description: 'Long-term gold reserve' 
          },
          XRP: { 
            baseline: 10, // Never below 10 per spec
            autoIncrementOnDeposit: true,
            minBaseline: 10,
            description: 'Minimum 10 XRP always maintained'
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      logger.info('Seeded baselines: BTC=0, XRP=10 (min enforced)');
    }

    // Seed config if empty
    const configExists = await db.collection('config').countDocuments();
    if (configExists === 0) {
      await db.collection('config').insertOne({
        key: 'system',
        value: {
          maxTradesPerHour: 10,
          maxTradesPerAssetPer3Hours: 1,
          dailyLossLimit: 500,
          minConfidenceForTrade: 0.7,
          riskTolerance: 'moderate',
          enableAutomatedTrading: false, // Requires explicit enable
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      logger.info('Seeded config with safe defaults');
    }

    // Seed objectives if empty
    const objectivesExist = await db.collection('objectives').countDocuments({ key: 'owner' });
    if (objectivesExist === 0) {
      await db.collection('objectives').insertOne({
        key: 'owner',
        value: {
          coreAssets: {
            BTC: {
              baseline: 0,
              autoIncrementOnDeposit: true,
              strategy: 'accumulate',
              description: 'Long-term store of value',
            },
            XRP: {
              baseline: 10,
              minBaseline: 10,
              autoIncrementOnDeposit: true,
              strategy: 'profit-taking',
              description: 'Active trading above baseline',
            },
            USDC: {
              strategy: 'liquidity',
              description: 'Trading capital and profits',
            },
          },
          riskProfile: {
            maxDrawdown: 0.15,
            maxPositionSize: 0.25,
            preferredTimeHorizon: 'medium-term',
          },
          goals: [
            'Protect BTC collateral',
            'Grow USDC through profit-taking',
            'Never sell XRP below baseline (10 min)',
          ],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      logger.info('Seeded owner objectives');
    }

    logger.info('Initial data seeding complete');
  } catch (err: any) {
    logger.warn({ err: err?.message }, 'Failed to seed some initial data');
  }
}

/**
 * Ensure XRP baseline is never below 10 (Requirement 6)
 */
export async function enforceXRPMinBaseline(db: Db): Promise<void> {
  try {
    const baselines = await db.collection('baselines').findOne({ key: 'owner' });
    if (baselines?.value?.XRP) {
      const xrpBaseline = baselines.value.XRP.baseline;
      if (typeof xrpBaseline === 'number' && xrpBaseline < 10) {
        logger.warn(`XRP baseline ${xrpBaseline} below minimum, correcting to 10`);
        await db.collection('baselines').updateOne(
          { key: 'owner' },
          { 
            $set: { 
              'value.XRP.baseline': 10,
              'value.XRP.minBaseline': 10,
              updatedAt: new Date(),
            } 
          }
        );
      }
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed to enforce XRP min baseline');
  }
}
