/**
 * Minimal backtesting stub.
 * Exports runBacktest(strategy, historicalData) -> { results }
 */
async function runBacktest(strategy, historicalData) {
  // Very naive backtest: assume strategy is { buyThreshold, sellThreshold }
  // historicalData: array of { date, price }
  if (!Array.isArray(historicalData) || historicalData.length === 0) return { error: 'no-data' };
  let cash = 1000;
  let coin = 0;
  const log = [];
  for (const point of historicalData) {
    if (point.price < strategy.buyThreshold && cash > 0) {
      coin = cash / point.price; cash = 0; log.push({ action: 'buy', date: point.date, price: point.price });
    } else if (point.price > strategy.sellThreshold && coin > 0) {
      cash = coin * point.price; coin = 0; log.push({ action: 'sell', date: point.date, price: point.price });
    }
  }
  const final = cash + coin * historicalData[historicalData.length - 1].price;
  return { final, log };
}

module.exports = { runBacktest };
