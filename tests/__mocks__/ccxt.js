class FakeExchange {
  constructor(opts) { this.opts = opts; }
  async loadMarkets() { return; }
  async createMarketSellOrder(symbol, amount) { return { id: 'mock-order', symbol, amount }; }
  async createOrder(symbol, type, side, amount) { return { id: 'mock-order', symbol, type, side, amount }; }
  setSandboxMode() { /* noop */ }
}

module.exports = { coinbasepro: FakeExchange };
