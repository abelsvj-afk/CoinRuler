export type Trigger =
  | { type: 'interval'; every: string } // cron-ish like "15m", "1h"
  | { type: 'event'; name: string };

export type Condition =
  | { indicator: 'rsi'; symbol: string; lt?: number; gt?: number; period?: number }
  | { indicator: 'volatility'; symbol: string; lt?: number; gt?: number; window?: number }
  | { indicator: 'sma'; symbol: string; period: number; lt?: number; gt?: number }
  | { portfolioExposure: { symbol: string; ltPct?: number; gtPct?: number } }
  | { priceChangePct: { symbol: string; windowMins: number; lt?: number; gt?: number } };

export type Action =
  | { type: 'enter'; symbol: string; allocationPct: number; orderType?: 'market' | 'limit'; slippageMaxPct?: number }
  | { type: 'exit'; symbol: string; allocationPct?: number; orderType?: 'market' | 'limit' }
  | { type: 'rebalance'; target: Record<string, number> };

export interface RiskSpec {
  maxPositionPct?: number;
  maxDailyLossPct?: number;
  guardrails?: Array<'circuitDrawdown' | 'throttleVelocity' | 'baselineProtection'>;
  cooldownSecs?: number; // minimum time between executions
}

export interface RuleSpec {
  id?: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
  risk?: RiskSpec;
  meta?: Record<string, any>;
}

export interface PortfolioState {
  balances: Record<string, number>; // e.g., { BTC: 1.23, XRP: 1000, USDC: 500 }
  prices: Record<string, number>;   // e.g., { BTC: 69000, XRP: 0.55 }
}

export interface Objectives {
  coreAssets: {
    BTC?: { baseline: number; autoIncrementOnDeposit?: boolean };
    XRP?: { baseline: number; minTokens?: number; autoIncrementOnDeposit?: boolean };
  };
  dryRunDefault?: boolean;
  approvalsRequired?: {
    newCoin?: boolean; // Always require approval for coins not in coreAssets
    staking?: boolean; // Require approval for staking suggestions
    largeTradeUsd?: number; // Require approval for trades above this USD value
    collateralChange?: boolean; // Require approval for collateral changes
  };
  autoExecuteCoreAssets?: boolean; // If true, BTC/XRP trades execute without approval
}

export interface EvalContext {
  now: Date;
  portfolio: PortfolioState;
  objectives?: Objectives;
  lastExecutions?: Record<string, Date>; // ruleId -> last time executed
  marketData?: any; // room for OHLCV, sentiment, etc.
}

export type Intent = {
  ruleId: string;
  action: Action;
  reason: string;
  dryRun: boolean;
  createdAt: Date;
};
