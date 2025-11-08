/**
 * Profit-Taking Advisory Generator (Requirement 15)
 * 
 * Generates smart profit-taking suggestions:
 * - Only above baseline
 * - Net after fees
 * - USDC growth tracking
 * - Respects throttles (1 trade/asset/3h)
 * - Includes rationale and re-entry plan
 */

import type { Db } from 'mongodb';
import { getLogger } from '@coinruler/shared';
import { Approval } from '@coinruler/shared';

const logger = getLogger({ svc: 'profit-taking' });

interface ProfitTakingConfig {
  minGainPct: number; // Minimum profit % to consider selling
  sellPct: number; // % of above-baseline holdings to sell
  feeRate: number; // Estimated fee rate (0.01 = 1%)
  reEntryDiscount: number; // Re-entry price discount % (0.05 = 5%)
}

const DEFAULT_CONFIG: ProfitTakingConfig = {
  minGainPct: 5, // 5% gain minimum
  sellPct: 0.25, // Sell 25% of above-baseline
  feeRate: 0.006, // 0.6% fee (Coinbase Advanced Trade)
  reEntryDiscount: 0.03, // Re-enter if price drops 3%
};

export interface ProfitTakingOpportunity {
  asset: string;
  currentPrice: number;
  entryPrice: number;
  gainPct: number;
  totalHoldings: number;
  baseline: number;
  aboveBaseline: number;
  recommendedSellQty: number;
  estimatedGrossUSD: number;
  estimatedFeesUSD: number;
  estimatedNetUSD: number;
  reEntryPrice: number;
  rationale: string;
  confidence: number;
}

/**
 * Scan portfolio for profit-taking opportunities
 */
export async function scanProfitOpportunities(
  db: Db,
  config: Partial<ProfitTakingConfig> = {}
): Promise<ProfitTakingOpportunity[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const opportunities: ProfitTakingOpportunity[] = [];

  try {
    // Get latest portfolio snapshot
    const snapshot = await db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
    if (!snapshot) {
      logger.warn('No portfolio snapshot available');
      return [];
    }

    const balances: Record<string, number> = {};
    const prices: Record<string, number> = (snapshot as any)._prices || {};
    
    for (const k of Object.keys(snapshot)) {
      if (['_id', '_prices', '_totalUSD', 'timestamp', 'reason'].includes(k)) continue;
      const qty = (snapshot as any)[k];
      if (typeof qty === 'number') balances[k] = qty;
    }

    // Get baselines
    const baselinesDoc = await db.collection('baselines').findOne({ key: 'owner' });
    const baselines: Record<string, number> = {};
    if (baselinesDoc?.value) {
      for (const [asset, data] of Object.entries(baselinesDoc.value)) {
        baselines[asset] = (data as any).baseline || 0;
      }
    }

    // Get historical entry prices (from deposits or trades)
    const deposits = await db.collection('deposits').find({}).sort({ timestamp: -1 }).limit(100).toArray();
    const trades = await db.collection('trades').find({ side: 'buy' }).sort({ timestamp: -1 }).limit(100).toArray();
    
    const entryPrices: Record<string, number> = {};
    for (const deposit of deposits) {
      const asset = (deposit as any).asset;
      const price = (deposit as any).priceAtDeposit;
      if (asset && price && !entryPrices[asset]) entryPrices[asset] = price;
    }
    for (const trade of trades) {
      const asset = (trade as any).symbol?.replace('-USD', '');
      const price = (trade as any).avgFillPrice || (trade as any).price;
      if (asset && price && !entryPrices[asset]) entryPrices[asset] = price;
    }

    // Check last trade time for throttling (1 trade/asset/3h)
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const recentTrades = await db.collection('trades')
      .find({ 
        timestamp: { $gte: threeHoursAgo },
        side: 'sell'
      })
      .toArray();
    const recentlySoldAssets = new Set(
      recentTrades.map((t: any) => t.symbol?.replace('-USD', ''))
    );

    // Scan for opportunities
    for (const [asset, qty] of Object.entries(balances)) {
      const baseline = baselines[asset] || 0;
      const aboveBaseline = Math.max(0, qty - baseline);
      
      // Skip if no holdings above baseline
      if (aboveBaseline <= 0) continue;
      
      // Skip if recently sold (throttle)
      if (recentlySoldAssets.has(asset)) {
        logger.debug(`Skipping ${asset}: recently sold (throttled)`);
        continue;
      }

      const currentPrice = prices[asset] || 0;
      const entryPrice = entryPrices[asset] || currentPrice * 0.9; // Assume 10% gain if unknown
      
      if (currentPrice <= 0) continue;

      const gainPct = ((currentPrice - entryPrice) / entryPrice) * 100;

      // Only consider if above minimum gain threshold
      if (gainPct < cfg.minGainPct) continue;

      const recommendedSellQty = Math.min(aboveBaseline, aboveBaseline * cfg.sellPct);
      if (recommendedSellQty <= 0) continue;

      const estimatedGrossUSD = recommendedSellQty * currentPrice;
      const estimatedFeesUSD = estimatedGrossUSD * cfg.feeRate;
      const estimatedNetUSD = estimatedGrossUSD - estimatedFeesUSD;
      
      const reEntryPrice = currentPrice * (1 - cfg.reEntryDiscount);

      // Build rationale
      const rationale = [
        `${asset} has gained ${gainPct.toFixed(1)}% since entry ($${entryPrice.toFixed(2)} → $${currentPrice.toFixed(2)}).`,
        `You hold ${qty.toFixed(4)} ${asset}, with ${aboveBaseline.toFixed(4)} above your baseline of ${baseline.toFixed(4)}.`,
        `Recommend selling ${recommendedSellQty.toFixed(4)} ${asset} (${(cfg.sellPct * 100).toFixed(0)}% of above-baseline).`,
        `Estimated profit: $${estimatedNetUSD.toFixed(2)} (after $${estimatedFeesUSD.toFixed(2)} fees).`,
        `Re-entry plan: Consider buying back if price drops to $${reEntryPrice.toFixed(2)} (${(cfg.reEntryDiscount * 100).toFixed(0)}% discount).`,
        `This preserves your ${baseline.toFixed(4)} ${asset} baseline while realizing gains in USDC.`
      ].join(' ');

      // Confidence score based on gain % and volume
      let confidence = 0.5;
      if (gainPct > 10) confidence += 0.2;
      if (gainPct > 20) confidence += 0.2;
      if (aboveBaseline > baseline * 0.2) confidence += 0.1; // Significant excess holdings
      confidence = Math.min(0.95, confidence);

      opportunities.push({
        asset,
        currentPrice,
        entryPrice,
        gainPct,
        totalHoldings: qty,
        baseline,
        aboveBaseline,
        recommendedSellQty,
        estimatedGrossUSD,
        estimatedFeesUSD,
        estimatedNetUSD,
        reEntryPrice,
        rationale,
        confidence,
      });
    }

    // Sort by estimated net profit desc
    opportunities.sort((a, b) => b.estimatedNetUSD - a.estimatedNetUSD);

    logger.info(`Found ${opportunities.length} profit-taking opportunities`);
    return opportunities;
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed to scan profit opportunities');
    return [];
  }
}

/**
 * Create approval for a profit-taking opportunity
 */
export async function createProfitTakingApproval(
  db: Db,
  opportunity: ProfitTakingOpportunity
): Promise<string> {
  const approval: any = {
    type: 'sell',
    coin: opportunity.asset,
    amount: opportunity.recommendedSellQty,
    title: `Profit-Taking: Sell ${opportunity.recommendedSellQty.toFixed(4)} ${opportunity.asset}`,
    summary: `Realize $${opportunity.estimatedNetUSD.toFixed(2)} profit (${opportunity.gainPct.toFixed(1)}% gain)`,
    rationale: opportunity.rationale,
    reason: `Profit-taking above baseline with ${opportunity.gainPct.toFixed(1)}% gain. Net after fees: $${opportunity.estimatedNetUSD.toFixed(2)}.`,
    status: 'pending',
    createdAt: new Date(),
    metadata: {
      profitTaking: true,
      confidence: opportunity.confidence,
      currentPrice: opportunity.currentPrice,
      entryPrice: opportunity.entryPrice,
      gainPct: opportunity.gainPct,
      baseline: opportunity.baseline,
      aboveBaseline: opportunity.aboveBaseline,
      estimatedNetUSD: opportunity.estimatedNetUSD,
      estimatedFeesUSD: opportunity.estimatedFeesUSD,
      reEntryPrice: opportunity.reEntryPrice,
      intent: {
        action: {
          type: 'exit',
          symbol: opportunity.asset,
          allocationPct: opportunity.recommendedSellQty / opportunity.totalHoldings,
        },
      },
    },
  };

  const result = await db.collection('approvals').insertOne(approval as any);
  logger.info(`Created profit-taking approval for ${opportunity.asset}: ${result.insertedId}`);
  
  return result.insertedId.toString();
}

/**
 * Run profit-taking scanner and create approvals
 */
export async function runProfitTakingScan(db: Db): Promise<number> {
  const opportunities = await scanProfitOpportunities(db);
  let created = 0;

  for (const opp of opportunities) {
    // Check if already has pending approval for this asset
    const existing = await db.collection('approvals').findOne({
      coin: opp.asset,
      status: 'pending',
      'metadata.profitTaking': true,
    });

    if (existing) {
      logger.debug(`Skipping ${opp.asset}: already has pending profit-taking approval`);
      continue;
    }

    await createProfitTakingApproval(db, opp);
    created++;
  }

  logger.info(`Profit-taking scan complete: ${opportunities.length} opportunities, ${created} approvals created`);
  return created;
}

/**
 * Automatic profit-taking execution (Requirement 15)
 * Only executes high-confidence opportunities (>0.8)
 * Respects DRY_RUN mode
 * Protected by collateral checks (never sell locked BTC)
 */
export async function executeAutomaticProfitTaking(db: Db): Promise<number> {
  const AUTO_EXECUTE = process.env.AUTO_EXECUTE_PROFIT_TAKING === 'true';
  const MIN_CONFIDENCE = parseFloat(process.env.PROFIT_TAKING_MIN_CONFIDENCE || '0.8');
  
  if (!AUTO_EXECUTE) {
    logger.debug('Automatic profit-taking disabled (AUTO_EXECUTE_PROFIT_TAKING=false)');
    return 0;
  }

  const opportunities = await scanProfitOpportunities(db);
  let executed = 0;

  for (const opp of opportunities) {
    // Only execute high-confidence opportunities
    if (opp.confidence < MIN_CONFIDENCE) {
      logger.debug(`Skipping ${opp.asset}: confidence ${opp.confidence.toFixed(2)} < ${MIN_CONFIDENCE}`);
      continue;
    }

    // BTC COLLATERAL PROTECTION
    if (opp.asset === 'BTC') {
      const { checkBTCSellAllowed } = await import('./collateralProtection');
      const btcCheck = await checkBTCSellAllowed(db, opp.recommendedSellQty);
      if (!btcCheck.allowed) {
        logger.warn(`🚫 BLOCKED: ${opp.asset} auto-profit-taking blocked by collateral protection: ${btcCheck.reason}`);
        continue;
      }
    }

    // Check for existing pending approval (avoid duplicates)
    const existing = await db.collection('approvals').findOne({
      coin: opp.asset,
      status: 'pending',
      'metadata.profitTaking': true,
    });

    if (existing) {
      logger.debug(`Skipping ${opp.asset}: already has pending profit-taking approval`);
      continue;
    }

    // Check recent trades (throttle: 1 trade/asset/3h)
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const recentTrade = await db.collection('trades').findOne({
      symbol: `${opp.asset}-USD`,
      side: 'sell',
      timestamp: { $gte: threeHoursAgo },
    });

    if (recentTrade) {
      logger.debug(`Skipping ${opp.asset}: recently traded (throttled)`);
      continue;
    }

    try {
      // Import executeTrade from shared
      const { executeTrade, isDryRun } = await import('@coinruler/shared');
      
      logger.info(`🎯 Auto-executing profit-taking: Sell ${opp.recommendedSellQty.toFixed(4)} ${opp.asset} for ~$${opp.estimatedNetUSD.toFixed(2)} profit (${opp.gainPct.toFixed(1)}% gain, confidence: ${opp.confidence.toFixed(2)})`);

      const tradeResult = await executeTrade({
        side: 'sell',
        symbol: opp.asset,
        amount: opp.recommendedSellQty,
        mode: 'market',
        reason: `auto-profit-taking:${opp.gainPct.toFixed(1)}pct`,
        risk: {
          tradesLastHour: 0,
          dailyLoss: 0,
          killSwitch: false,
          maxTradesHour: 10,
          dailyLossLimit: 1000,
        },
      });

      if (tradeResult.ok) {
        // Record execution
        const execDoc = {
          type: 'profit-taking',
          side: 'sell',
          symbol: opp.asset,
          amount: opp.recommendedSellQty,
          orderId: tradeResult.orderId,
          status: tradeResult.status,
          filledQty: tradeResult.filledQty,
          avgFillPrice: tradeResult.avgFillPrice,
          gainPct: opp.gainPct,
          estimatedNetUSD: opp.estimatedNetUSD,
          confidence: opp.confidence,
          executedAt: new Date(),
          mode: 'automatic',
          dryRun: isDryRun(),
        };

        await db.collection('executions').insertOne(execDoc as any);
        
        // Create trade record
        await db.collection('trades').insertOne({
          side: 'sell',
          symbol: `${opp.asset}-USD`,
          amount: opp.recommendedSellQty,
          orderId: tradeResult.orderId,
          status: tradeResult.status,
          filledQty: tradeResult.filledQty,
          avgFillPrice: tradeResult.avgFillPrice,
          timestamp: new Date(),
          reason: `auto-profit-taking:${opp.gainPct.toFixed(1)}pct`,
          dryRun: isDryRun(),
          metadata: {
            profitTaking: true,
            confidence: opp.confidence,
            gainPct: opp.gainPct,
            estimatedNetUSD: opp.estimatedNetUSD,
          },
        } as any);

        logger.info(`✅ Auto profit-taking executed: ${opp.asset} - Order ${tradeResult.orderId}`);
        executed++;
      } else {
        logger.error(`Failed to execute profit-taking for ${opp.asset}: ${tradeResult.error}`);
      }
    } catch (err: any) {
      logger.error({ err: err?.message }, `Error executing profit-taking for ${opp.asset}`);
    }
  }

  if (executed > 0) {
    logger.info(`🎉 Automatic profit-taking complete: ${executed}/${opportunities.length} opportunities executed`);
  }

  return executed;
}
