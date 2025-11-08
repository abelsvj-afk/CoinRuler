/**
 * Machine Learning Models - LSTM/ARIMA Price Prediction
 * Requirement 9: Add trend prediction models
 */

export interface PricePrediction {
  asset: string;
  currentPrice: number;
  predictions: {
    oneHour: number;
    fourHours: number;
    oneDay: number;
    threeDays: number;
    oneWeek: number;
  };
  confidence: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  volatility: number;
  model: 'simple-ma' | 'ema' | 'arima-lite';
  timestamp: Date;
}

/**
 * Simple Moving Average prediction (placeholder for LSTM)
 * TODO: Replace with actual LSTM/TensorFlow.js model
 */
function predictWithMA(prices: number[], windows: number[] = [5, 20, 50]): number[] {
  if (prices.length < 5) return [prices[prices.length - 1]];
  
  const predictions: number[] = [];
  
  for (const window of windows) {
    const validWindow = Math.min(window, prices.length);
    const recentPrices = prices.slice(-validWindow);
    const ma = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    predictions.push(ma);
  }
  
  return predictions;
}

/**
 * Exponential Moving Average (better for recent trends)
 */
function calculateEMA(prices: number[], period: number = 12): number {
  if (prices.length < period) return prices[prices.length - 1];
  
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  
  return ema;
}

/**
 * Calculate momentum (rate of change)
 */
function calculateMomentum(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 0;
  
  const current = prices[prices.length - 1];
  const past = prices[prices.length - 1 - period];
  
  return ((current - past) / past) * 100;
}

/**
 * Calculate volatility (standard deviation of returns)
 */
function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance) * 100;
}

/**
 * Predict future prices using simplified ARIMA-like approach
 * (Proper ARIMA would require external library like 'arima' npm package)
 */
export function predictPrices(
  asset: string,
  historicalPrices: Array<{ timestamp: Date; price: number }>
): PricePrediction {
  const prices = historicalPrices.map(p => p.price);
  const currentPrice = prices[prices.length - 1];
  
  if (prices.length < 10) {
    // Not enough data, use current price
    return {
      asset,
      currentPrice,
      predictions: {
        oneHour: currentPrice,
        fourHours: currentPrice,
        oneDay: currentPrice,
        threeDays: currentPrice,
        oneWeek: currentPrice,
      },
      confidence: 0.3,
      trend: 'neutral',
      volatility: 0,
      model: 'simple-ma',
      timestamp: new Date(),
    };
  }
  
  // Calculate indicators
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const momentum = calculateMomentum(prices, 14);
  const volatility = calculateVolatility(prices);
  
  // Trend detection
  const trend = ema12 > ema26 ? 'bullish' : ema12 < ema26 ? 'bearish' : 'neutral';
  
  // Simple prediction: current price + momentum-adjusted trend
  const momentumFactor = momentum / 100;
  const volatilityFactor = Math.min(volatility / 10, 0.5); // Cap at 50%
  
  // Predictions with dampening over time
  const predictions = {
    oneHour: currentPrice * (1 + momentumFactor * 0.1),
    fourHours: currentPrice * (1 + momentumFactor * 0.3),
    oneDay: currentPrice * (1 + momentumFactor * 0.5),
    threeDays: currentPrice * (1 + momentumFactor * 0.8),
    oneWeek: currentPrice * (1 + momentumFactor * 1.0),
  };
  
  // Confidence based on data quality and volatility
  let confidence = 0.5;
  if (prices.length > 100) confidence += 0.2;
  if (volatility < 5) confidence += 0.2;
  if (Math.abs(momentum) > 5) confidence += 0.1;
  confidence = Math.min(0.95, confidence);
  
  return {
    asset,
    currentPrice,
    predictions,
    confidence,
    trend,
    volatility,
    model: 'ema',
    timestamp: new Date(),
  };
}

/**
 * Store ML prediction in rlMetrics collection
 */
export async function storePrediction(db: any, prediction: PricePrediction): Promise<void> {
  await db.collection('rlMetrics').insertOne({
    type: 'price_prediction',
    asset: prediction.asset,
    prediction,
    timestamp: new Date(),
  });
}

/**
 * Get latest predictions from rlMetrics
 */
export async function getLatestPredictions(db: any, asset?: string): Promise<PricePrediction[]> {
  const query: any = { type: 'price_prediction' };
  if (asset) query['prediction.asset'] = asset;
  
  const docs = await db.collection('rlMetrics')
    .find(query)
    .sort({ timestamp: -1 })
    .limit(10)
    .toArray();
  
  return docs.map((d: any) => d.prediction);
}
