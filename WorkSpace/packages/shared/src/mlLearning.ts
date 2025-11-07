/**
 * Machine Learning & AI Behavior Learning System
 * 
 * This system learns from user's trading decisions and adapts recommendations:
 * - Tracks approval/decline patterns
 * - Learns preferred profit targets and risk tolerance
 * - Adapts rule parameters based on successful patterns
 * - Predicts optimal entry/exit points based on historical success
 */

export interface TradeDecision {
  _id?: string;
  timestamp: Date;
  coin: string;
  type: 'buy' | 'sell';
  proposedAmount: number;
  proposedPrice: number;
  userDecision: 'approved' | 'declined' | 'pending';
  ruleId?: string;
  marketConditions: {
    sentiment: string;
    rsi?: number;
    priceChange24h: number;
    volatility: number;
  };
  outcome?: {
    executed: boolean;
    executionPrice?: number;
    pnl?: number;
    pnlPct?: number;
    executedAt?: Date;
  };
}

export interface LearningPattern {
  pattern: string;
  frequency: number;
  successRate: number;
  avgProfit: number;
  conditions: any;
  lastSeen: Date;
}

export interface UserPreferences {
  userId: string;
  
  // Timing preferences
  preferredTradingHours: number[]; // Hours of day user typically approves (0-23)
  avgResponseTimeMinutes: number; // How long user takes to respond
  
  // Risk preferences
  maxTradeSize: number; // Largest trade user has approved
  minTradeSize: number; // Smallest trade user has approved
  riskScore: number; // 0-100, calculated from approval patterns
  
  // Profit preferences
  minAcceptableProfitPct: number; // Minimum profit target user approves
  maxAcceptableLossPct: number; // Maximum loss user tolerates
  
  // Market condition preferences
  preferredSentiment: 'bullish' | 'bearish' | 'neutral' | 'any';
  volatilityTolerance: 'low' | 'medium' | 'high';
  
  // Coin preferences
  coinAllocation: Record<string, number>; // Preferred % allocation per coin
  favoriteCoin: string;
  
  // Learning metadata
  totalDecisions: number;
  approvalRate: number;
  lastUpdated: Date;
  confidenceScore: number; // How confident we are in these preferences (0-1)
}

/**
 * Analyze a batch of trading decisions to extract learning patterns
 */
export function extractLearningPatterns(decisions: TradeDecision[]): LearningPattern[] {
  const patterns: Map<string, LearningPattern> = new Map();
  
  // Group decisions by similar market conditions
  decisions.forEach(decision => {
    const { marketConditions, userDecision, outcome } = decision;
    
    // Create pattern key based on conditions
    const sentimentKey = marketConditions.sentiment;
    const volatilityKey = marketConditions.volatility > 5 ? 'high' : marketConditions.volatility > 2 ? 'medium' : 'low';
    const trendKey = marketConditions.priceChange24h > 5 ? 'uptrend' : marketConditions.priceChange24h < -5 ? 'downtrend' : 'sideways';
    
    const patternKey = `${decision.coin}_${decision.type}_${sentimentKey}_${volatilityKey}_${trendKey}`;
    
    if (!patterns.has(patternKey)) {
      patterns.set(patternKey, {
        pattern: patternKey,
        frequency: 0,
        successRate: 0,
        avgProfit: 0,
        conditions: {
          coin: decision.coin,
          type: decision.type,
          sentiment: sentimentKey,
          volatility: volatilityKey,
          trend: trendKey,
        },
        lastSeen: decision.timestamp,
      });
    }
    
    const pattern = patterns.get(patternKey)!;
    pattern.frequency++;
    pattern.lastSeen = decision.timestamp > pattern.lastSeen ? decision.timestamp : pattern.lastSeen;
    
    // Update success rate and profit if outcome is available
    if (outcome && outcome.executed) {
      const success = (outcome.pnl || 0) > 0 ? 1 : 0;
      pattern.successRate = (pattern.successRate * (pattern.frequency - 1) + success) / pattern.frequency;
      pattern.avgProfit = (pattern.avgProfit * (pattern.frequency - 1) + (outcome.pnl || 0)) / pattern.frequency;
    }
  });
  
  return Array.from(patterns.values())
    .sort((a, b) => b.frequency - a.frequency) // Most frequent patterns first
    .slice(0, 50); // Keep top 50 patterns
}

/**
 * Calculate user preferences from decision history
 */
export function calculateUserPreferences(decisions: TradeDecision[]): UserPreferences {
  if (decisions.length === 0) {
    return getDefaultPreferences();
  }
  
  const approved = decisions.filter(d => d.userDecision === 'approved');
  const declined = decisions.filter(d => d.userDecision === 'declined');
  const approvalRate = approved.length / decisions.length;
  
  // Extract timing preferences
  const approvalHours = approved.map(d => new Date(d.timestamp).getHours());
  const hourFrequency: Record<number, number> = {};
  approvalHours.forEach(h => hourFrequency[h] = (hourFrequency[h] || 0) + 1);
  const preferredTradingHours = Object.entries(hourFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([hour]) => parseInt(hour));
  
  // Calculate trade size preferences
  const tradeSizes = approved.map(d => d.proposedAmount);
  const maxTradeSize = Math.max(...tradeSizes, 0);
  const minTradeSize = Math.min(...tradeSizes.filter(s => s > 0), 100);
  
  // Calculate profit preferences from outcomes
  const profitableTrades = approved.filter(d => d.outcome && (d.outcome.pnl || 0) > 0);
  const profitPcts = profitableTrades
    .map(d => d.outcome?.pnlPct || 0)
    .filter(p => p > 0);
  const minAcceptableProfitPct = profitPcts.length > 0
    ? Math.min(...profitPcts) * 0.8 // 80% of minimum successful profit
    : 5; // Default 5%
  
  const losingTrades = approved.filter(d => d.outcome && (d.outcome.pnl || 0) < 0);
  const lossPcts = losingTrades
    .map(d => Math.abs(d.outcome?.pnlPct || 0))
    .filter(p => p > 0);
  const maxAcceptableLossPct = lossPcts.length > 0
    ? Math.max(...lossPcts) * 1.2 // 20% buffer on max tolerated loss
    : 10; // Default 10%
  
  // Calculate risk score (0-100)
  const riskScore = Math.min(100, Math.max(0, 
    approvalRate * 50 + // Higher approval rate = higher risk tolerance
    (maxTradeSize / 1000) * 25 + // Larger trades = higher risk tolerance
    (profitableTrades.length / approved.length) * 25 // Success rate factor
  ));
  
  // Market condition preferences
  const sentimentCounts: Record<string, number> = {};
  approved.forEach(d => {
    const sentiment = d.marketConditions.sentiment;
    sentimentCounts[sentiment] = (sentimentCounts[sentiment] || 0) + 1;
  });
  const preferredSentiment = Object.entries(sentimentCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] as any || 'any';
  
  const avgVolatility = approved.reduce((sum, d) => sum + d.marketConditions.volatility, 0) / approved.length;
  const volatilityTolerance: 'low' | 'medium' | 'high' = 
    avgVolatility < 2 ? 'low' : avgVolatility < 5 ? 'medium' : 'high';
  
  // Coin allocation preferences
  const coinCounts: Record<string, number> = {};
  approved.forEach(d => coinCounts[d.coin] = (coinCounts[d.coin] || 0) + 1);
  const totalCoins = Object.values(coinCounts).reduce((a, b) => a + b, 0);
  const coinAllocation: Record<string, number> = {};
  Object.entries(coinCounts).forEach(([coin, count]) => {
    coinAllocation[coin] = (count / totalCoins) * 100;
  });
  const favoriteCoin = Object.entries(coinCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'BTC';
  
  // Confidence score based on sample size
  const confidenceScore = Math.min(1, decisions.length / 100); // Full confidence at 100+ decisions
  
  return {
    userId: 'owner',
    preferredTradingHours,
    avgResponseTimeMinutes: 30, // Default assumption
    maxTradeSize,
    minTradeSize,
    riskScore,
    minAcceptableProfitPct,
    maxAcceptableLossPct,
    preferredSentiment,
    volatilityTolerance,
    coinAllocation,
    favoriteCoin,
    totalDecisions: decisions.length,
    approvalRate,
    lastUpdated: new Date(),
    confidenceScore,
  };
}

function getDefaultPreferences(): UserPreferences {
  return {
    userId: 'owner',
    preferredTradingHours: [9, 10, 11, 14, 15, 16], // Business hours
    avgResponseTimeMinutes: 30,
    maxTradeSize: 1000,
    minTradeSize: 100,
    riskScore: 50, // Moderate
    minAcceptableProfitPct: 5,
    maxAcceptableLossPct: 10,
    preferredSentiment: 'any',
    volatilityTolerance: 'medium',
    coinAllocation: { BTC: 60, XRP: 40 },
    favoriteCoin: 'BTC',
    totalDecisions: 0,
    approvalRate: 0.5,
    lastUpdated: new Date(),
    confidenceScore: 0,
  };
}

/**
 * Predict whether user would approve a proposed trade
 */
export function predictUserApproval(
  proposal: {
    coin: string;
    type: 'buy' | 'sell';
    amount: number;
    price: number;
    profitPct?: number;
    marketConditions: any;
  },
  userPrefs: UserPreferences,
  patterns: LearningPattern[]
): { willApprove: boolean; confidence: number; reason: string } {
  let approvalScore = 0;
  let confidenceFactors: string[] = [];
  
  // Check trade size preference
  if (proposal.amount >= userPrefs.minTradeSize && proposal.amount <= userPrefs.maxTradeSize) {
    approvalScore += 20;
    confidenceFactors.push('trade size in preferred range');
  } else if (proposal.amount > userPrefs.maxTradeSize) {
    approvalScore -= 30;
    confidenceFactors.push('trade size exceeds user comfort');
  }
  
  // Check profit target (for sells)
  if (proposal.type === 'sell' && proposal.profitPct !== undefined) {
    if (proposal.profitPct >= userPrefs.minAcceptableProfitPct) {
      approvalScore += 25;
      confidenceFactors.push(`profit ${proposal.profitPct.toFixed(1)}% meets target`);
    } else {
      approvalScore -= 20;
      confidenceFactors.push('profit below acceptable target');
    }
  }
  
  // Check market sentiment preference
  const sentiment = proposal.marketConditions.sentiment;
  if (userPrefs.preferredSentiment === 'any' || sentiment === userPrefs.preferredSentiment) {
    approvalScore += 15;
    confidenceFactors.push('market sentiment matches preference');
  }
  
  // Check coin preference
  const coinAllocation = userPrefs.coinAllocation[proposal.coin] || 0;
  if (coinAllocation > 30) {
    approvalScore += 10;
    confidenceFactors.push(`${proposal.coin} is preferred coin`);
  }
  
  // Check against learned patterns
  const matchingPatterns = patterns.filter(p => 
    p.conditions.coin === proposal.coin &&
    p.conditions.type === proposal.type
  );
  
  if (matchingPatterns.length > 0) {
    const avgSuccessRate = matchingPatterns.reduce((sum, p) => sum + p.successRate, 0) / matchingPatterns.length;
    if (avgSuccessRate > 0.6) {
      approvalScore += 30;
      confidenceFactors.push(`historical success rate: ${(avgSuccessRate * 100).toFixed(0)}%`);
    } else if (avgSuccessRate < 0.4) {
      approvalScore -= 20;
      confidenceFactors.push('historically unsuccessful pattern');
    }
  }
  
  // Convert score to probability
  const probability = Math.max(0, Math.min(1, (approvalScore + 50) / 100));
  const willApprove = probability > 0.6;
  
  // Calculate confidence based on data quality
  const confidence = userPrefs.confidenceScore * 0.7 + (matchingPatterns.length > 0 ? 0.3 : 0);
  
  const reason = confidenceFactors.join('; ');
  
  return {
    willApprove,
    confidence: Math.round(confidence * 100) / 100,
    reason: reason || 'No strong indicators',
  };
}

/**
 * Recommend optimal profit target based on learned patterns
 */
export function recommendProfitTarget(
  coin: string,
  currentGainPct: number,
  userPrefs: UserPreferences,
  patterns: LearningPattern[]
): { targetPct: number; confidence: number; reasoning: string } {
  // Find successful patterns for this coin
  const successfulSells = patterns.filter(p => 
    p.conditions.coin === coin &&
    p.conditions.type === 'sell' &&
    p.successRate > 0.6 &&
    p.avgProfit > 0
  );
  
  if (successfulSells.length === 0) {
    // No pattern data, use user's minimum acceptable profit
    return {
      targetPct: userPrefs.minAcceptableProfitPct,
      confidence: 0.3,
      reasoning: 'Based on default profit target (no historical pattern data)',
    };
  }
  
  // Calculate weighted average of successful profit targets
  const totalFrequency = successfulSells.reduce((sum, p) => sum + p.frequency, 0);
  const weightedTarget = successfulSells.reduce((sum, p) => {
    const weight = p.frequency / totalFrequency;
    return sum + (p.avgProfit * weight);
  }, 0);
  
  // Adjust based on current gain
  let recommendedTarget = Math.max(
    userPrefs.minAcceptableProfitPct,
    Math.min(weightedTarget * 0.8, currentGainPct * 0.7) // Take 70% of current gain or 80% of historical average
  );
  
  // Risk-adjusted: if user is conservative, lower the target
  if (userPrefs.riskScore < 40) {
    recommendedTarget *= 0.9; // Take profits earlier
  } else if (userPrefs.riskScore > 70) {
    recommendedTarget *= 1.1; // Let profits run longer
  }
  
  const confidence = Math.min(0.9, successfulSells.length / 10); // Higher confidence with more data
  
  return {
    targetPct: Math.round(recommendedTarget * 100) / 100,
    confidence,
    reasoning: `Based on ${successfulSells.length} successful ${coin} sells (avg profit: ${weightedTarget.toFixed(1)}%), adjusted for ${userPrefs.riskScore > 60 ? 'aggressive' : userPrefs.riskScore < 40 ? 'conservative' : 'moderate'} risk profile`,
  };
}
