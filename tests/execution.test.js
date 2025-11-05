  test('handles ccxt order placement error', async () => {
    jest.resetModules();
    jest.doMock('ccxt', () => {
      class FakeExchange {
        constructor(opts) { this.opts = opts; }
        async loadMarkets() { return; }
        async createMarketSellOrder(symbol, amount) { throw new Error('order failed'); }
        setSandboxMode() { /* noop */ }
      }
      return { coinbasepro: FakeExchange };
    });
    const { executeApproval: exe } = require('../lib/execution');
    const approval = { _id: 'a4', title: 'Sell fail', type: 'sell', coin: 'BTC', amount: 0.004 };
    const updates = [];
    const db = {
      collection: (name) => ({ updateOne: async (q, u) => { updates.push({ name, q, u }); return {}; } }),
    };
    const msgs = [];
    const res = await exe(approval, { db, logToMemory: async () => {}, sendAdvisoryMessage: async (m) => msgs.push(m), env: { ORDER_EXECUTION_ENABLED: 'true', EXCHANGE_API_KEY: 'k', EXCHANGE_SECRET: 's', EXCHANGE_ID: 'coinbasepro' } });
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/order failed/);
    expect(msgs.join(' ')).toMatch(/failed/);
  });

  test('auto-executes non-sell approvals', async () => {
    const approval = { _id: 'a5', title: 'Stake test', type: 'stake', coin: 'ETH', amount: 1 };
    const updates = [];
    const db = {
      collection: (name) => ({ updateOne: async (q, u) => { updates.push({ name, q, u }); return {}; } }),
    };
    const logs = [];
    const msgs = [];
    const res = await executeApproval(approval, { db, logToMemory: async (x) => logs.push(x), sendAdvisoryMessage: async (m) => msgs.push(m), env: { ORDER_EXECUTION_ENABLED: 'true' } });
    expect(res.status).toBe('executed');
    expect(res.note).toBe('non-sell');
    expect(msgs.join(' ')).toMatch(/auto-executed/);
  });
const { executeApproval } = require('../lib/execution');

jest.setTimeout(10000);

describe('executeApproval', () => {
  test('simulated when ORDER_EXECUTION_ENABLED=false', async () => {
    const approval = { _id: 'a1', title: 'Sell test', type: 'sell', coin: 'BTC', amount: 0.001 };
    const updates = [];
    const db = {
      collection: (name) => ({ updateOne: async (q, u) => { updates.push({ name, q, u }); return {}; } }),
    };
    const logs = [];
    const msgs = [];
    const res = await executeApproval(approval, { db, logToMemory: async (x) => logs.push(x), sendAdvisoryMessage: async (m) => msgs.push(m), env: { ORDER_EXECUTION_ENABLED: 'false' } });
    expect(res.status).toBe('simulated');
    expect(updates.find(u => u.u && u.u.$set && u.u.$set.status)).toBeTruthy();
    expect(msgs.length).toBeGreaterThan(0);
  });

  test('fails when execution enabled but missing API keys', async () => {
    const approval = { _id: 'a2', title: 'Sell test2', type: 'sell', coin: 'BTC', amount: 0.002 };
    const updates = [];
    const db = {
      collection: (name) => ({ updateOne: async (q, u) => { updates.push({ name, q, u }); return {}; } }),
    };
    const res = await executeApproval(approval, { db, logToMemory: async () => {}, sendAdvisoryMessage: async () => {}, env: { ORDER_EXECUTION_ENABLED: 'true' } });
    expect(res.status).toBe('failed');
    expect(res.error).toMatch(/credentials/);
  });

  test('places market sell order when enabled and creds provided', async () => {
    // mock ccxt
    jest.resetModules();
    jest.doMock('ccxt', () => {
      class FakeExchange {
        constructor(opts) { this.opts = opts; }
        async loadMarkets() { return; }
        async createMarketSellOrder(symbol, amount) { return { id: 'ord-1', symbol, amount }; }
        setSandboxMode() { /* noop */ }
      }
      return { coinbasepro: FakeExchange };
    });

    // re-require the module under test to pick up mocked ccxt
    const { executeApproval: exe } = require('../lib/execution');

    const approval = { _id: 'a3', title: 'Sell test3', type: 'sell', coin: 'BTC', amount: 0.003 };
    const updates = [];
    const db = {
      collection: (name) => ({ updateOne: async (q, u) => { updates.push({ name, q, u }); return {}; } }),
    };
    const res = await exe(approval, { db, logToMemory: async () => {}, sendAdvisoryMessage: async () => {}, env: { ORDER_EXECUTION_ENABLED: 'true', EXCHANGE_API_KEY: 'k', EXCHANGE_SECRET: 's', EXCHANGE_ID: 'coinbasepro' } });
    expect(res.status).toBe('executed');
    expect(res.orderResult).toBeTruthy();
    expect(res.orderResult.id).toBe('ord-1');
  });
});
