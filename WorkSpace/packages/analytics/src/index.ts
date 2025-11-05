import axios from 'axios';

export interface WhaleTransaction {
  symbol: string;
  amount: number;
  usdValue: number;
  timestamp: string;
  type: 'exchange_deposit' | 'exchange_withdrawal' | 'large_transfer';
  source?: string;
}

export interface SocialSentiment {
  source: 'twitter' | 'reddit' | 'news';
  symbol: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  score: number;
  timestamp: string;
  text?: string;
}

export interface CorrelationData {
  symbols: [string, string];
  correlation: number;
  period: string;
}

export interface PriceData {
  symbol: string;
  timestamp: number;
  price: number;
}

// Whale Alert API integration
export async function fetchWhaleAlerts(symbols: string[]): Promise<WhaleTransaction[]> {
  const WHALE_ALERT_KEY = process.env.WHALE_ALERT_API_KEY;
  
  if (!WHALE_ALERT_KEY) {
    console.warn('[Analytics] Whale Alert API key not set, returning mock data');
    return symbols.map(symbol => ({
      symbol,
      amount: Math.random() * 1000,
      usdValue: Math.random() * 1000000,
      timestamp: new Date().toISOString(),
      type: 'large_transfer' as const,
      source: 'mock',
    }));
  }

  try {
    const url = `https://api.whale-alert.io/v1/transactions`;
    const params = {
      api_key: WHALE_ALERT_KEY,
      min_value: 500000, // minimum $500k transactions
      limit: 100,
    };
    const response = await axios.get(url, { params, timeout: 10000 });
    
    return response.data.transactions
      .filter((tx: any) => symbols.includes(tx.symbol.toUpperCase()))
      .map((tx: any) => ({
        symbol: tx.symbol.toUpperCase(),
        amount: tx.amount,
        usdValue: tx.amount_usd,
        timestamp: new Date(tx.timestamp * 1000).toISOString(),
        type: tx.to?.owner_type === 'exchange' ? 'exchange_deposit' : 
              tx.from?.owner_type === 'exchange' ? 'exchange_withdrawal' : 'large_transfer',
        source: 'whale-alert',
      }));
  } catch (error: any) {
    console.error('[Analytics] Whale Alert API error:', error.message);
    return [];
  }
}

// Social sentiment from News API or similar
export async function fetchSocialSentiment(symbols: string[]): Promise<SocialSentiment[]> {
  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  
  if (!NEWS_API_KEY) {
    console.warn('[Analytics] News API key not set, returning mock data');
    return symbols.map(symbol => ({
      source: 'news' as const,
      symbol,
      sentiment: ['bullish', 'bearish', 'neutral'][Math.floor(Math.random() * 3)] as any,
      score: Math.random(),
      timestamp: new Date().toISOString(),
      text: `Mock sentiment for ${symbol}`,
    }));
  }

  try {
    const sentiments: SocialSentiment[] = [];
    
    for (const symbol of symbols) {
      const query = `${symbol} cryptocurrency`;
      const url = `https://newsapi.org/v2/everything`;
      const params = {
        q: query,
        apiKey: NEWS_API_KEY,
        language: 'en',
        sortBy: 'publishedAt',
        pageSize: 10,
      };
      
      const response = await axios.get(url, { params, timeout: 10000 });
      
      for (const article of response.data.articles || []) {
        // Simple sentiment analysis based on keywords
        const text = `${article.title} ${article.description || ''}`.toLowerCase();
        let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        let score = 0.5;
        
        const bullishWords = ['surge', 'rally', 'bullish', 'gain', 'rise', 'pump', 'moon', 'breakout'];
        const bearishWords = ['crash', 'dump', 'bearish', 'drop', 'fall', 'decline', 'plunge'];
        
        const bullishCount = bullishWords.filter(w => text.includes(w)).length;
        const bearishCount = bearishWords.filter(w => text.includes(w)).length;
        
        if (bullishCount > bearishCount) {
          sentiment = 'bullish';
          score = 0.5 + (bullishCount * 0.1);
        } else if (bearishCount > bullishCount) {
          sentiment = 'bearish';
          score = 0.5 - (bearishCount * 0.1);
        }
        
        sentiments.push({
          source: 'news',
          symbol,
          sentiment,
          score: Math.max(0, Math.min(1, score)),
          timestamp: article.publishedAt,
          text: article.title,
        });
      }
    }
    
    return sentiments;
  } catch (error: any) {
    console.error('[Analytics] News API error:', error.message);
    return [];
  }
}

// Compute correlation between two assets using historical prices
export async function computeCorrelation(symbol1: string, symbol2: string, days = 30): Promise<CorrelationData> {
  try {
    // Fetch historical prices from CoinGecko (free API)
    const prices1 = await fetchHistoricalPrices(symbol1, days);
    const prices2 = await fetchHistoricalPrices(symbol2, days);
    
    if (prices1.length === 0 || prices2.length === 0) {
      console.warn('[Analytics] Insufficient price data for correlation');
      return { symbols: [symbol1, symbol2], correlation: 0, period: `${days}d` };
    }
    
    // Compute Pearson correlation
    const correlation = pearsonCorrelation(
      prices1.map(p => p.price),
      prices2.map(p => p.price)
    );
    
    return {
      symbols: [symbol1, symbol2],
      correlation,
      period: `${days}d`,
    };
  } catch (error: any) {
    console.error('[Analytics] Correlation computation error:', error.message);
    return { symbols: [symbol1, symbol2], correlation: 0.5, period: `${days}d` };
  }
}

async function fetchHistoricalPrices(symbol: string, days: number): Promise<PriceData[]> {
  try {
    const CG_KEY = process.env.COINGECKO_API_KEY || process.env.COIN_GECKO_API_KEY;
    const coinId = symbol.toLowerCase() === 'btc' ? 'bitcoin' : 
                   symbol.toLowerCase() === 'eth' ? 'ethereum' :
                   symbol.toLowerCase() === 'xrp' ? 'ripple' : symbol.toLowerCase();
    
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart`;
    const params = {
      vs_currency: 'usd',
      days: days.toString(),
      interval: 'daily',
    };
    const headers = CG_KEY ? { 'x-cg-pro-api-key': CG_KEY } : undefined;
    const response = await axios.get(url, { params, headers, timeout: 10000 });
    
    return response.data.prices.map(([timestamp, price]: [number, number]) => ({
      symbol,
      timestamp,
      price,
    }));
  } catch (error: any) {
    console.error(`[Analytics] Error fetching prices for ${symbol}:`, error.message);
    return [];
  }
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;
  
  const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
  const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
  const sumXY = x.slice(0, n).reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.slice(0, n).reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.slice(0, n).reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
}
