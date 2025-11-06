#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Engine, WorkflowDefinition } from '../index';
import { notify } from '../integrations/notifier';

function loadWorkflow(pathArg?: string): WorkflowDefinition {
  const path = resolve(process.cwd(), pathArg || 'workflows/self-debugger.json');
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw);
}

async function main() {
  const wfPath = process.argv[2];
  const workflow = loadWorkflow(wfPath);
  const engine = new Engine(workflow, { startedAt: new Date().toISOString() });
  const { results, context } = await engine.run();

  // Post summary
  const failures = results.filter(r => r.status === 'error');
  const warns = results.filter(r => r.status === 'warn');
  const ok = results.filter(r => r.status === 'success');

  const summary = [
    `Workflow '${workflow.name}' finished`,
    `OK: ${ok.length}, Warn: ${warns.length}, Error: ${failures.length}`,
  ].join(' | ');

  console.log('\n=== Workflow Summary ===');
  console.log(summary);

  await notify(summary + '\n' + '```json\n' + JSON.stringify({ results, context }, null, 2) + '\n```', {
    channels: ['console', 'discord'],
  });
}

main().catch(async (e) => {
  console.error('[workflow] fatal error:', e?.message || e);
  try { await notify(`[workflow] fatal error: ${e?.message || e}`); } catch {}
  process.exit(1);
});
