# CoinRuler Navigation Guide

This guide helps you navigate CoinRuler’s codebase and features.

## Entry Points

- API Server: `WorkSpace/apps/api/src/index.ts`
- Web Dashboard: `WorkSpace/apps/web` (Next.js, `/app` directory)
- Discord Bot: `WorkSpace/apps/bot/src/index.ts`
- Rules Engine: `WorkSpace/packages/rules/src`

## What To Run Locally

- Start API: `npm start -w apps/api`
- Start Web: `npm start -w apps/web`
- Start Bot: `npm start -w apps/bot`

Note: Set `MONGODB_URI` in `.env` before starting the API.

## Live URLs (when running)

- Health: `http://localhost:3001/health`
- Full Health: `http://localhost:3001/health/full`
- SSE Events: `http://localhost:3001/live`
- Dashboard: `http://localhost:3000`

## Web Dashboard

- Dashboard Overview: `/`
- Portfolio: `/portfolio`
- Approvals: `/approvals`
- Alerts: `/alerts`
- Rotation (keys): `/rotation`
- Commands: `/commands`
- Chat: `/chat`

On login, a welcome modal explains key sections; you can disable it via “Don’t show next time”.

## Discord Commands

- `/status` — API status
- `/approvals` — List pending approvals
- `/approve <id>` — Approve trade
- `/decline <id>` — Decline trade
- `/panic` — Activate kill switch
- `/resume` — Resume trading
- `/advice [prompt]` — Get AI advice
- `/rotation-*` — Credential rotation commands

Configure `.env` for the bot: `DISCORD_BOT_TOKEN`, `API_BASE_URL`, `OWNER_ID`.

## Rules Engine

- Write rules using JSON DSL (see `WorkSpace/RULES_ENGINE_GUIDE.md`)
- Evaluated every 60 seconds
- BTC/XRP auto-execute when enabled in objectives
- Non-core assets require approval

## Performance & Risk

- Performance monitor runs every 5 minutes
- Alerts on low Sharpe/WinRate or high drawdown
- Risk state at `/risk/state`

## Optimizer & Backtesting

- Trigger optimizer: `POST /rules/optimize`
- Backtest a rule: `POST /rules/:id/backtest`
- Nightly optimizer runs 2 AM UTC

## Data & Collections (MongoDB)

- `rules`, `ruleMetrics`, `backtestResults`
- `approvals`, `snapshots`, `objectives`, `state`
- `systemHealth` (self-diagnostics)

## Webhooks & Deposits

- Deposit snapshots: `POST /portfolio/snapshot` (set `isDeposit: true` to auto-increment baselines)
- Collateral webhooks: planned (`/webhook/collateral`)

## Folder Structure Notes

Legacy files exist at repo root (`lib/`, `src/`, `web/`). The authoritative code lives under `WorkSpace/` monorepo. Treat root-level code as legacy/reference.

## Troubleshooting

- API won’t start: Check `MONGODB_URI` and logs at `/health/full`
- SSE not streaming: Ensure browser stays connected to `/live`
- Discord bot not responding: Check token, intents, and `API_BASE_URL`

