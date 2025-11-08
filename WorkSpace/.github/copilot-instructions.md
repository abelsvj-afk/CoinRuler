# CoinRuler Copilot Instructions

Repo-specific guidance for AI coding agents. Be concise, follow safety constraints, and use existing patterns.

## Big picture
- Monorepo: `apps/api` (Express REST), `apps/bot` (Discord + LLM), `apps/web` (Next.js); shared libs in `packages/` (`shared`, `rules`, `llm`, `security`, etc.).
- Flow: snapshot → analysis (Monte Carlo/ML/rules) → intents → approvals → (optional) execution → reports/alerts.
- MongoDB is primary persistence; API can run in degraded mode without DB.
- Real-time via SSE: `/live` emits approvals/alerts; internal `EventEmitter` fan-out.

## Safety & auth
- `DRY_RUN` defaults true and only disables if `OWNER_ID` is set (see `packages/shared/src/env.ts`).
- Protected mutations require `X-Owner-Id` (see `ownerAuth` in `apps/api/src/index.ts`). Never bypass this layer.
- Respect kill-switch (`kill_switch` collection + `/kill-switch` endpoints) when evaluating rules.

## Environment & integration
- Use `getEnv()/isDryRun()`; avoid direct `process.env` reads in app logic.
- Integrations (Coinbase/Discord/OpenAI) are optional; guard with `has*` helpers and degrade gracefully.
- CORS: comma-separated origins via `WEB_ORIGIN`/`NEXT_PUBLIC_WEB_ORIGIN` with wildcard-subdomain support.

## Key modules
- API: routes, schedulers, SSE, Mongo connect in `apps/api/src/index.ts`.
- Rules: parse/evaluate/backtest/optimize in `packages/rules` (intents → approvals).
- Shared: Monte Carlo, market intel, learning, logging, env guards in `packages/shared/src/*`.
- Security: credential rotation endpoints under `/rotation/*` using `packages/security`.

## Patterns
- Never execute trades directly; rules produce intents that create approvals. Execution is opt-in.
- Snapshot docs include `_prices`; exclude non-balance fields when building portfolio contexts.
- Alerts emitted as `{ type, severity, message, data, timestamp }` via `liveEvents.emit('alert', ...)`.
- Background work respects `LIGHT_MODE` and only runs when DB is connected.

## Build & run (PowerShell)
```powershell
npm install; npm run build
npm run dev -w apps/api   # API (ts-node)
npm run dev -w apps/bot   # Discord bot
cd apps/web; npm run dev  # Dashboard
```
- Docker (from `WorkSpace`): `docker-compose up --build`.
- Health: `GET /health`, diagnostics: `GET /health/full`, version: `GET /version`.

## Pitfalls
- Disabling DRY_RUN without OWNER_ID → forced back to true.
- Treating `_prices` as a coin when summing balances.
- CORS origin mismatches; verify exact or wildcard-subdomain rules.
- Ignoring kill-switch in schedulers/evaluations.

## Don’t
- Don’t log secrets or raw env values.
- Don’t block startup for missing optional integrations.
- Don’t merge features that skip approvals/execution safety.
