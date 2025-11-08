/**
 * BTC Health Badge Logic
 * Computes utilization ratio and health status
 */

export type BtcBalance = {
  asset: 'BTC';
  available: number;
  locked: number; // collateral/hold
  total: number;
};

export type HealthBadge = {
  label: string;
  tone: 'neutral' | 'info' | 'warning' | 'critical' | 'success';
  tooltip: string;
};

export function getBtcHealth(b: BtcBalance): HealthBadge {
  const ratio = b.total > 0 ? b.locked / b.total : 0;

  if (b.total === 0) {
    return {
      label: 'No BTC',
      tone: 'neutral',
      tooltip: 'No BTC detected in Coinbase. If you do hold BTC, check API auth/scopes.',
    };
  }

  if (b.locked === 0) {
    return {
      label: 'Unencumbered',
      tone: 'success',
      tooltip: 'No collateral hold detected. All BTC is available.',
    };
  }

  if (ratio >= 0.85) {
    return {
      label: 'High Utilization',
      tone: 'critical',
      tooltip: `~${(ratio * 100).toFixed(0)}% of BTC is locked as collateral. Consider reducing risk or adding BTC to improve headroom.`,
    };
  }

  if (ratio >= 0.5) {
    return {
      label: 'Moderate Collateral',
      tone: 'warning',
      tooltip: `~${(ratio * 100).toFixed(0)}% locked. You have some buffer but monitor volatility.`,
    };
  }

  return {
    label: 'Collateralized',
    tone: 'info',
    tooltip: `~${(ratio * 100).toFixed(0)}% of BTC is currently on hold as collateral.`,
  };
}
