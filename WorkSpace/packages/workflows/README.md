# @coinruler/workflows

An n8n-style lightweight workflow and self-debugger engine for CoinRuler.

- Define simple JSON workflows with nodes (httpProbe, runCommand, portGuard, notify)
- Run via CLI to check health, run tests, and notify via Discord
- Designed to integrate with the existing system and Windows PowerShell environment

## Quick start

1. Build the package:

```bash
npm run build -w packages/workflows
```

2. Run the default self-debugger workflow:

```bash
npm run start -w packages/workflows
# or
npx coinruler-workflow
```

3. Customize the workflow in `workflows/self-debugger.json`.

## Node types

- httpProbe: Probe an HTTP endpoint and validate status
- runCommand: Execute a shell command or Node script (captures stdout/stderr)
- portGuard: Check if a port is free and suggest a Windows-friendly fix command
- notify: Send a summary to Discord webhook (env: DISCORD_MONITOR_WEBHOOK or DISCORD_WEBHOOK_URL) and console

## Environment

- DISCORD_MONITOR_WEBHOOK or DISCORD_WEBHOOK_URL: Discord webhook for notifications

## Notes

- This is the first iteration; more node types (lint, test, git status, SSE checks) can be added easily.
- To auto-fix ports, copy the suggested command from the node result or add an `autoFixCommand` to the node config.
