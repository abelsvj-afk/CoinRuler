import { Action, EvalContext, Intent, RuleSpec } from './types';

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

  // TODO: implement maxPositionPct, maxDailyLossPct, throttleVelocity with execution history
  return { allowed: true };
}
