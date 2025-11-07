/**
 * Intelligent Profit-Taking System
 * 
 * Key principles:
 * 1. ALWAYS respect baselines (never sell below baseline)
 * 2. Take profits on gains regardless of market direction
 * 3. Use ML predictions and market intelligence for timing
 * 4. Adapt to user's historical behavior and preferences
 */

import { EvalContext, Action, RuleSpec } from './types';

export interface ProfitStrategy {
  coin: string;
  baseline: number; // Protected amount (never sell below this)
  currentHolding: number;
  profitableAmount: number; // Amount above baseline that can be sold
  targetProfitPct: number; // Default profit target (e.g., 10% gain)
  trailingStopPct?: number; // Optional trailing stop for peak profits
  partialSellPct?: number; // Sell only a percentage of profits (e.g., 50%)
}

export interface MarketIntelligence {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -1 to 1
  volatility: number; // Current volatility indicator
  whaleActivity: boolean; // Large trades detected
  priceChange24h: number; // Price change percentage
  volumeChange24h: number; // Volume change percentage
  correlationBTC?: number; // Correlation with BTC (for altcoins)
  mlPrediction?: {
    expectedChangePct: number;
    confidence: number;
    timeframe: string;
  };
}

/**
 * Calculate profit-taking opportunities while respecting baselines
 */
export function calculateProfitOpportunity(
  strategy: ProfitStrategy,
  currentPrice: number,
  averageBuyPrice: number,
  intelligence: MarketIntelligence
): Action | null {
  const { coin, baseline, currentHolding, targetProfitPct, partialSellPct = 50 } = strategy;
  
  // CRITICAL: Never sell below baseline
  if (currentHolding <= baseline) {
    return null; // Nothing to sell - at or below baseline
  }
  
  // Calculate profitable amount (holdings above baseline)
  const profitableAmount = currentHolding - baseline;
  
  // Calculate current gain percentage
  const gainPct = ((currentPrice - averageBuyPrice) / averageBuyPrice) * 100;
  
  // Check if we've hit profit target
  if (gainPct < targetProfitPct) {
    return null; // Not profitable enough yet
  }
  
  // Determine sell amount based on market conditions
  let sellAmount = profitableAmount * (partialSellPct / 100);
  
  // Adjust based on market intelligence
  if (intelligence.sentiment === 'bearish' && intelligence.sentimentScore < -0.5) {
    // Strong bearish signal - consider selling more
    sellAmount = profitableAmount * 0.75; // Sell 75% of profits
  } else if (intelligence.sentiment === 'bullish' && intelligence.sentimentScore > 0.7) {
    // Strong bullish signal - hold more, sell less
    sellAmount = profitableAmount * 0.25; // Sell only 25% of profits
  }
  
  // If ML predicts significant drop, sell more aggressively
  if (intelligence.mlPrediction && 
      intelligence.mlPrediction.expectedChangePct < -10 && 
      intelligence.mlPrediction.confidence > 0.7) {
    sellAmount = profitableAmount * 0.8; // Sell 80% before predicted drop
  }
  
  // If whale activity detected with bearish sentiment, exit faster
  if (intelligence.whaleActivity && intelligence.sentiment === 'bearish') {
    sellAmount = profitableAmount * 0.9; // Sell 90% on whale dump signals
  }
  
  // Calculate allocation percentage for the action
  const totalValue = Object.entries(currentHolding).reduce((acc, [c, qty]) => {
    return acc; // Simplified - would need full portfolio context
  }, 0);
  
  // Return exit action
  return {
    type: 'exit',
    symbol: coin,
    allocationPct: undefined, // Will be calculated from amount
    orderType: 'market',
  };
}

/**
 * Create intelligent profit-taking rules for BTC and XRP
 */
export function createProfitTakingRules(
  btcBaseline: number,
  xrpBaseline: number,
  profitTargetPct: number = 10
): RuleSpec[] {
  return [
    // BTC Profit Taking Rule
    {
      name: 'BTC Intelligent Profit Taking',
      enabled: true,
      trigger: { type: 'interval', every: '5m' }, // Check every 5 minutes
      conditions: [
        {
          // Trigger when BTC gains exceed target
          priceChangePct: {
            symbol: 'BTC',
            windowMins: 1440, // 24 hour window
            gt: profitTargetPct,
          }
        }
      ],
      actions: [
        {
          type: 'exit',
          symbol: 'BTC',
          allocationPct: 25, // Sell 25% of profitable amount by default
          orderType: 'market',
        }
      ],
      risk: {
        maxPositionPct: 50,
        guardrails: ['baselineProtection', 'collateralProtection'],
        cooldownSecs: 1800, // 30 minute cooldown between profit takes
      },
      meta: {
        purpose: 'profit-taking',
        strategy: 'partial-exit',
        intelligenceRequired: true,
        description: 'Takes profits on BTC when gains exceed target, respecting baseline and collateral',
      }
    },
    
    // XRP Profit Taking Rule
    {
      name: 'XRP Intelligent Profit Taking',
      enabled: true,
      trigger: { type: 'interval', every: '5m' },
      conditions: [
        {
          priceChangePct: {
            symbol: 'XRP',
            windowMins: 1440,
            gt: profitTargetPct,
          }
        }
      ],
      actions: [
        {
          type: 'exit',
          symbol: 'XRP',
          allocationPct: 25,
          orderType: 'market',
        }
      ],
      risk: {
        maxPositionPct: 50,
        guardrails: ['baselineProtection', 'minTokens'],
        cooldownSecs: 1800,
      },
      meta: {
        purpose: 'profit-taking',
        strategy: 'partial-exit',
        intelligenceRequired: true,
        description: 'Takes profits on XRP when gains exceed target, respecting baseline and minimum tokens',
      }
    },
    
    // Bearish Protection - Emergency Exit
    {
      name: 'Bear Market Protection',
      enabled: true,
      trigger: { type: 'interval', every: '15m' },
      conditions: [
        {
          priceChangePct: {
            symbol: 'BTC',
            windowMins: 60, // 1 hour window
            lt: -5, // 5% drop in 1 hour
          }
        },
        {
          indicator: 'rsi',
          symbol: 'BTC',
          lt: 30, // Oversold
        }
      ],
      actions: [
        {
          type: 'exit',
          symbol: 'BTC',
          allocationPct: 40, // Sell larger portion on sharp drops
          orderType: 'market',
        }
      ],
      risk: {
        guardrails: ['baselineProtection', 'collateralProtection'],
        cooldownSecs: 3600, // 1 hour cooldown
      },
      meta: {
        purpose: 'risk-management',
        strategy: 'bear-protection',
        description: 'Protects profits during sharp downturns while respecting baselines',
      }
    },
    
    // Bull Market Accumulation
    {
      name: 'Bull Market Momentum',
      enabled: true,
      trigger: { type: 'interval', every: '15m' },
      conditions: [
        {
          indicator: 'rsi',
          symbol: 'BTC',
          gt: 70, // Overbought
        },
        {
          priceChangePct: {
            symbol: 'BTC',
            windowMins: 1440,
            gt: 20, // Strong 24h gain
          }
        }
      ],
      actions: [
        {
          type: 'exit',
          symbol: 'BTC',
          allocationPct: 15, // Small profit take during strong rallies
          orderType: 'market',
        }
      ],
      risk: {
        guardrails: ['baselineProtection', 'collateralProtection'],
        cooldownSecs: 7200, // 2 hour cooldown - let it run
      },
      meta: {
        purpose: 'profit-taking',
        strategy: 'momentum-scalp',
        description: 'Takes small profits during strong rallies, preserving most position',
      }
    }
  ];
}

/**
 * Analyze user trading patterns for ML learning
 */
export interface UserBehaviorPattern {
  userId: string;
  avgHoldTime: number; // Average time between buy and sell (minutes)
  preferredProfitTargetPct: number; // User's typical profit target
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  tradingStyle: 'scalper' | 'swing' | 'holder';
  successRate: number; // Percentage of profitable trades
  avgGainOnWin: number; // Average profit on winning trades
  avgLossOnLoss: number; // Average loss on losing trades
  preferredTimeOfDay?: string; // When user typically approves trades
  coinPreferences: Record<string, number>; // Frequency of trading each coin
  lastUpdated: Date;
}

export function analyzeUserBehavior(
  trades: Array<{ coin: string; type: 'buy' | 'sell'; amount: number; price: number; timestamp: Date; pnl?: number }>,
  approvals: Array<{ coin: string; status: 'approved' | 'declined'; timestamp: Date }>
): UserBehaviorPattern {
  // Analyze trade history to learn patterns
  const buyTrades = trades.filter(t => t.type === 'buy');
  const sellTrades = trades.filter(t => t.type === 'sell');
  
  // Calculate average hold time
  const holdTimes: number[] = [];
  buyTrades.forEach(buy => {
    const matchingSell = sellTrades.find(s => 
      s.coin === buy.coin && s.timestamp > buy.timestamp
    );
    if (matchingSell) {
      const holdTime = matchingSell.timestamp.getTime() - buy.timestamp.getTime();
      holdTimes.push(holdTime / 60000); // Convert to minutes
    }
  });
  const avgHoldTime = holdTimes.length > 0 
    ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length 
    : 1440; // Default 24 hours
  
  // Determine trading style
  let tradingStyle: 'scalper' | 'swing' | 'holder' = 'swing';
  if (avgHoldTime < 240) tradingStyle = 'scalper'; // Less than 4 hours
  else if (avgHoldTime > 10080) tradingStyle = 'holder'; // More than 7 days
  
  // Calculate success metrics
  const profitableTrades = trades.filter(t => t.pnl && t.pnl > 0);
  const successRate = trades.length > 0 ? profitableTrades.length / trades.length : 0;
  
  const avgGainOnWin = profitableTrades.length > 0
    ? profitableTrades.reduce((acc, t) => acc + (t.pnl || 0), 0) / profitableTrades.length
    : 0;
  
  const losingTrades = trades.filter(t => t.pnl && t.pnl < 0);
  const avgLossOnLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((acc, t) => acc + (t.pnl || 0), 0) / losingTrades.length)
    : 0;
  
  // Determine risk tolerance based on approval patterns
  const approvalRate = approvals.length > 0
    ? approvals.filter(a => a.status === 'approved').length / approvals.length
    : 0.5;
  
  let riskTolerance: 'conservative' | 'moderate' | 'aggressive' = 'moderate';
  if (approvalRate < 0.3) riskTolerance = 'conservative';
  else if (approvalRate > 0.7) riskTolerance = 'aggressive';
  
  // Calculate preferred profit target
  const profitTargets = profitableTrades.map(t => {
    const matchingBuy = buyTrades.find(b => 
      b.coin === t.coin && b.timestamp < t.timestamp
    );
    if (matchingBuy) {
      return ((t.price - matchingBuy.price) / matchingBuy.price) * 100;
    }
    return 0;
  }).filter(p => p > 0);
  
  const preferredProfitTargetPct = profitTargets.length > 0
    ? profitTargets.reduce((a, b) => a + b, 0) / profitTargets.length
    : 10; // Default 10%
  
  // Coin preferences
  const coinPreferences: Record<string, number> = {};
  trades.forEach(t => {
    coinPreferences[t.coin] = (coinPreferences[t.coin] || 0) + 1;
  });
  
  return {
    userId: 'owner',
    avgHoldTime,
    preferredProfitTargetPct,
    riskTolerance,
    tradingStyle,
    successRate,
    avgGainOnWin,
    avgLossOnLoss,
    coinPreferences,
    lastUpdated: new Date(),
  };
}
