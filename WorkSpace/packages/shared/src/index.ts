export type Health = { ok: boolean };
export type Status = { status: string; ts: string };

export * from './types';
export * from './monteCarlo';
export * from './priceFeed';
export * from './selfHealing';

export function formatUSD(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}
