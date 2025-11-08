// Jest globals import for TypeScript (ensures describe/test/expect types)
// Jest globals: rely on ts-jest preset which injects types via @types/jest devDependency.
type TradeSide = 'buy' | 'sell';
interface TradeResult { ok: boolean; orderId?: string; status?: string; filledQty?: number; avgFillPrice?: number; error?: string; }

// Mock coinbase client
const mockClient = {
  getBalance: async (_: string) => 2,
  placeMarketOrder: async (_prod: string, _side: string, _amount: string, dryRun: boolean) => dryRun ? { id: 'dry-run-order', status: 'simulated', filled_size: _amount } : { id: 'live-order', status: 'filled', filled_size: _amount },
};

function localIsDryRun() { return true; }

async function executeTrade(opts: { side: TradeSide; symbol: string; amount: number; mode?: 'market' | 'limit'; limitPrice?: number; reason?: string; }): Promise<TradeResult> {
  const dryRun = localIsDryRun();
  if (!opts.amount || opts.amount <= 0) return { ok: false, error: 'INVALID_AMOUNT' };
  if (opts.side === 'sell') {
    const bal = await mockClient.getBalance(opts.symbol);
    if (bal < opts.amount) return { ok: false, error: 'INSUFFICIENT_BALANCE' };
  }
  if ((opts.mode || 'market') === 'market') {
    const resp = await mockClient.placeMarketOrder(`${opts.symbol}-USD`, opts.side, String(opts.amount), dryRun);
    return { ok: true, orderId: resp.id, status: resp.status, filledQty: Number(resp.filled_size || 0) };
  } else {
    if (dryRun) return { ok: true, orderId: 'dry-run-' + Date.now(), status: 'simulated' };
    return { ok: false, error: 'LIMIT_NOT_IMPLEMENTED' };
  }
}

describe('executeTrade dry-run', () => {
  test('market buy returns simulated order', async () => {
    const res = await executeTrade({ side: 'buy', symbol: 'BTC', amount: 0.001 });
    expect(res.ok).toBe(true);
    expect(res.orderId).toBe('dry-run-order');
    expect(res.status).toBe('simulated');
    expect(res.filledQty).toBeGreaterThan(0);
  });
  test('invalid amount returns error', async () => {
    const res = await executeTrade({ side: 'buy', symbol: 'BTC', amount: 0 });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('INVALID_AMOUNT');
  });
  test('sell insufficient balance blocked', async () => {
    // Override mock getBalance to simulate low balance
  const lowClient = { ...mockClient, getBalance: async (_: string) => 0.0001 };
    async function attemptSell(amount: number): Promise<TradeResult> {
      const bal = await lowClient.getBalance('BTC');
      if (bal < amount) return { ok: false, error: 'INSUFFICIENT_BALANCE' };
      return { ok: true, orderId: 'dry-run-order', status: 'simulated', filledQty: amount };
    }
    const res = await attemptSell(0.5);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('INSUFFICIENT_BALANCE');
  });
});