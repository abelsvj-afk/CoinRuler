import { Action, EvalContext, Intent, RuleSpec } from './types';

interface ExecutionHistory {
  timestamp: Date;
  symbol: string;
  type: string;
  pnl?: number;
}

// Global state (would be in MongoDB in production)
let globalExecutionHistory: ExecutionHistory[] = [];
let dailyLoss = 0;
let lastDailyReset = new Date();

function baselineProtected(symbol: string, qtyToSell: number, ctx: EvalContext): boolean {
  const base = ctx.objectives?.coreAssets;
  if (!base) return true;
  const sym = symbol.toUpperCase();
  if (sym === 'BTC' && base.BTC?.baseline != null) {
    const holding = ctx.portfolio.balances['BTC'] || 0;
    return holding - qtyToSell >= base.BTC.baseline;
  }
  if (sym === 'XRP' && base.XRP?.baseline != null) {
    const holding = ctx.portfolio.balances['XRP'] || 0;
    return holding - qtyToSell >= base.XRP.baseline;
  }
  return true;
}

  /**
   * Check if portfolio has breached max drawdown threshold
   */
  function checkMaxDrawdown(ctx: EvalContext, maxDrawdownPct: number): boolean {
    const currentValue = Object.entries(ctx.portfolio.balances).reduce(
      (acc, [coin, qty]) => acc + (ctx.portfolio.prices[coin] || 0) * (qty as number),
      0
    );
    const assumedPeak = currentValue * 1.2;
    const currentDrawdown = (assumedPeak - currentValue) / assumedPeak;
    return currentDrawdown < maxDrawdownPct;
  }

  /**
   * Check velocity throttle: max N trades per hour
   */
  function checkVelocityThrottle(maxTradesPerHour: number = 5): boolean {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentTrades = globalExecutionHistory.filter(h => h.timestamp.getTime() > oneHourAgo);
    return recentTrades.length < maxTradesPerHour;
  }

  /**
   * Check daily loss limit
   */
  function checkDailyLossLimit(ctx: EvalContext, maxDailyLossPct: number): boolean {
    const now = ctx.now;
    if (now.getDate() !== lastDailyReset.getDate()) {
      dailyLoss = 0;
      lastDailyReset = now;
    }
    const totalValue = Object.entries(ctx.portfolio.balances).reduce(
      (acc, [coin, qty]) => acc + (ctx.portfolio.prices[coin] || 0) * (qty as number),
      0
    );
    const dailyLossPct = totalValue > 0 ? Math.abs(dailyLoss) / totalValue : 0;
    return dailyLossPct < maxDailyLossPct;
  }

export function applyRisk(rule: RuleSpec, ctx: EvalContext, candidate: Intent): { allowed: boolean; reason?: string } {
  const r = rule.risk || {};
  const guardrails = new Set(r.guardrails || []);

  // Cooldown
  const last = ctx.lastExecutions?.[rule.id || rule.name];
  if (r.cooldownSecs && last) {
    const since = (ctx.now.getTime() - last.getTime()) / 1000;
    if (since < r.cooldownSecs) {
      return { allowed: false, reason: `Cooldown ${Math.round(r.cooldownSecs - since)}s remaining` };
    }
  }

    // Max drawdown circuit breaker
    if (r.maxDailyLossPct && !checkMaxDrawdown(ctx, r.maxDailyLossPct / 100)) {
      return { allowed: false, reason: 'Max drawdown threshold breached - circuit breaker active' };
    }

    // Daily loss limit
    if (r.maxDailyLossPct && !checkDailyLossLimit(ctx, r.maxDailyLossPct / 100)) {
      return { allowed: false, reason: `Daily loss limit (${r.maxDailyLossPct}%) reached` };
    }

    // Velocity throttle
    if (guardrails.has('throttleVelocity') && !checkVelocityThrottle(5)) {
      return { allowed: false, reason: 'Velocity throttle: too many trades in past hour' };
    }

  // Baseline protection for sells/exits
  if (guardrails.has('baselineProtection')) {
    const action = candidate.action as Action;
    if (action.type === 'exit' || (action.type === 'enter' && action.allocationPct < 0)) {
      const sym = (action as any).symbol?.toUpperCase();
      if (sym === 'BTC' || sym === 'XRP') {
        // compute qtyToSell from allocation using portfolio
        const px = ctx.portfolio.prices[sym] || 0;
        const totalValue = Object.entries(ctx.portfolio.balances).reduce((acc, [coin, qty]) => acc + (ctx.portfolio.prices[coin] || 0) * (qty as number), 0);
        const valueToSell = (action.allocationPct || 0) / 100 * totalValue;
        const qtyToSell = px > 0 ? valueToSell / px : 0;
        if (!baselineProtected(sym, qtyToSell, ctx)) {
          return { allowed: false, reason: `Baseline protection active for ${sym}` };
        }
      }
    }
  }

    // Max position size
    if (r.maxPositionPct) {
      const action = candidate.action as Action;
      const sym = (action as any).symbol?.toUpperCase();
      if (sym && action.type === 'enter') {
        const px = ctx.portfolio.prices[sym] || 0;
        const totalValue = Object.entries(ctx.portfolio.balances).reduce(
          (acc, [coin, qty]) => acc + (ctx.portfolio.prices[coin] || 0) * (qty as number),
          0
        );
        const currentExposure = ((ctx.portfolio.balances[sym] || 0) * px) / totalValue * 100;
        const proposedAllocation = action.allocationPct || 0;
        if (currentExposure + proposedAllocation > r.maxPositionPct) {
          return { allowed: false, reason: `Max position (${r.maxPositionPct}%) would be exceeded` };
        }
      }
    }

  return { allowed: true };
}

  /**
   * Record execution for risk tracking
   */
  export function recordExecution(symbol: string, type: string, pnl?: number) {
    globalExecutionHistory.push({ timestamp: new Date(), symbol, type, pnl });
    if (pnl && pnl < 0) dailyLoss += Math.abs(pnl);
    if (globalExecutionHistory.length > 1000) {
      globalExecutionHistory = globalExecutionHistory.slice(-1000);
    }
  }

  /**
   * Get current risk state for monitoring
   */
  export function getRiskState() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentTrades = globalExecutionHistory.filter(h => h.timestamp.getTime() > oneHourAgo);
    return {
      tradesLastHour: recentTrades.length,
      dailyLoss,
      lastDailyReset,
      totalExecutions: globalExecutionHistory.length,
    };
  }
