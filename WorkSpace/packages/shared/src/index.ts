export type Health = { ok: boolean };
export type Status = { status: string; ts: string };

export * from './types';
export * from './monteCarlo';
export * from './priceFeed';
export * from './selfHealing';
export * from './coinbaseApi';
export * from './mlLearning';
export * from './marketIntelligence';
export * from './env';
export * from './logger';
export * from './tradeExecution';

export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
