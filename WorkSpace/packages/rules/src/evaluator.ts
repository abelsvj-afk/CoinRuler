import { Db } from 'mongodb';
import { Condition, EvalContext, Intent, RuleSpec } from './types';
import { listRules } from './registry';
import { applyRisk } from './risk';

function checkCondition(cond: Condition, ctx: EvalContext): boolean {
  if ((cond as any).portfolioExposure) {
    const { symbol, ltPct, gtPct } = (cond as any).portfolioExposure;
    const sym = symbol.toUpperCase();
    const px = ctx.portfolio.prices[sym] || 0;
    const totalValue = Object.entries(ctx.portfolio.balances).reduce((acc, [coin, qty]) => acc + (ctx.portfolio.prices[coin] || 0) * (qty as number), 0) || 1;
    const exposure = ((ctx.portfolio.balances[sym] || 0) * px) / totalValue * 100;
    if (ltPct != null && !(exposure < ltPct)) return false;
    if (gtPct != null && !(exposure > gtPct)) return false;
    return true;
  }
  if ((cond as any).priceChangePct) {
    // For MVP, assume marketData includes a computed change
    const { symbol, lt, gt } = (cond as any).priceChangePct;
    const change = ctx.marketData?.priceChangePct?.[symbol.toUpperCase()] as number | undefined;
    if (change == null) return false;
    if (lt != null && !(change < lt)) return false;
    if (gt != null && !(change > gt)) return false;
    return true;
  }
  // TODO: indicators (rsi, sma, volatility) using ctx.marketData.OHLCV
  return true; // optimistic until we wire full data
}

function allConditionsPass(rule: RuleSpec, ctx: EvalContext): boolean {
  return rule.conditions.every((c) => checkCondition(c, ctx));
}

export async function evaluateRulesTick(db: Db, ctx: EvalContext): Promise<Intent[]> {
  const rules = (await listRules(db)).filter((r) => r.enabled);
  const intents: Intent[] = [];
  for (const rule of rules) {
    if (!allConditionsPass(rule, ctx)) continue;
    for (const action of rule.actions) {
      const symbol = (action as any).symbol?.toUpperCase();
      const isCoreAsset = symbol === 'BTC' || symbol === 'XRP';
      
      // Determine if this needs approval
      const requiresApproval = !isCoreAsset || !ctx.objectives?.autoExecuteCoreAssets;
      
      const intent: Intent = {
        ruleId: rule.id || rule.name,
        action,
        reason: 'conditions-met',
        dryRun: requiresApproval, // Core assets can auto-execute if configured
        createdAt: ctx.now,
      };
      const risk = applyRisk(rule, ctx, intent);
      if (!risk.allowed) continue;
      intents.push(intent);
    }
  }
  return intents;
}
