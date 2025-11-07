// Light-weight indicator helpers (data must be supplied by caller)

export function rsi(closes: number[], period = 14): number | undefined {
  if (!closes || closes.length < period + 1) return undefined;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const rs = losses === 0 ? 100 : gains / (losses || 1e-9);
  const rsi = 100 - 100 / (1 + rs);
  return Math.max(0, Math.min(100, rsi));
}

export function sma(closes: number[], period: number): number | undefined {
  if (!closes || closes.length < period) return undefined;
  const slice = closes.slice(-period);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / period;
}

export function volatility(closes: number[], window = 30): number | undefined {
  if (!closes || closes.length < window) return undefined;
  const slice = closes.slice(-window);
  const mean = slice.reduce((a, b) => a + b, 0) / window;
  const variance = slice.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / window;
  return Math.sqrt(variance) / mean; // coefficient of variation
}
