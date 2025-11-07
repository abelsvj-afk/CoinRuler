/**
 * Real-Time Market Intelligence Aggregator
 * 
 * Combines multiple data sources for comprehensive market analysis:
 * - Whale tracking (large trades that move markets)
 * - News sentiment analysis
 * - Social media sentiment
 * - On-chain metrics
 * - Technical indicators
 * - Correlation analysis
 */

import axios from 'axios';

export interface WhaleAlert {
  timestamp: Date;
  symbol: string;
  amount: number;
  amountUSD: number;
  type: 'transfer' | 'exchange_inflow' | 'exchange_outflow';
  from: string;
  to: string;
  blockchain: string;
  transactionHash: string;
}

export interface NewsArticle {
  timestamp: Date;
  title: string;
  url: string;
  source: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -1 to 1
  coins: string[];
}

export interface MarketIntelligence {
  timestamp: Date;
  coin: string;
  
  // Price data
  currentPrice: number;
  priceChange24h: number;
  volumeChange24h: number;
  
  // Technical indicators
  rsi?: number;
  volatility: number;
  trend: 'uptrend' | 'downtrend' | 'sideways';
  
  // Sentiment
  overallSentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentScore: number; // -1 to 1
  newsCount24h: number;
  
  // Whale activity
  whaleActivity: boolean;
  whaleAlerts24h: number;
  largeFlowsNetUSD: number; // Net inflow/outflow to exchanges
  
  // Advanced metrics
  fearGreedIndex?: number; // 0-100
  correlationWithBTC?: number; // -1 to 1
  onChainActivity?: {
    activeAddresses: number;
    transactionVolume: number;
    exchangeNetflow: number; // Positive = accumulation, Negative = distribution
  };
  
  // AI predictions
  mlPrediction?: {
    expectedChangePct: number;
    confidence: number;
    timeframe: string;
    signals: string[];
  };
}

/**
 * Aggregate market intelligence from multiple sources
 */
export async function gatherMarketIntelligence(
  coin: string,
  priceData: { currentPrice: number; priceChange24h: number; volumeChange24h: number }
): Promise<MarketIntelligence> {
  const intelligence: MarketIntelligence = {
    timestamp: new Date(),
    coin,
    currentPrice: priceData.currentPrice,
    priceChange24h: priceData.priceChange24h,
    volumeChange24h: priceData.volumeChange24h,
    volatility: Math.abs(priceData.priceChange24h), // Simplified volatility
    trend: priceData.priceChange24h > 2 ? 'uptrend' : priceData.priceChange24h < -2 ? 'downtrend' : 'sideways',
    overallSentiment: 'neutral',
    sentimentScore: 0,
    newsCount24h: 0,
    whaleActivity: false,
    whaleAlerts24h: 0,
    largeFlowsNetUSD: 0,
  };
  
  // Gather whale alerts (from database or API)
  try {
    const whaleAlerts = await fetchWhaleAlerts(coin);
    intelligence.whaleAlerts24h = whaleAlerts.length;
    intelligence.whaleActivity = whaleAlerts.length > 5; // More than 5 alerts = active
    intelligence.largeFlowsNetUSD = calculateNetFlows(whaleAlerts);
  } catch (err) {
    console.warn('[Intelligence] Whale alert fetch failed:', err);
  }
  
  // Gather news sentiment
  try {
    const news = await fetchNewsSentiment(coin);
    intelligence.newsCount24h = news.length;
    intelligence.sentimentScore = calculateAverageSentiment(news);
    intelligence.overallSentiment = 
      intelligence.sentimentScore > 0.3 ? 'bullish' :
      intelligence.sentimentScore < -0.3 ? 'bearish' : 'neutral';
  } catch (err) {
    console.warn('[Intelligence] News sentiment fetch failed:', err);
  }
  
  // Calculate RSI if we have historical data
  // (This would need price history from database)
  
  // Correlation with BTC (for altcoins)
  if (coin !== 'BTC') {
    try {
      intelligence.correlationWithBTC = await calculateBTCCorrelation(coin);
    } catch (err) {
      console.warn('[Intelligence] BTC correlation calculation failed:', err);
    }
  }
  
  // Generate ML prediction
  intelligence.mlPrediction = generateMLPrediction(intelligence);
  
  return intelligence;
}

/**
 * Fetch whale alerts from database or API
 */
async function fetchWhaleAlerts(coin: string): Promise<WhaleAlert[]> {
  // This would integrate with WhaleAlert API or check MongoDB for stored alerts
  // For now, return empty array (would be populated by real data)
  return [];
}

/**
 * Calculate net flows from whale alerts
 */
function calculateNetFlows(alerts: WhaleAlert[]): number {
  return alerts.reduce((net, alert) => {
    if (alert.type === 'exchange_inflow') {
      return net - alert.amountUSD; // Inflow = potential sell pressure
    } else if (alert.type === 'exchange_outflow') {
      return net + alert.amountUSD; // Outflow = accumulation
    }
    return net;
  }, 0);
}

/**
 * Fetch news sentiment for a coin
 */
async function fetchNewsSentiment(coin: string): Promise<NewsArticle[]> {
  // This would integrate with NewsAPI or crypto news aggregators
  // For now, return empty array (would be populated by real data)
  return [];
}

/**
 * Calculate average sentiment from news articles
 */
function calculateAverageSentiment(articles: NewsArticle[]): number {
  if (articles.length === 0) return 0;
  const sum = articles.reduce((acc, article) => acc + article.sentimentScore, 0);
  return sum / articles.length;
}

/**
 * Calculate correlation with BTC
 */
async function calculateBTCCorrelation(coin: string): Promise<number> {
  // This would analyze price movements correlation over time
  // For now, return default correlation (most alts correlate with BTC)
  return 0.7; // 70% correlation
}

/**
 * Generate ML-based price prediction
 */
function generateMLPrediction(intelligence: MarketIntelligence): {
  expectedChangePct: number;
  confidence: number;
  timeframe: string;
  signals: string[];
} {
  const signals: string[] = [];
  let expectedChange = 0;
  let confidence = 0.5;
  
  // Analyze trend
  if (intelligence.trend === 'uptrend') {
    expectedChange += 5;
    signals.push('uptrend continuation');
  } else if (intelligence.trend === 'downtrend') {
    expectedChange -= 5;
    signals.push('downtrend continuation');
  }
  
  // Analyze sentiment
  if (intelligence.overallSentiment === 'bullish' && intelligence.sentimentScore > 0.5) {
    expectedChange += 3;
    confidence += 0.1;
    signals.push('strong positive sentiment');
  } else if (intelligence.overallSentiment === 'bearish' && intelligence.sentimentScore < -0.5) {
    expectedChange -= 3;
    confidence += 0.1;
    signals.push('strong negative sentiment');
  }
  
  // Analyze whale activity
  if (intelligence.whaleActivity) {
    if (intelligence.largeFlowsNetUSD > 1000000) {
      expectedChange += 4;
      signals.push('whale accumulation detected');
    } else if (intelligence.largeFlowsNetUSD < -1000000) {
      expectedChange -= 4;
      signals.push('whale distribution detected');
    }
    confidence += 0.15;
  }
  
  // Analyze volume
  if (Math.abs(intelligence.volumeChange24h) > 50) {
    confidence += 0.1;
    signals.push('high volume confirms trend');
  }
  
  // Cap confidence at 0.85 (never 100% certain)
  confidence = Math.min(0.85, confidence);
  
  return {
    expectedChangePct: expectedChange,
    confidence: Math.round(confidence * 100) / 100,
    timeframe: '24h',
    signals,
  };
}

/**
 * Real-time monitoring: check for critical alerts
 */
export function detectCriticalAlerts(intelligence: MarketIntelligence): Array<{
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}> {
  const alerts: Array<{ type: string; severity: 'low' | 'medium' | 'high' | 'critical'; message: string }> = [];
  
  // Sharp price drops
  if (intelligence.priceChange24h < -15) {
    alerts.push({
      type: 'price_crash',
      severity: 'critical',
      message: `${intelligence.coin} crashed ${intelligence.priceChange24h.toFixed(1)}% in 24h`,
    });
  } else if (intelligence.priceChange24h < -10) {
    alerts.push({
      type: 'price_drop',
      severity: 'high',
      message: `${intelligence.coin} dropped ${intelligence.priceChange24h.toFixed(1)}% in 24h`,
    });
  }
  
  // Sharp price spikes
  if (intelligence.priceChange24h > 20) {
    alerts.push({
      type: 'price_spike',
      severity: 'high',
      message: `${intelligence.coin} surged ${intelligence.priceChange24h.toFixed(1)}% in 24h - consider profit-taking`,
    });
  }
  
  // Whale distribution
  if (intelligence.whaleActivity && intelligence.largeFlowsNetUSD < -5000000) {
    alerts.push({
      type: 'whale_distribution',
      severity: 'high',
      message: `Major whale distribution detected: $${Math.abs(intelligence.largeFlowsNetUSD / 1000000).toFixed(1)}M flowing to exchanges`,
    });
  }
  
  // Whale accumulation
  if (intelligence.whaleActivity && intelligence.largeFlowsNetUSD > 5000000) {
    alerts.push({
      type: 'whale_accumulation',
      severity: 'medium',
      message: `Whale accumulation detected: $${(intelligence.largeFlowsNetUSD / 1000000).toFixed(1)}M flowing from exchanges`,
    });
  }
  
  // Extreme bearish sentiment
  if (intelligence.sentimentScore < -0.7 && intelligence.newsCount24h > 10) {
    alerts.push({
      type: 'extreme_fear',
      severity: 'high',
      message: `Extreme bearish sentiment detected for ${intelligence.coin} (score: ${intelligence.sentimentScore.toFixed(2)})`,
    });
  }
  
  // Extreme bullish sentiment (potential top)
  if (intelligence.sentimentScore > 0.8 && intelligence.newsCount24h > 15) {
    alerts.push({
      type: 'extreme_greed',
      severity: 'medium',
      message: `Extreme bullish sentiment for ${intelligence.coin} - possible local top, consider profit-taking`,
    });
  }
  
  // ML predicts significant drop
  if (intelligence.mlPrediction && 
      intelligence.mlPrediction.expectedChangePct < -15 && 
      intelligence.mlPrediction.confidence > 0.7) {
    alerts.push({
      type: 'ml_bearish',
      severity: 'high',
      message: `ML model predicts ${intelligence.mlPrediction.expectedChangePct.toFixed(1)}% drop (${(intelligence.mlPrediction.confidence * 100).toFixed(0)}% confidence)`,
    });
  }
  
  return alerts;
}
