#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error) {
    console.error(r.error);
    process.exit(2);
  }
  return r.stdout.trim();
}

// Get staged files
const stagedRaw = run('git', ['diff', '--name-only', '--cached']);
const staged = stagedRaw.split('\n').filter(Boolean);

if (staged.length === 0) {
  // nothing staged
  process.exit(0);
}

// Block committing .env files (secrets)
if (staged.includes('.env') || staged.some(f => f.endsWith('.env'))) {
  console.error('\n❌ Commit blocked: .env (or a file named .env) is staged.');
  console.error('   Move secrets to your environment or use .env.example, and do not commit private keys.');
  console.error('   To install a local git hook that enforces this check, run: scripts\\install-git-hooks.ps1');
  process.exit(1);
}

// Warn/Block large edits to bot_features.json to avoid accidental metadata mass-changes
if (staged.includes('bot_features.json')) {
  // get numstat for staged changes
  const numstat = run('git', ['diff', '--cached', '--numstat', '--', 'bot_features.json']);
  if (numstat) {
    // format: <added>\t<deleted>\t<file>\n
    const parts = numstat.split('\t');
    const added = parseInt(parts[0], 10) || 0;
    const deleted = parseInt(parts[1], 10) || 0;
    const changed = added + deleted;
    const THRESHOLD = 50;
    if (changed > THRESHOLD) {
      console.error(`\n❌ Commit blocked: bot_features.json changed by ${changed} lines (threshold ${THRESHOLD}).`);
      console.error('   Large metadata changes should be done via scripts/featureTracker.js or reviewed manually.');
      console.error('   If this is intentional, stage a smaller change or run the commit from a branch after review.');
      process.exit(1);
    }
  }
}

// All checks passed
process.exit(0);
