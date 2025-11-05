/**
 * Backtesting module - TypeScript migration
 * Run backtests on trading strategies
 */

export interface Strategy {
  buyThreshold: number;
  sellThreshold: number;
  name?: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface HistoricalDataPoint {
  date: string | Date;
  price: number;
  volume?: number;
}

export interface BacktestAction {
  action: 'buy' | 'sell';
  date: string | Date;
  price: number;
  amount?: number;
}

export interface BacktestResult {
  final?: number;
  log?: BacktestAction[];
  error?: string;
  startValue?: number;
  endValue?: number;
  returnPct?: number;
  trades?: number;
  winRate?: number;
}

export async function runBacktest(
  strategy: Strategy,
  historicalData: HistoricalDataPoint[]
): Promise<BacktestResult> {
  // Naive backtest: assume strategy has buyThreshold and sellThreshold
  if (!Array.isArray(historicalData) || historicalData.length === 0) {
    return { error: 'no-data' };
  }

  let cash = 1000;
  const startValue = cash;
  let coin = 0;
  const log: BacktestAction[] = [];
  let wins = 0;
  let losses = 0;

  for (const point of historicalData) {
    // Buy signal
    if (point.price < strategy.buyThreshold && cash > 0) {
      const amount = cash / point.price;
      coin = amount;
      cash = 0;
      log.push({ 
        action: 'buy', 
        date: point.date, 
        price: point.price,
        amount 
      });
    }
    // Sell signal
    else if (point.price > strategy.sellThreshold && coin > 0) {
      const proceeds = coin * point.price;
      const profit = proceeds - startValue;
      
      if (profit > 0) wins++;
      else losses++;
      
      cash = proceeds;
      coin = 0;
      log.push({ 
        action: 'sell', 
        date: point.date, 
        price: point.price,
        amount: coin 
      });
    }
  }

  // Calculate final value
  const lastPrice = historicalData[historicalData.length - 1].price;
  const final = cash + coin * lastPrice;
  const returnPct = ((final - startValue) / startValue) * 100;
  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  return { 
    final, 
    log,
    startValue,
    endValue: final,
    returnPct,
    trades: log.length,
    winRate
  };
}

export async function compareStrategies(
  strategies: Strategy[],
  historicalData: HistoricalDataPoint[]
): Promise<Array<{ strategy: Strategy; result: BacktestResult }>> {
  const results = [];
  
  for (const strategy of strategies) {
    const result = await runBacktest(strategy, historicalData);
    results.push({ strategy, result });
  }
  
  return results;
}
