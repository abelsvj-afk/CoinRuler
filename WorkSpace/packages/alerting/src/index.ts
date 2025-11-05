// Advanced alerting, fraud detection, and economic event monitoring
import axios from 'axios';

export interface Alert {
  id: string;
  type: 'volatility' | 'whale' | 'fraud' | 'economic_event';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: string;
  metadata?: any;
}

export interface VolatilityAlert extends Alert {
  type: 'volatility';
  symbol: string;
  priceChange: number;
  currentPrice: number;
}

export interface FraudAlert extends Alert {
  type: 'fraud';
  userId?: string;
  reason: string;
  confidence: number;
}

export interface EconomicEvent extends Alert {
  type: 'economic_event';
  eventType: 'fed_rate' | 'cpi' | 'gdp' | 'unemployment' | 'other';
  impact: 'bullish' | 'bearish' | 'neutral';
  description: string;
}

interface PriceCache {
  [symbol: string]: { price: number; timestamp: number };
}

const priceCache: PriceCache = {};

// Volatility monitoring with real-time price tracking
export async function monitorVolatility(symbols: string[], thresholdPercent = 5): Promise<VolatilityAlert[]> {
  const alerts: VolatilityAlert[] = [];

  for (const symbol of symbols) {
    try {
      const currentPrice = await fetchCurrentPrice(symbol);
      const cached = priceCache[symbol];

      if (cached && currentPrice) {
        const changePercent = ((currentPrice - cached.price) / cached.price) * 100;
        const timeDiff = Date.now() - cached.timestamp;

        // Alert if price changed more than threshold in last hour
        if (Math.abs(changePercent) >= thresholdPercent && timeDiff < 3600000) {
          alerts.push({
            id: generateId(),
            type: 'volatility',
            severity: Math.abs(changePercent) > 10 ? 'critical' : 'high',
            message: `${symbol} price changed ${changePercent.toFixed(2)}% in the last hour`,
            timestamp: new Date().toISOString(),
            symbol,
            priceChange: changePercent,
            currentPrice,
          });
        }
      }

      // Update cache
      if (currentPrice) {
        priceCache[symbol] = { price: currentPrice, timestamp: Date.now() };
      }
    } catch (error: any) {
      console.error(`[Alerting] Error monitoring ${symbol}:`, error.message);
    }
  }

  return alerts;
}

async function fetchCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const CG_KEY = process.env.COINGECKO_API_KEY || process.env.COIN_GECKO_API_KEY;
    const coinId = symbol.toLowerCase() === 'btc' ? 'bitcoin' :
                   symbol.toLowerCase() === 'eth' ? 'ethereum' :
                   symbol.toLowerCase() === 'xrp' ? 'ripple' : symbol.toLowerCase();

    const url = `https://api.coingecko.com/api/v3/simple/price`;
    const params = {
      ids: coinId,
      vs_currencies: 'usd',
    };

    const headers = CG_KEY ? { 'x-cg-pro-api-key': CG_KEY } : undefined;
    const response = await axios.get(url, { params, headers, timeout: 5000 });
    return response.data[coinId]?.usd || null;
  } catch (error) {
    return null;
  }
}

// Fraud detection using anomaly detection
export async function detectFraud(transactions: any[]): Promise<FraudAlert[]> {
  const alerts: FraudAlert[] = [];

  for (const tx of transactions) {
    const reasons: string[] = [];
    let confidence = 0;

    // Check for unusual amounts
    if (tx.amount > 1000000) {
      reasons.push('Unusually large transaction amount');
      confidence += 0.3;
    }

    // Check for rapid successive transactions
    if (tx.rapidTransactions && tx.rapidTransactions > 10) {
      reasons.push('Rapid successive transactions detected');
      confidence += 0.4;
    }

    // Check for unusual time patterns
    const hour = new Date(tx.timestamp).getHours();
    if (hour >= 2 && hour <= 5) {
      reasons.push('Transaction during unusual hours');
      confidence += 0.2;
    }

    // Check for geographic anomalies (if location data available)
    if (tx.locationChange && tx.locationChange > 1000) {
      reasons.push('Geographic anomaly detected');
      confidence += 0.3;
    }

    // Alert if confidence threshold exceeded
    if (confidence >= 0.5) {
      alerts.push({
        id: generateId(),
        type: 'fraud',
        severity: confidence > 0.8 ? 'critical' : confidence > 0.6 ? 'high' : 'medium',
        message: `Potential fraud detected: ${reasons.join(', ')}`,
        timestamp: new Date().toISOString(),
        userId: tx.userId,
        reason: reasons.join('; '),
        confidence: Math.min(confidence, 1),
      });
    }
  }

  return alerts;
}

// Economic event monitoring
export async function fetchEconomicEvents(): Promise<EconomicEvent[]> {
  const TRADING_ECON_KEY = process.env.TRADING_ECONOMICS_API_KEY;

  if (!TRADING_ECON_KEY) {
    console.warn('[Alerting] Trading Economics API key not set, returning mock data');
    return [
      {
        id: generateId(),
        type: 'economic_event',
        severity: 'high',
        message: 'Mock: Federal Reserve interest rate decision pending',
        timestamp: new Date().toISOString(),
        eventType: 'fed_rate',
        impact: 'bearish',
        description: 'Fed may raise rates by 0.25%',
      },
    ];
  }

  try {
    // Trading Economics API endpoint for calendar events
    const url = `https://api.tradingeconomics.com/calendar`;
    const params = {
      c: TRADING_ECON_KEY,
      country: 'united states',
      importance: '3', // High importance only
    };

    const response = await axios.get(url, { params, timeout: 10000 });
    const events: EconomicEvent[] = [];

    for (const event of response.data || []) {
      const eventType = categorizeEvent(event.Event);
      const impact = assessImpact(event.Actual, event.Forecast);

      events.push({
        id: generateId(),
        type: 'economic_event',
        severity: 'high',
        message: `${event.Event}: ${event.Actual || 'TBD'}`,
        timestamp: event.Date,
        eventType,
        impact,
        description: event.Event,
      });
    }

    return events;
  } catch (error: any) {
    console.error('[Alerting] Economic event fetch error:', error.message);
    return [];
  }
}

function categorizeEvent(eventName: string): 'fed_rate' | 'cpi' | 'gdp' | 'unemployment' | 'other' {
  const lower = eventName.toLowerCase();
  if (lower.includes('interest rate') || lower.includes('fed')) return 'fed_rate';
  if (lower.includes('cpi') || lower.includes('inflation')) return 'cpi';
  if (lower.includes('gdp')) return 'gdp';
  if (lower.includes('unemployment')) return 'unemployment';
  return 'other';
}

function assessImpact(actual: any, forecast: any): 'bullish' | 'bearish' | 'neutral' {
  if (!actual || !forecast) return 'neutral';
  const diff = parseFloat(actual) - parseFloat(forecast);
  if (Math.abs(diff) < 0.1) return 'neutral';
  return diff > 0 ? 'bullish' : 'bearish';
}

// Create and persist alert
export async function createAlert(alert: Omit<Alert, 'id' | 'timestamp'>): Promise<Alert> {
  const newAlert: Alert = {
    ...alert,
    id: generateId(),
    timestamp: new Date().toISOString(),
  };
  
  console.log('[Alerting] Alert created:', newAlert);
  // TODO: Persist to database
  // TODO: Send notifications via Discord, email, SMS based on severity
  
  return newAlert;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}
