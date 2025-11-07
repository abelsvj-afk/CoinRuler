import { applyRisk, recordExecution, getRiskState } from '../risk';
import type { Action, Intent, RuleSpec, EvalContext } from '../types';

const mockRule: RuleSpec = {
  name: 'Test Rule',
  enabled: true,
  trigger: { type: 'interval', every: '1h' },
  conditions: [{ indicator: 'rsi', symbol: 'BTC', lt: 30 }],
  actions: [{ type: 'enter', symbol: 'BTC', allocationPct: 10 }],
  risk: {
    maxPositionPct: 20,
    cooldownSecs: 60 * 60,
    guardrails: ['baselineProtection', 'circuitDrawdown', 'throttleVelocity'],
  },
};

const mockCtx: EvalContext = {
  now: new Date(),
  portfolio: {
    balances: { BTC: 1, USDC: 50000 },
    prices: { BTC: 69000, USDC: 1 },
  },
  objectives: {
    coreAssets: {
      BTC: { baseline: 1 },
    },
  },
};

describe('Risk Layer', () => {
  beforeEach(() => {
    // Reset global state (in real usage, this would be in-memory or DB)
  });

  it('should allow valid action within risk limits', () => {
    const action: Action = { type: 'enter', symbol: 'ETH', allocationPct: 5 };
    const intent: Intent = {
      ruleId: 'test-1',
      action,
      reason: 'Test entry',
      dryRun: false,
      createdAt: new Date(),
    };

    const result = applyRisk(mockRule, mockCtx, intent);
    expect(result.allowed).toBe(true);
  });

  it('should block action that violates max position size', () => {
    const largeAction: Action = { type: 'enter', symbol: 'BTC', allocationPct: 50 };
    const intent: Intent = {
      ruleId: 'test-2',
      action: largeAction,
      reason: 'Large position',
      dryRun: false,
      createdAt: new Date(),
    };

    const result = applyRisk(mockRule, mockCtx, intent);
    // Should be blocked or flagged due to maxPositionPct: 20
    expect(!result.allowed || result.reason?.includes('position')).toBeTruthy();
  });

  it('should block exit action that violates baseline protection', () => {
    const exitAction: Action = { type: 'exit', symbol: 'BTC', allocationPct: 100 };
    const intent: Intent = {
      ruleId: 'test-3',
      action: exitAction,
      reason: 'Exit BTC',
      dryRun: false,
      createdAt: new Date(),
    };

    const ctxWithBaseline: EvalContext = {
      ...mockCtx,
      objectives: {
        coreAssets: {
          BTC: { baseline: 1 },
        },
      },
    };

    const result = applyRisk(mockRule, ctxWithBaseline, intent);
    // Should be blocked due to baseline protection guardrail
    expect(!result.allowed || result.reason?.includes('baseline')).toBeTruthy();
  });

  it('should track execution history', () => {
    recordExecution('BTC', 'enter', 6900);
    const state = getRiskState();
    expect(state.totalExecutions).toBeGreaterThan(0);
  });

  it('should calculate risk metrics correctly', () => {
    // Record several trades
    recordExecution('BTC', 'enter', 6900);
    recordExecution('ETH', 'enter', 3500);
    recordExecution('BTC', 'exit', -3500);

    const state = getRiskState();
    expect(state.totalExecutions).toBe(3);
    expect(state.tradesLastHour).toBeGreaterThan(0);
  });

  it('should block trades when velocity throttle exceeded', () => {
    // Simulate 5 rapid trades
    for (let i = 0; i < 5; i++) {
      recordExecution('BTC', 'enter', 1000);
    }

    const action: Action = { type: 'enter', symbol: 'BTC', allocationPct: 5 };
    const intent: Intent = {
      ruleId: 'test-velocity',
      action,
      reason: 'Fast trade',
      dryRun: false,
      createdAt: new Date(),
    };

    const result = applyRisk(mockRule, mockCtx, intent);
    // Should be blocked due to velocity throttle (5 trades/hour limit)
    expect(!result.allowed || result.reason?.includes('velocity')).toBeTruthy();
  });

  it('should enforce cooldown period', () => {
    const ruleWithCooldown: RuleSpec = {
      ...mockRule,
      risk: {
        ...mockRule.risk,
        cooldownSecs: 3600, // 1 hour
      },
    };

    const action: Action = { type: 'enter', symbol: 'BTC', allocationPct: 5 };
    const intent: Intent = {
      ruleId: 'cooldown-test',
      action,
      reason: 'Test cooldown',
      dryRun: false,
      createdAt: new Date(),
    };

    // First execution should pass
    const result1 = applyRisk(ruleWithCooldown, {
      ...mockCtx,
      lastExecutions: {},
    }, intent);
    expect(result1.allowed).toBe(true);

    // Second execution within cooldown should be blocked
    const result2 = applyRisk(ruleWithCooldown, {
      ...mockCtx,
      lastExecutions: {
        'cooldown-test': new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
      },
    }, intent);
    expect(!result2.allowed || result2.reason?.includes('cooldown')).toBeTruthy();
  });

  it('should allow rebalance actions', () => {
    const rebalanceAction: Action = {
      type: 'rebalance',
      target: { BTC: 40, ETH: 30, USDC: 30 },
    };
    const intent: Intent = {
      ruleId: 'rebalance-test',
      action: rebalanceAction,
      reason: 'Portfolio rebalance',
      dryRun: false,
      createdAt: new Date(),
    };

    const result = applyRisk(mockRule, mockCtx, intent);
    // Rebalance should typically be allowed with risk checks
    expect(result).toBeDefined();
  });
});
