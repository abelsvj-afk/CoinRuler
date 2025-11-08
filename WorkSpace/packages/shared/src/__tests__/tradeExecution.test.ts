import { executeTrade, type TradeRequest } from '../tradeExecution';

// Mock process env for dry-run safety
process.env.DRY_RUN = 'true';

// Simple mocks by monkey-patching coinbase client methods via global jest mock (not available here) -
// Instead we simulate by temporarily replacing global functions on the returned client.

jest.mock('../coinbaseApi', () => ({
  getCoinbaseApiClient: () => ({
    getBalance: async (_sym: string) => 2,
    placeMarketOrder: async (_product: string, _side: string, _amount: string, dryRun: boolean) => ({
      id: dryRun ? 'dry-run-order' : 'live-order',
      status: dryRun ? 'simulated' : 'filled',
      filled_size: _amount,
      executed_value: "100"
    }),
  }),
}));

describe('shared executeTrade', () => {
  test('market buy dry-run ok', async () => {
    const res = await executeTrade({ side: 'buy', symbol: 'BTC', amount: 0.001 });
    expect(res.ok).toBe(true);
    expect(res.orderId).toBe('dry-run-order');
    expect(res.status).toBe('simulated');
  });
  test('invalid amount blocked', async () => {
    const res = await executeTrade({ side: 'buy', symbol: 'BTC', amount: 0 });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('INVALID_AMOUNT');
  });
  test('velocity risk blocked', async () => {
    process.env.AUTO_EXECUTE_RISK_MAX_TRADES_HOUR = '4';
    const req: TradeRequest = { side: 'buy', symbol: 'BTC', amount: 0.001, risk: { tradesLastHour: 5 } };
    const res = await executeTrade(req);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('RISK_TRADE_VELOCITY');
  });
  test('daily loss limit blocked', async () => {
    process.env.AUTO_EXECUTE_DAILY_LOSS_LIMIT = '-1000';
    const req: TradeRequest = { side: 'buy', symbol: 'BTC', amount: 0.001, risk: { dailyLoss: -1500 } };
    const res = await executeTrade(req);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('RISK_DAILY_LOSS_LIMIT');
  });
});
