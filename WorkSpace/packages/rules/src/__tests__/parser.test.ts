import { parseRule } from '../parser';

describe('Rule Parser', () => {
  it('should parse valid rule spec', () => {
    const spec = {
      name: 'Test Rule',
      enabled: true,
        trigger: { type: 'interval', every: '1h' },
      conditions: [
          { indicator: 'rsi', symbol: 'BTC', period: 14, lt: 30, gt: 70 },
      ],
      actions: [
        { type: 'enter', symbol: 'BTC', allocationPct: 10 },
      ],
      risk: {
        maxPositionPct: 20,
          cooldownSecs: 240 * 60,
      },
    };

    const result = parseRule(spec);
    expect(result).toEqual(spec);
  });

  it('should reject rule without name', () => {
    const spec = {
      enabled: true,
        trigger: { type: 'interval', every: '1h' },
      conditions: [],
      actions: [],
    };

    expect(() => parseRule(spec as any)).toThrow('name');
  });

  it('should reject rule without trigger', () => {
    const spec = {
      name: 'Test',
      enabled: true,
      conditions: [],
      actions: [],
    };

    expect(() => parseRule(spec as any)).toThrow('trigger');
  });

  it('should reject rule with invalid condition type', () => {
    const spec = {
      name: 'Test',
      enabled: true,
        trigger: { type: 'interval', every: '1h' },
        conditions: [{ indicator: 'invalid' as any, symbol: 'BTC' }],
      actions: [],
    };

    expect(() => parseRule(spec as any)).toThrow();
  });

  it('should reject rule with empty actions', () => {
    const spec = {
      name: 'Test',
      enabled: true,
        trigger: { type: 'interval', every: '1h' },
        conditions: [{ indicator: 'rsi', symbol: 'BTC', period: 14, lt: 30, gt: 70 }],
      actions: [],
    };

    expect(() => parseRule(spec)).toThrow('actions');
  });

  it('should accept price change condition', () => {
    const spec = {
      name: 'Price Surge',
      enabled: true,
        trigger: { type: 'interval', every: '5m' },
      conditions: [
          { priceChangePct: { symbol: 'BTC', windowMins: 60, gt: 5 } },
      ],
      actions: [
        { type: 'enter', symbol: 'BTC', allocationPct: 5 },
      ],
    };

    const result = parseRule(spec);
      expect((result.conditions[0] as any).priceChangePct).toBeDefined();
  });

  it('should accept portfolio exposure condition', () => {
    const spec = {
      name: 'Diversification',
      enabled: true,
      trigger: { type: 'interval', every: '1h' },
      conditions: [
        { portfolioExposure: { symbol: 'BTC', ltPct: 50 } },
      ],
      actions: [
        { type: 'rebalance', target: { BTC: 40, ETH: 30, USDC: 30 } },
      ],
    };

    const result = parseRule(spec);
     expect((result.conditions[0] as any).portfolioExposure).toBeDefined();
  });

  it('should accept volatility condition', () => {
    const spec = {
      name: 'High Vol Filter',
      enabled: true,
        trigger: { type: 'interval', every: '1h' },
      conditions: [
          { indicator: 'volatility', symbol: 'BTC', window: 20, gt: 10 },
      ],
      actions: [
        { type: 'exit', symbol: 'BTC' },
      ],
    };

    const result = parseRule(spec);
      expect((result.conditions[0] as any).indicator).toBe('volatility');
  });

  it('should accept SMA crossover condition', () => {
    const spec = {
      name: 'SMA Cross',
      enabled: true,
        trigger: { type: 'interval', every: '1h' },
      conditions: [
          { indicator: 'sma', symbol: 'BTC', period: 50, gt: 69000 },
      ],
      actions: [
        { type: 'enter', symbol: 'BTC', allocationPct: 15 },
      ],
    };

    const result = parseRule(spec);
      expect((result.conditions[0] as any).indicator).toBe('sma');
  });

  it('should accept risk spec with all parameters', () => {
    const spec = {
      name: 'Conservative',
      enabled: true,
        trigger: { type: 'interval', every: '1h' },
      conditions: [
          { indicator: 'rsi', symbol: 'BTC', period: 14, lt: 30, gt: 70 },
      ],
      actions: [
        { type: 'enter', symbol: 'BTC', allocationPct: 5 },
      ],
      risk: {
        maxPositionPct: 10,
          cooldownSecs: 480 * 60,
          guardrails: ['baselineProtection'],
      },
    };

    const result = parseRule(spec);
      expect(result.risk?.guardrails).toContain('baselineProtection');
      expect(result.risk?.cooldownSecs).toBe(480 * 60);
  });
});
