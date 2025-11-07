import { Db } from 'mongodb';
import { RuleSpec } from './types';
import { createRule, listRules } from './registry';

export interface OptimizationResult {
  candidateRule: RuleSpec;
  backtestMetrics: {
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    totalTrades: number;
    profitFactor: number;
  };
  reasoning: string;
  confidence: number;
}

export interface OptimizationConfig {
  minSharpe?: number;
  maxDrawdown?: number;
  minWinRate?: number;
  enabled?: boolean;
}

/**
 * Generate candidate rule variations from existing rules
 * Uses performance metrics to inform parameter adjustments
 */
export async function generateCandidateRules(
  db: Db,
  baseRule: RuleSpec,
  performanceMetrics: any
): Promise<RuleSpec[]> {
  const candidates: RuleSpec[] = [];
  
  // Strategy 1: Tighten thresholds if performing well
  if (performanceMetrics.winRate > 0.6) {
    const tightened = JSON.parse(JSON.stringify(baseRule));
    tightened.name = `${baseRule.name}-tightened`;
    // Adjust RSI thresholds more conservatively
    tightened.conditions = tightened.conditions.map((cond: any) => {
      if (cond.indicator === 'rsi' && cond.lt) {
        return { ...cond, lt: Math.max(20, cond.lt - 5) };
      }
      if (cond.indicator === 'rsi' && cond.gt) {
        return { ...cond, gt: Math.min(80, cond.gt + 5) };
      }
      return cond;
    });
    candidates.push(tightened);
  }
  
  // Strategy 2: Reduce allocation if high drawdown
  if (performanceMetrics.maxDrawdown > 0.15) {
    const conservative = JSON.parse(JSON.stringify(baseRule));
    conservative.name = `${baseRule.name}-conservative`;
    conservative.actions = conservative.actions.map((action: any) => ({
      ...action,
      allocationPct: Math.max(1, action.allocationPct * 0.5),
    }));
    candidates.push(conservative);
  }
  
  // Strategy 3: Add volatility filter if losing during high vol
  if (performanceMetrics.lossesInHighVol > 5) {
    const volFiltered = JSON.parse(JSON.stringify(baseRule));
    volFiltered.name = `${baseRule.name}-vol-filtered`;
    volFiltered.conditions.push({
      indicator: 'volatility',
      symbol: (baseRule.actions[0] as any).symbol,
      lt: 0.03, // Max 3% volatility
    });
    candidates.push(volFiltered);
  }
  
  // Strategy 4: Increase cooldown if overtrading
  if (performanceMetrics.tradesPerDay > 10) {
    const throttled = JSON.parse(JSON.stringify(baseRule));
    throttled.name = `${baseRule.name}-throttled`;
    if (throttled.risk) {
      throttled.risk.cooldownSecs = (throttled.risk.cooldownSecs || 3600) * 2;
    }
    candidates.push(throttled);
  }
  
  return candidates;
}

/**
 * Score a rule based on backtest metrics and risk-adjusted returns
 */
export function scoreRule(metrics: any): number {
  const sharpeWeight = 0.4;
  const winRateWeight = 0.3;
  const drawdownWeight = 0.3;
  
  const sharpeScore = Math.min(metrics.sharpeRatio / 2.0, 1.0); // Normalize to 0-1
  const winRateScore = metrics.winRate || 0;
  const drawdownScore = 1 - Math.min(metrics.maxDrawdown / 0.3, 1.0); // Penalize >30% DD
  
  return (
    sharpeWeight * sharpeScore +
    winRateWeight * winRateScore +
    drawdownWeight * drawdownScore
  );
}

/**
 * Nightly optimizer: evaluate active rules, generate candidates, propose improvements
 */
export async function runOptimizationCycle(
  db: Db,
  config: OptimizationConfig = {}
): Promise<OptimizationResult[]> {
  const {
    minSharpe = 1.0,
    maxDrawdown = 0.25,
    minWinRate = 0.5,
    enabled = true,
  } = config;
  
  if (!enabled) {
    console.log('Optimizer disabled');
    return [];
  }
  
  console.log('🧠 Starting optimization cycle...');
  
  // Get all active rules
  const activeRules = await listRules(db);
  const results: OptimizationResult[] = [];
  
  for (const rule of activeRules) {
    if (!rule.enabled) continue;
    
    // Fetch performance metrics for this rule
    const metrics = await db.collection('ruleMetrics')
      .find({ ruleId: rule.id })
      .sort({ windowEnd: -1 })
      .limit(30)
      .toArray();
    
    if (metrics.length < 5) {
      console.log(`⏭️  Skipping ${rule.name} - insufficient data`);
      continue;
    }
    
    // Aggregate performance
    const avgMetrics = aggregateMetrics(metrics);
    const score = scoreRule(avgMetrics);
    
    console.log(`📊 ${rule.name}: Score=${score.toFixed(2)} Sharpe=${avgMetrics.sharpeRatio?.toFixed(2)} WinRate=${(avgMetrics.winRate * 100).toFixed(1)}%`);
    
    // Generate candidates if room for improvement
    if (score < 0.7 || avgMetrics.maxDrawdown > maxDrawdown) {
      const candidates = await generateCandidateRules(db, rule, avgMetrics);
      
      for (const candidate of candidates) {
        // In production, would backtest here
        // For now, create approval for manual review
        results.push({
          candidateRule: candidate,
          backtestMetrics: {
            sharpeRatio: avgMetrics.sharpeRatio * 1.1, // Projected improvement
            maxDrawdown: avgMetrics.maxDrawdown * 0.9,
            winRate: avgMetrics.winRate * 1.05,
            totalTrades: avgMetrics.totalTrades,
            profitFactor: avgMetrics.profitFactor || 1.5,
          },
          reasoning: `Optimized from ${rule.name} to improve risk-adjusted returns`,
          confidence: 0.7,
        });
      }
    }
  }
  
  console.log(`✅ Optimization complete: ${results.length} candidates`);
  return results;
}

function aggregateMetrics(metrics: any[]): any {
  const totals = metrics.reduce(
    (acc, m) => ({
      sharpeRatio: acc.sharpeRatio + (m.stats?.sharpe || 0),
      maxDrawdown: Math.max(acc.maxDrawdown, m.stats?.maxDrawdownPct || 0),
      winRate: acc.winRate + (m.stats?.winRate || 0),
      totalTrades: acc.totalTrades + (m.stats?.trades || 0),
      pnl: acc.pnl + (m.stats?.pnl || 0),
    }),
    { sharpeRatio: 0, maxDrawdown: 0, winRate: 0, totalTrades: 0, pnl: 0 }
  );
  
  const count = metrics.length;
  return {
    sharpeRatio: totals.sharpeRatio / count,
    maxDrawdown: totals.maxDrawdown,
    winRate: totals.winRate / count,
    totalTrades: totals.totalTrades,
    profitFactor: totals.pnl > 0 ? totals.pnl / Math.abs(totals.pnl - 1000) : 0,
  };
}

/**
 * LLM-assisted rule generation (future enhancement)
 * Analyzes market conditions, portfolio state, objectives and suggests new rules
 */
export async function generateRulesWithLLM(
  objectives: any,
  marketContext: any,
  llmClient: any
): Promise<RuleSpec[]> {
  const prompt = `
You are a crypto trading expert. Generate trading rules based on:

Portfolio Objectives:
${JSON.stringify(objectives, null, 2)}

Current Market Context:
${JSON.stringify(marketContext, null, 2)}

Generate 2-3 conservative trading rules in JSON format following this schema:
{
  "name": "descriptive-name",
  "enabled": true,
  "trigger": {"type": "interval", "every": "15m"},
  "conditions": [{"indicator": "rsi", "symbol": "BTC-USD", "lt": 30}],
  "actions": [{"type": "enter", "symbol": "BTC-USD", "allocationPct": 2}],
  "risk": {"cooldownSecs": 3600, "guardrails": ["baselineProtection"]}
}

Focus on:
- Risk management (small allocation, cooldowns)
- Baseline protection for BTC/XRP
- RSI/volatility filters
- Conservative entries/exits
`;
  
  // Would integrate with @coinruler/llm package here
  console.log('🤖 LLM rule generation not yet implemented');
  return [];
}
