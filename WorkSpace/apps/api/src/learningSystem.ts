/**
 * Daily Learning System (Requirement 16)
 * Generates "What I learned" summaries from historical data
 */

import type { Db } from 'mongodb';
import { getLogger } from '@coinruler/shared';

const logger = getLogger({ svc: 'learning' });

export interface DailyLearning {
  date: string;
  summary: {
    portfolioChange: string;
    bestPerformer: string;
    worstPerformer: string;
    tradesExecuted: number;
    profitRealized: number;
    lessonsLearned: string[];
    recommendations: string[];
  };
  metrics: {
    totalValueUSD: number;
    change24h: number;
    volatility: number;
    sharpeRatio: number;
  };
  thresholdOptimizations: Array<{
    rule: string;
    oldThreshold: number;
    newThreshold: number;
    reason: string;
  }>;
  timestamp: Date;
}

/**
 * Generate daily learning summary
 */
export async function generateDailyLearning(db: Db): Promise<DailyLearning> {
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    // Get snapshots from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const snapshots = await db.collection('snapshots')
      .find({ timestamp: { $gte: oneDayAgo } })
      .sort({ timestamp: 1 })
      .toArray();
    
    if (snapshots.length < 2) {
      logger.info('Not enough data for daily learning');
      return createEmptyLearning(today);
    }
    
    const firstSnapshot = snapshots[0] as any;
    const lastSnapshot = snapshots[snapshots.length - 1] as any;
    
    const startValue = firstSnapshot._totalUSD || 0;
    const endValue = lastSnapshot._totalUSD || 0;
    const change24h = endValue - startValue;
    const changePct = startValue > 0 ? (change24h / startValue) * 100 : 0;
    
    // Find best/worst performers
    const performances: Array<{ asset: string; changePct: number }> = [];
    const startPrices = firstSnapshot._prices || {};
    const endPrices = lastSnapshot._prices || {};
    
    for (const asset of Object.keys(endPrices)) {
      const startPrice = startPrices[asset];
      const endPrice = endPrices[asset];
      if (startPrice && endPrice && startPrice > 0) {
        const pct = ((endPrice - startPrice) / startPrice) * 100;
        performances.push({ asset, changePct: pct });
      }
    }
    
    performances.sort((a, b) => b.changePct - a.changePct);
    const bestPerformer = performances[0] || { asset: 'N/A', changePct: 0 };
    const worstPerformer = performances[performances.length - 1] || { asset: 'N/A', changePct: 0 };
    
    // Get trades from last 24 hours
    const trades = await db.collection('trades')
      .find({ timestamp: { $gte: oneDayAgo } })
      .toArray();
    
    const profitRealized = trades
      .filter((t: any) => t.side === 'sell')
      .reduce((sum: number, t: any) => sum + ((t.profitUSD || 0)), 0);
    
    // Calculate volatility
    const returns: number[] = [];
    for (let i = 1; i < snapshots.length; i++) {
      const prev = (snapshots[i - 1] as any)._totalUSD || 0;
      const curr = (snapshots[i] as any)._totalUSD || 0;
      if (prev > 0) {
        returns.push((curr - prev) / prev);
      }
    }
    const volatility = calculateStdDev(returns) * 100;
    
    // Sharpe ratio (simplified: return / volatility)
    const sharpeRatio = volatility > 0 ? (changePct / volatility) : 0;
    
    // Generate lessons learned
    const lessonsLearned: string[] = [];
    const recommendations: string[] = [];
    
    if (changePct > 5) {
      lessonsLearned.push(`Strong day: Portfolio gained ${changePct.toFixed(2)}%. ${bestPerformer.asset} led with ${bestPerformer.changePct.toFixed(2)}% gain.`);
    } else if (changePct < -5) {
      lessonsLearned.push(`Challenging day: Portfolio down ${changePct.toFixed(2)}%. ${worstPerformer.asset} dropped ${worstPerformer.changePct.toFixed(2)}%.`);
      recommendations.push('Consider reviewing stop-loss thresholds to limit downside risk.');
    }
    
    if (trades.length === 0) {
      lessonsLearned.push('No trades executed. Waiting for favorable market conditions.');
      recommendations.push('Review approval queue for pending opportunities.');
    } else {
      lessonsLearned.push(`Executed ${trades.length} trades, realizing ${profitRealized >= 0 ? '+' : ''}$${profitRealized.toFixed(2)} profit.`);
    }
    
    if (volatility > 10) {
      lessonsLearned.push(`High volatility detected (${volatility.toFixed(2)}%). Market conditions unstable.`);
      recommendations.push('Reduce position sizes during high volatility periods.');
    }
    
    // Threshold optimizations based on performance
    const thresholdOptimizations = await optimizeThresholds(db, performances, volatility);
    
    const learning: DailyLearning = {
      date: today,
      summary: {
        portfolioChange: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}% ($${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)})`,
        bestPerformer: `${bestPerformer.asset} (+${bestPerformer.changePct.toFixed(2)}%)`,
        worstPerformer: `${worstPerformer.asset} (${worstPerformer.changePct.toFixed(2)}%)`,
        tradesExecuted: trades.length,
        profitRealized,
        lessonsLearned,
        recommendations,
      },
      metrics: {
        totalValueUSD: endValue,
        change24h,
        volatility,
        sharpeRatio,
      },
      thresholdOptimizations,
      timestamp: new Date(),
    };
    
    // Store in reports collection
    await db.collection('reports').insertOne({
      type: 'daily_learning',
      ...learning,
    });
    
    logger.info(`Daily learning generated for ${today}`);
    return learning;
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed to generate daily learning');
    return createEmptyLearning(today);
  }
}

function createEmptyLearning(date: string): DailyLearning {
  return {
    date,
    summary: {
      portfolioChange: 'N/A',
      bestPerformer: 'N/A',
      worstPerformer: 'N/A',
      tradesExecuted: 0,
      profitRealized: 0,
      lessonsLearned: ['Insufficient data for analysis'],
      recommendations: ['Ensure data ingestion is running'],
    },
    metrics: {
      totalValueUSD: 0,
      change24h: 0,
      volatility: 0,
      sharpeRatio: 0,
    },
    thresholdOptimizations: [],
    timestamp: new Date(),
  };
}

function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

async function optimizeThresholds(
  db: Db,
  performances: Array<{ asset: string; changePct: number }>,
  volatility: number
): Promise<Array<{ rule: string; oldThreshold: number; newThreshold: number; reason: string }>> {
  const optimizations: Array<{ rule: string; oldThreshold: number; newThreshold: number; reason: string }> = [];
  
  // Example: Adjust profit-taking threshold based on volatility
  if (volatility > 10) {
    optimizations.push({
      rule: 'profit_taking_threshold',
      oldThreshold: 5,
      newThreshold: 7,
      reason: `High volatility (${volatility.toFixed(1)}%) suggests waiting for larger gains before taking profits`,
    });
  } else if (volatility < 3) {
    optimizations.push({
      rule: 'profit_taking_threshold',
      oldThreshold: 5,
      newThreshold: 3,
      reason: `Low volatility (${volatility.toFixed(1)}%) allows for more frequent smaller profit-taking`,
    });
  }
  
  // Adjust based on best performer
  const bestPerformer = performances[0];
  if (bestPerformer && bestPerformer.changePct > 20) {
    optimizations.push({
      rule: `${bestPerformer.asset}_profit_target`,
      oldThreshold: 10,
      newThreshold: 15,
      reason: `${bestPerformer.asset} showing strong momentum (+${bestPerformer.changePct.toFixed(1)}%), increase profit target`,
    });
  }
  
  return optimizations;
}

/**
 * Schedule daily learning generation (run at midnight)
 */
export function scheduleDailyLearning(db: Db, eventEmitter: any): void {
  const runDailyLearning = async () => {
    try {
      const learning = await generateDailyLearning(db);
      
      // Emit alert with summary
      eventEmitter.emit('alert', {
        type: 'daily_learning',
        severity: 'info',
        message: `📊 Daily Learning: ${learning.summary.portfolioChange} change, ${learning.summary.tradesExecuted} trades, ${learning.summary.lessonsLearned.length} lessons learned`,
        data: learning,
        timestamp: new Date().toISOString(),
      });
      
      logger.info('Daily learning completed');
    } catch (err: any) {
      logger.error({ err: err?.message }, 'Daily learning scheduler error');
    }
  };
  
  // Run immediately on startup
  runDailyLearning();
  
  // Schedule for midnight every day
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    runDailyLearning();
    // Then run every 24 hours
    setInterval(runDailyLearning, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
  
  logger.info(`Daily learning scheduler started (next run in ${(msUntilMidnight / 1000 / 60).toFixed(0)} minutes)`);
}
