# ExecuteTrade Refactor Plan

Current State:
Inline simplified `executeTrade` lives in `apps/api/src/index.ts` to avoid cross-package rootDir issues. Dry-run unit test passes. Market orders only; limit orders unimplemented; risk gating minimal.

Goal:
Move `executeTrade` back into `packages/shared` as the single source of truth, consumed cleanly by `@coinruler/api` without rootDir errors, and expand functionality (limit orders + risk checks).

Phased Plan:
1. Shared Module Hardening
   - Enhance `packages/shared/src/tradeExecution.ts` with:
     - Unified interface: `executeTrade({ side, symbol, amount, mode, limitPrice, reason, riskContext })`.
     - Add risk pre-checks (daily loss, trades/hour, collateral health, kill-switch) behind optional flags.
     - Implement limit order placement via Coinbase Advanced Trade: POST brokerage order w/ IOC or GTC, capture orderId & fills.
     - Provide discriminated union result: `{ ok: true, order: {...} } | { ok: false, code, error }`.
   - Export types in `tradeExecution.ts` for strong typing across packages.

2. Build & Types Isolation
   - Ensure each package builds to its own `dist` directory (`tsconfig.json` with `outDir` already present for API; add for all packages if missing).
   - Run `npm run build` at root so `@coinruler/shared` produces `dist/index.js` + `dist/index.d.ts`.
   - Consumers (API) import from package entry (`@coinruler/shared`) relying on compiled output, not source.

3. API Tsconfig Adjustment
   Option A (Simplest): Remove `rootDir` from `apps/api/tsconfig.json` so TypeScript can include external package source if necessary.
   Option B (Preferred): Keep `rootDir: src` and only reference compiled artifacts—no source imports—ensuring no out-of-rootDir issues.
   Action: After shared build, replace inline `executeTrade` with `import { executeTrade } from '@coinruler/shared'`.

4. Inline Removal & Migration
   - Delete inline implementation in `index.ts`.
   - Remove now-empty `trading.ts` file entirely.
   - Run build; confirm no rootDir errors. If they appear, apply Option A (remove rootDir) and re-build.

5. Expanded Risk Integration
   - Pass a `riskContext` from API scheduler containing: `tradesLastHour`, `dailyPnl`, `collateralLtv`, `killSwitchEnabled`.
   - In shared module, short-circuit with explicit error codes (`RISK_THROTTLED`, `KILL_SWITCH`, `DAILY_LOSS_LIMIT`, `LTV_BREACH`).

6. Limit Orders Implementation
   - Support `mode: 'limit'` with required `limitPrice`.
   - Validate price tolerance (e.g. |spot - limit| / spot <= MAX_SLIPPAGE_PCT env variable).
   - For dry-run: simulate immediate fill if limit better than current spot; else return `status: 'open'`.

7. Observability & Auditing
   - Emit structured events: `trade:submitted`, `trade:filled`, `trade:rejected` through existing SSE channel.
   - Record full order payload and risk decisions in `executions` collection (add fields: `riskAccepted`, `checks` array).

8. Testing Strategy
   - Unit: shared `tradeExecution` tests (dry-run market, dry-run limit good price, insufficient balance, risk throttle).
   - Integration: API endpoint `/approvals/:id/execute` executes real dry-run and records execution doc.
   - Add mock Coinbase client for deterministic tests.

9. Rollout Steps
   - Implement shared enhancements (dry-run only) → build → API import → tests green.
   - Enable risk gating → tests.
   - Implement limit orders → tests.
   - Remove inline fallback and obsolete docs.
   - Set `DRY_RUN=false` in staging with tiny notional (e.g. 0.0005 BTC) and manual approval.

10. Post-Refactor Clean-Up
   - Update README + REALTIME_SYSTEM_GUIDE to reflect centralized trade module.
   - Add `.env.example` entries: `MAX_SLIPPAGE_PCT`, `DAILY_LOSS_LIMIT`, `RISK_MAX_TRADES_HOUR`.
   - Remove any commented legacy trade snippets from `index.ts`.

Edge Cases to Cover:
- Zero or negative amount.
- Sell amount > available balance.
- Limit price far from spot (reject).
- Kill-switch active mid-scheduler tick.
- Daily loss crossing limit during consecutive auto trades.
- Coinbase API transient error (network timeout) – retry with backoff (optional future).

Success Criteria:
- API imports shared `executeTrade` without rootDir errors.
- Trade execution returns consistent structured result (dry-run & real).
- Risk & limit logic test coverage > minimal thresholds (≥4 key scenarios).
- No inline trade logic remains in API.
- Production toggle achievable by setting `DRY_RUN=false` safely.

Rollback Plan:
If shared import causes build errors in API:
1. Revert API `index.ts` commit restoring inline implementation.
2. Investigate tsconfig `rootDir` adjustments or switch to compiled `dist` imports only.
3. Re-attempt after fix.

Timeline (Suggested):
- Day 1: Shared enhancements (market + risk) + migration.
- Day 2: Limit + tests + docs.
- Day 3: Staging live dry-run verification & production readiness checklist.

---
Generated: 2025-11-07
