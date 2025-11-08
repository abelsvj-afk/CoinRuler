/**
 * Data Ingestion Scheduler
 * Requirement 1 & 5: Maintain data freshness with proper polling intervals
 * - Portfolio/balances: 5-10 minutes
 * - Prices: 30-60 seconds  
 * - Rules engine: respects throttles
 */

import type { Db } from 'mongodb';
import { getCoinbaseClient, hasCoinbaseCredentials, getLogger } from '@coinruler/shared';
import { EventEmitter } from 'events';

const logger = getLogger({ svc: 'scheduler' });

export interface SchedulerOptions {
  portfolioIntervalMs?: number; // Default: 5 minutes
  priceIntervalMs?: number; // Default: 60 seconds
  rulesIntervalMs?: number; // Default: 10 minutes
  maxRulesRunsPerCycle?: number; // Default: 10
}

export class DataScheduler {
  private db: Db;
  private events: EventEmitter;
  private options: Required<SchedulerOptions>;
  
  private portfolioTimer: NodeJS.Timeout | null = null;
  private priceTimer: NodeJS.Timeout | null = null;
  private rulesTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(db: Db, events: EventEmitter, options: SchedulerOptions = {}) {
    this.db = db;
    this.events = events;
    this.options = {
      portfolioIntervalMs: options.portfolioIntervalMs || 5 * 60 * 1000, // 5 min
      priceIntervalMs: options.priceIntervalMs || 60 * 1000, // 60 sec
      rulesIntervalMs: options.rulesIntervalMs || 10 * 60 * 1000, // 10 min
      maxRulesRunsPerCycle: options.maxRulesRunsPerCycle || 10,
    };
  }

  /**
   * Start all scheduled tasks
   */
  start() {
    if (this.running) {
      logger.warn('Scheduler already running');
      return;
    }

    this.running = true;
    logger.info('Starting data scheduler');

    // Immediate fetch on startup
    this.fetchPortfolioData();
    this.fetchPriceData();

    // Start periodic tasks
    this.portfolioTimer = setInterval(() => {
      this.fetchPortfolioData();
    }, this.options.portfolioIntervalMs);

    this.priceTimer = setInterval(() => {
      this.fetchPriceData();
    }, this.options.priceIntervalMs);

    this.rulesTimer = setInterval(() => {
      this.evaluateRules();
    }, this.options.rulesIntervalMs);

    logger.info(`Scheduler started: portfolio=${this.options.portfolioIntervalMs}ms, prices=${this.options.priceIntervalMs}ms, rules=${this.options.rulesIntervalMs}ms`);
  }

  /**
   * Stop all scheduled tasks
   */
  stop() {
    this.running = false;
    if (this.portfolioTimer) clearInterval(this.portfolioTimer);
    if (this.priceTimer) clearInterval(this.priceTimer);
    if (this.rulesTimer) clearInterval(this.rulesTimer);
    logger.info('Scheduler stopped');
  }

  /**
   * Fetch portfolio balances from Coinbase and save snapshot
   */
  private async fetchPortfolioData() {
    if (!hasCoinbaseCredentials()) {
      logger.debug('Skipping portfolio fetch: no Coinbase credentials');
      return;
    }

    try {
      const client = getCoinbaseClient();
      const balances = await client.getAllBalances();
      const prices = await client.getSpotPrices(Object.keys(balances));

      // Calculate total USD value
      let totalUSD = 0;
      for (const [currency, amount] of Object.entries(balances)) {
        totalUSD += (amount as number) * (prices[currency] || 0);
      }

      // Save snapshot to MongoDB
      const snapshot = {
        ...balances,
        _prices: prices,
        _totalUSD: totalUSD,
        timestamp: new Date(),
        reason: 'scheduled',
      };

      await this.db.collection('snapshots').insertOne(snapshot);

      // Emit event for SSE clients
      this.events.emit('portfolio:updated', {
        balances,
        prices,
        totalUSD,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Portfolio snapshot created: $${totalUSD.toFixed(2)} (${Object.keys(balances).length} assets)`);
    } catch (err: any) {
      logger.error('Failed to fetch portfolio data:', err.message);
      
      // Emit alert for monitoring
      this.events.emit('alert', {
        type: 'data_fetch_error',
        severity: 'warning',
        message: `Portfolio fetch failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Fetch latest prices and update separate prices collection
   * This runs more frequently than full portfolio snapshots
   */
  private async fetchPriceData() {
    if (!hasCoinbaseCredentials()) {
      return;
    }

    try {
      const client = getCoinbaseClient();
      
      // Get currencies from latest snapshot
      const latest = await this.db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
      if (!latest) {
        logger.debug('No snapshot found, skipping price fetch');
        return;
      }

      const currencies = Object.keys(latest).filter(k => !['_id', '_prices', '_totalUSD', 'timestamp', 'reason'].includes(k));
      const prices = await client.getSpotPrices(currencies);

      // Save to prices collection for high-frequency tracking
      await this.db.collection('prices').insertOne({
        ...prices,
        timestamp: new Date(),
      });

      // Keep only last 24h of price data
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await this.db.collection('prices').deleteMany({ timestamp: { $lt: cutoff } });

      // Emit price update event
      this.events.emit('price:update', { prices, timestamp: new Date().toISOString() });

      logger.debug(`Price update: ${Object.keys(prices).length} currencies`);
    } catch (err: any) {
      logger.error('Failed to fetch price data:', err.message);
    }
  }

  /**
   * Evaluate rules engine (with throttling)
   */
  private async evaluateRules() {
    try {
      // Import rules engine lazily to avoid circular dependencies
      const { evaluateRulesTick } = await import('@coinruler/rules');
      type EvalContext = import('@coinruler/rules').EvalContext;
      
      // Get kill switch status
      const killSwitch = await this.db.collection('kill_switch').findOne({});
      if (killSwitch?.enabled) {
        logger.debug('Skipping rules evaluation: kill switch active');
        return;
      }

      // Get latest portfolio data
      const latest = await this.db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
      if (!latest) {
        logger.debug('No portfolio snapshot, skipping rules');
        return;
      }

      const balances: Record<string, number> = {};
      const prices = (latest as any)._prices || {};
      for (const k of Object.keys(latest)) {
        if (['_id', '_prices', '_totalUSD', 'timestamp', 'reason'].includes(k)) continue;
        const qty = (latest as any)[k];
        if (typeof qty === 'number') balances[k] = qty;
      }

      // Get objectives and collateral
      const objectivesDoc = await this.db.collection('objectives').findOne({ key: 'owner' });
      const collateralDocs = await this.db.collection('collateral').find({}).toArray();
      const collateral = collateralDocs.map(doc => ({
        currency: doc.currency,
        locked: doc.locked || 0,
        ltv: doc.ltv,
        health: doc.health,
      }));

      // Build context
      const ctx: EvalContext = {
        now: new Date(),
        portfolio: { balances, prices },
        objectives: objectivesDoc?.value || {},
        lastExecutions: {}, // TODO: implement execution tracking
        collateral,
      };

      // Evaluate rules
      const intents = await evaluateRulesTick(this.db, ctx);
      
      if (intents.length > 0) {
        logger.info(`Rules engine generated ${intents.length} intents`);
        
        // Emit alert
        this.events.emit('alert', {
          type: 'rules_evaluated',
          severity: 'info',
          message: `Rules engine: ${intents.length} trade intents generated`,
          data: { intentCount: intents.length },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      logger.error('Failed to evaluate rules:', err.message);
    }
  }
}
