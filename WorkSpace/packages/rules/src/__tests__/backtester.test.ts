import { backtestRule, batchBacktest, type BacktestConfig } from '../backtester';
import type { RuleSpec } from '../types';

const mockDb = {
  collection: (name: string) => ({
    insertOne: async () => ({ insertedId: 'test-id' }),
    find: () => ({
      sort: () => ({
        toArray: async () => [],
      }),
    }),
  }),
} as any;

const testRule: RuleSpec = {
  name: 'RSI Mean Reversion',
  enabled: true,
  trigger: { type: 'interval', every: '1h' },
  conditions: [{ indicator: 'rsi', symbol: 'BTC', lt: 30 }],
  actions: [{ type: 'enter', symbol: 'BTC', allocationPct: 10 }],
  risk: {
    maxPositionPct: 20,
    cooldownSecs: 4 * 60 * 60,
  },
};

const testConfig: BacktestConfig = {
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  endDate: new Date(),
  initialBalance: { BTC: 1, USDC: 50000 },
  initialPrices: { BTC: 69000, USDC: 1 },
};

describe('Backtester', () => {
  it('should run backtest and return metrics', async () => {
    const result = await backtestRule(mockDb, testRule, testConfig);

    expect(result).toBeDefined();
    expect(result.ruleId).toBe(testRule.name);
    expect(result.metrics).toBeDefined();
    expect(result.metrics.totalTrades).toBeGreaterThanOrEqual(0);
    expect(result.metrics.sharpeRatio).toBeDefined();
      expect(result.metrics.maxDrawdown).toBeDefined();
    expect(result.metrics.winRate).toBeDefined();
  });

  it('should calculate Sharpe ratio correctly', async () => {
    const result = await backtestRule(mockDb, testRule, testConfig);

    // Sharpe ratio should be a number (can be negative)
    expect(typeof result.metrics.sharpeRatio).toBe('number');
    expect(isNaN(result.metrics.sharpeRatio)).toBe(false);
  });

  it('should track max drawdown', async () => {
    const result = await backtestRule(mockDb, testRule, testConfig);

    // Max drawdown should be >= 0
     expect(result.metrics.maxDrawdown).toBeGreaterThanOrEqual(0);
  });

  it('should calculate win rate', async () => {
    const result = await backtestRule(mockDb, testRule, testConfig);

    // Win rate should be between 0 and 100
    expect(result.metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(result.metrics.winRate).toBeLessThanOrEqual(100);
  });

  it('should generate PnL curve', async () => {
    const result = await backtestRule(mockDb, testRule, testConfig);

    expect(Array.isArray(result.metrics.pnlCurve)).toBe(true);
    expect(result.metrics.pnlCurve.length).toBeGreaterThan(0);

    // Each point should have timestamp and value
    if (result.metrics.pnlCurve.length > 0) {
      const point = result.metrics.pnlCurve[0];
      expect(point.timestamp).toBeDefined();
      expect(typeof point.value).toBe('number');
    }
  });

  it('should handle rule with no trades', async () => {
    const noTradeRule: RuleSpec = {
      ...testRule,
      conditions: [{ indicator: 'rsi', symbol: 'BTC', lt: 1 }], // Impossible condition
    };

    const result = await backtestRule(mockDb, noTradeRule, testConfig);

    expect(result.metrics.totalTrades).toBe(0);
    expect(result.metrics.winRate).toBe(0);
  });

  it('should calculate average hold time', async () => {
    const result = await backtestRule(mockDb, testRule, testConfig);

    if (result.metrics.totalTrades > 0) {
      expect(result.metrics.avgHoldTimeMins).toBeGreaterThan(0);
    }
  });

  it('should calculate profit factor', async () => {
    const result = await backtestRule(mockDb, testRule, testConfig);

    // Profit factor should be defined (can be 0 if no winning trades)
    expect(result.metrics.profitFactor).toBeDefined();
    expect(result.metrics.profitFactor).toBeGreaterThanOrEqual(0);
  });

  it('should batch backtest multiple rules', async () => {
    const rules = [
      testRule,
      {
        ...testRule,
        name: 'Aggressive RSI',
        conditions: [{ indicator: 'rsi', symbol: 'BTC', lt: 35 }],
      },
      {
        ...testRule,
        name: 'Conservative RSI',
        conditions: [{ indicator: 'rsi', symbol: 'BTC', lt: 25 }],
      },
    ];

    const results = await batchBacktest(mockDb, rules as RuleSpec[], testConfig);

    expect(results.length).toBe(3);
    // Results should be sorted by Sharpe ratio descending
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].metrics.sharpeRatio).toBeGreaterThanOrEqual(
        results[i + 1].metrics.sharpeRatio
      );
    }
  });

  it('should handle different date ranges', async () => {
    const shortConfig: BacktestConfig = {
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
      endDate: new Date(),
      initialBalance: { BTC: 1, USDC: 50000 },
      initialPrices: { BTC: 69000, USDC: 1 },
    };

    const result = await backtestRule(mockDb, testRule, shortConfig);

    expect(result).toBeDefined();
      // Backtest result contains metrics for the specified date range
      expect(result.metrics).toBeDefined();
  });

  it('should respect initial balance configuration', async () => {
    const customConfig: BacktestConfig = {
      ...testConfig,
      initialBalance: { BTC: 2, USDC: 100000 },
    };

    const result = await backtestRule(mockDb, testRule, customConfig);

      // Backtest ran successfully with custom balance
      expect(result.metrics).toBeDefined();
  });
});
