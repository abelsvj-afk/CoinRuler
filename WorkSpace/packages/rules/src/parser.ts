import { RuleSpec } from './types';

// For MVP, accept JSON RuleSpec as-is; future: implement shorthand parsing
export function parseRule(input: any): RuleSpec {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid rule: expected object');
  }
  // Basic validation
  if (!input.name || !input.trigger || !Array.isArray(input.conditions) || !Array.isArray(input.actions)) {
    throw new Error('Invalid rule: missing name/trigger/conditions/actions');
  }
  const rule: RuleSpec = {
    enabled: true,
    risk: { guardrails: ['baselineProtection'] },
    ...input,
  };
  return rule;
}
