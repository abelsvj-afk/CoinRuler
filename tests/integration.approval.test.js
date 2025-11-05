const { executeApproval } = require('../lib/execution');

// Mocks for DB and messaging
function makeMockDb() {
  const updates = [];
  const inserts = [];
  return {
    updates,
    inserts,
    collection: (name) => ({
      updateOne: async (q, u) => { updates.push({ name, q, u }); return {}; },
      insertOne: async (doc) => { inserts.push({ name, doc }); return {}; },
      findOne: async (q) => null,
    }),
  };
}

describe('integration: approval lifecycle', () => {
  test('create, approve, execute (simulated)', async () => {
    const db = makeMockDb();
    const approval = { _id: 'int1', title: 'Sell test', type: 'sell', coin: 'BTC', amount: 0.01, status: 'pending' };
    // Simulate creation
    await db.collection('approvals').insertOne(approval);
    // Simulate approval
    approval.status = 'approved';
    // Simulate execution (ORDER_EXECUTION_ENABLED=false)
    const logs = [];
    const msgs = [];
    const res = await executeApproval(approval, { db, logToMemory: async (x) => logs.push(x), sendAdvisoryMessage: async (m) => msgs.push(m), env: { ORDER_EXECUTION_ENABLED: 'false' } });
    expect(res.status).toBe('simulated');
    expect(msgs.join(' ')).toMatch(/simulated/);
    expect(db.updates.some(u => u.name === 'approvals')).toBe(true);
  });

  test('create, approve, execute (mocked ccxt)', async () => {
    jest.resetModules();
    jest.doMock('ccxt', () => {
      class FakeExchange {
        constructor(opts) { this.opts = opts; }
        async loadMarkets() { return; }
        async createMarketSellOrder(symbol, amount) { return { id: 'ord-int', symbol, amount }; }
        setSandboxMode() { /* noop */ }
      }
      return { coinbasepro: FakeExchange };
    });
    const { executeApproval: exe } = require('../lib/execution');
    const db = makeMockDb();
    const approval = { _id: 'int2', title: 'Sell test', type: 'sell', coin: 'BTC', amount: 0.02, status: 'approved' };
    const logs = [];
    const msgs = [];
    const res = await exe(approval, { db, logToMemory: async (x) => logs.push(x), sendAdvisoryMessage: async (m) => msgs.push(m), env: { ORDER_EXECUTION_ENABLED: 'true', EXCHANGE_API_KEY: 'k', EXCHANGE_SECRET: 's', EXCHANGE_ID: 'coinbasepro', EXCHANGE_SANDBOX: 'true' } });
    expect(res.status).toBe('executed');
    expect(res.orderResult).toBeTruthy();
    expect(res.orderResult.id).toBe('ord-int');
    expect(msgs.join(' ')).toMatch(/executed/);
    expect(db.updates.some(u => u.name === 'approvals')).toBe(true);
  });
});
