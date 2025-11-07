import { Db } from 'mongodb';
import { RuleSpec, EvalContext, PortfolioState } from './types';
import { evaluateRulesTick } from './evaluator';

export interface BacktestConfig {
  startDate: Date;
  endDate: Date;
  initialBalance: Record<string, number>;
  initialPrices: Record<string, number>;
  dataSource?: 'mongodb' | 'api'; // Historical price source
}

export interface BacktestResult {
  ruleId: string;
  ruleName: string;
  metrics: {
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
    avgHoldTimeMins: number;
    profitFactor: number;
    pnlCurve: Array<{ timestamp: Date; value: number }>;
  };
  trades: Array<{
    timestamp: Date;
    symbol: string;
    type: 'enter' | 'exit';
    price: number;
    qty: number;
    pnl?: number;
  }>;
  finalPortfolio: Record<string, number>;
}

/**
 * Run backtest for a single rule over historical data
 */
export async function backtestRule(
  db: Db,
  rule: RuleSpec,
  config: BacktestConfig
): Promise<BacktestResult> {
  console.log(`📈 Backtesting ${rule.name} from ${config.startDate.toISOString()} to ${config.endDate.toISOString()}`);
  
  // Initialize portfolio state
  let portfolio: PortfolioState = {
    balances: { ...config.initialBalance },
    prices: { ...config.initialPrices },
  };
  
  const trades: any[] = [];
  const pnlCurve: Array<{ timestamp: Date; value: number }> = [];
  const objectives = await db.collection('objectives').findOne({ key: 'owner' });
  
  // Fetch historical price data (simplified - would use real candles)
  const priceHistory = await fetchHistoricalPrices(db, config);
  
  let lastExecutions: Record<string, Date> = {};
  let wins = 0;
  let losses = 0;
  let totalPnl = 0;
  
  // Simulate rule evaluation at each time step
  for (const snapshot of priceHistory) {
    portfolio.prices = snapshot.prices;
    
    const ctx: EvalContext = {
      now: snapshot.timestamp,
      portfolio,
      objectives: objectives?.value || {},
      lastExecutions,
      marketData: snapshot.marketData,
    };
    
    // Evaluate rule
    const intents = await evaluateRulesTick(db, ctx);
    
    // Execute intents (in backtest mode, execute immediately)
    for (const intent of intents) {
      if (intent.ruleId !== rule.id && intent.ruleId !== rule.name) continue;
      
      const action = intent.action as any;
      const symbol = action.symbol?.toUpperCase();
      const price = portfolio.prices[symbol] || 0;
      
      if (action.type === 'enter' && price > 0) {
        // Buy
        const totalValue = Object.entries(portfolio.balances).reduce(
          (acc, [coin, qty]) => acc + (portfolio.prices[coin] || 0) * qty,
          0
        );
        const valueToSpend = (action.allocationPct / 100) * totalValue;
        const qtyToBuy = valueToSpend / price;
        
        portfolio.balances[symbol] = (portfolio.balances[symbol] || 0) + qtyToBuy;
        portfolio.balances['USDC'] = (portfolio.balances['USDC'] || 0) - valueToSpend;
        
        trades.push({
          timestamp: snapshot.timestamp,
          symbol,
          type: 'enter',
          price,
          qty: qtyToBuy,
        });
        
        lastExecutions[intent.ruleId] = snapshot.timestamp;
      } else if (action.type === 'exit' && price > 0) {
        // Sell
        const holdingQty = portfolio.balances[symbol] || 0;
        const qtyToSell = holdingQty * (action.allocationPct || 100) / 100;
        const valueReceived = qtyToSell * price;
        
        portfolio.balances[symbol] = holdingQty - qtyToSell;
        portfolio.balances['USDC'] = (portfolio.balances['USDC'] || 0) + valueReceived;
        
        // Calculate P&L for this trade pair
        const entryTrade = trades.slice().reverse().find(
          t => t.symbol === symbol && t.type === 'enter'
        );
        const pnl = entryTrade ? (price - entryTrade.price) * qtyToSell : 0;
        
        if (pnl > 0) wins++;
        else if (pnl < 0) losses++;
        totalPnl += pnl;
        
        trades.push({
          timestamp: snapshot.timestamp,
          symbol,
          type: 'exit',
          price,
          qty: qtyToSell,
          pnl,
        });
        
        lastExecutions[intent.ruleId] = snapshot.timestamp;
      }
    }
    
    // Record portfolio value
    const portfolioValue = Object.entries(portfolio.balances).reduce(
      (acc, [coin, qty]) => acc + (portfolio.prices[coin] || 0) * qty,
      0
    );
    pnlCurve.push({ timestamp: snapshot.timestamp, value: portfolioValue });
  }
  
  // Calculate final metrics
  const initialValue = Object.entries(config.initialBalance).reduce(
    (acc, [coin, qty]) => acc + (config.initialPrices[coin] || 0) * qty,
    0
  );
  const finalValue = pnlCurve[pnlCurve.length - 1]?.value || initialValue;
  const totalReturn = ((finalValue - initialValue) / initialValue) * 100;
  
  const returns = pnlCurve.map((point, i) => {
    if (i === 0) return 0;
    return (point.value - pnlCurve[i - 1].value) / pnlCurve[i - 1].value;
  });
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = Math.sqrt(
    returns.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  
  const drawdowns = pnlCurve.map((point, i) => {
    const peak = Math.max(...pnlCurve.slice(0, i + 1).map(p => p.value));
    return peak > 0 ? ((peak - point.value) / peak) * 100 : 0;
  });
  const maxDrawdown = Math.max(...drawdowns) / 100;
  
  const winRate = wins + losses > 0 ? wins / (wins + losses) : 0;
  
  const avgHoldTime = calculateAvgHoldTime(trades);
  const profitFactor = losses > 0 ? Math.abs(totalPnl / (totalPnl - wins * 100)) : 1.0;
  
  const result: BacktestResult = {
    ruleId: rule.id || rule.name,
    ruleName: rule.name,
    metrics: {
      totalReturn,
      sharpeRatio,
      maxDrawdown,
      winRate,
      totalTrades: trades.length,
      avgHoldTimeMins: avgHoldTime,
      profitFactor,
      pnlCurve,
    },
    trades,
    finalPortfolio: portfolio.balances,
  };
  
  // Store in MongoDB
  await db.collection('backtestResults').insertOne({
    ...result,
    createdAt: new Date(),
  });
  
  console.log(`✅ Backtest complete: Return=${totalReturn.toFixed(2)}% Sharpe=${sharpeRatio.toFixed(2)} MaxDD=${(maxDrawdown * 100).toFixed(2)}%`);
  
  return result;
}

/**
 * Fetch historical price data (simplified stub)
 * In production, would query MongoDB historical candles or external API
 */
async function fetchHistoricalPrices(
  db: Db,
  config: BacktestConfig
): Promise<Array<{ timestamp: Date; prices: Record<string, number>; marketData?: any }>> {
  // Stub: Generate synthetic price movements for testing
  // In production, fetch from MongoDB 'candles' collection or Coinbase API
  
  const snapshots: Array<{ timestamp: Date; prices: Record<string, number> }> = [];
  const symbols = Object.keys(config.initialPrices);
  
  const days = Math.ceil((config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24));
  const intervalsPerDay = 96; // 15-minute intervals
  const totalIntervals = days * intervalsPerDay;
  
  let currentPrices = { ...config.initialPrices };
  
  for (let i = 0; i < totalIntervals; i++) {
    const timestamp = new Date(config.startDate.getTime() + i * 15 * 60 * 1000);
    
    // Simulate price movement (random walk)
    for (const symbol of symbols) {
      const volatility = symbol === 'BTC' ? 0.02 : symbol === 'XRP' ? 0.03 : 0.01;
      const change = (Math.random() - 0.5) * 2 * volatility;
      currentPrices[symbol] *= (1 + change);
    }
    
    snapshots.push({
      timestamp,
      prices: { ...currentPrices },
    });
  }
  
  console.log(`📊 Generated ${snapshots.length} historical snapshots`);
  return snapshots;
}

function calculateAvgHoldTime(trades: any[]): number {
  const pairs: Array<{ entry: any; exit: any }> = [];
  const entries: Record<string, any[]> = {};
  
  for (const trade of trades) {
    if (trade.type === 'enter') {
      if (!entries[trade.symbol]) entries[trade.symbol] = [];
      entries[trade.symbol].push(trade);
    } else if (trade.type === 'exit' && entries[trade.symbol]?.length > 0) {
      const entry = entries[trade.symbol].shift()!;
      pairs.push({ entry, exit: trade });
    }
  }
  
  if (pairs.length === 0) return 0;
  
  const totalMinutes = pairs.reduce((acc, pair) => {
    const holdTime = (pair.exit.timestamp.getTime() - pair.entry.timestamp.getTime()) / (1000 * 60);
    return acc + holdTime;
  }, 0);
  
  return totalMinutes / pairs.length;
}

/**
 * Batch backtest multiple rules and rank by performance
 */
export async function batchBacktest(
  db: Db,
  rules: RuleSpec[],
  config: BacktestConfig
): Promise<BacktestResult[]> {
  const results: BacktestResult[] = [];
  
  for (const rule of rules) {
    try {
      const result = await backtestRule(db, rule, config);
      results.push(result);
    } catch (err) {
      console.error(`❌ Backtest failed for ${rule.name}:`, err);
    }
  }
  
  // Sort by Sharpe ratio descending
  results.sort((a, b) => b.metrics.sharpeRatio - a.metrics.sharpeRatio);
  
  return results;
}
