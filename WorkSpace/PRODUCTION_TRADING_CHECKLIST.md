# Production Trading Checklist

Use this checklist to safely enable live trading in CoinRuler.

1) Prerequisites
- Confirm OWNER_ID is set in .env and known to you.
- Create a fresh Coinbase API key (Advanced Trade) with trade permissions.
- Restrict Coinbase API key by IP where possible.
- Ensure MongoDB connection is stable (Atlas or self-hosted).

2) Configure Environment
- Copy `.env.example` to `.env` at repo root and in apps/api if you keep per-app envs.
- Set these keys:
  - OWNER_ID=<your-id>
  - COINBASE_API_KEY=<key>
  - COINBASE_API_SECRET=<secret>
  - DRY_RUN=true (keep true for smoke test)
  - WEB_ORIGIN (include your domains)
  - MONGODB_URI / DATABASE_NAME
  - Optional risk knobs (or accept defaults):
    - AUTO_EXECUTE_ENABLED=false
    - AUTO_EXECUTE_MAX_PER_TICK=1
    - AUTO_EXECUTE_RISK_MAX_TRADES_HOUR=4
    - AUTO_EXECUTE_DAILY_LOSS_LIMIT=-1000
    - MAX_SLIPPAGE_PCT=0.02

3) Smoke Test (DRY_RUN=true)
- Start API: npm run dev -w apps/api
- Hit:
  - GET /coinbase/status → status: connected, sample balances
  - GET /env → verify auto-exec and risk vars
  - POST /portfolio/snapshot/force → confirm snapshot stored
- POST a manual execution against a tiny amount via /approvals/:id/execute
  - Confirm SSE events (trade:submitted, trade:result)
  - Confirm document in `executions` collection

4) Enable Live Trading
- Set DRY_RUN=false (ensure OWNER_ID set)
- Keep AUTO_EXECUTE_ENABLED=false initially (manual only)
- Try one small live market order via manual execute endpoint
  - Verify order landed on Coinbase and balances updated

5) Enable Auto Execution (Optional)
- Set AUTO_EXECUTE_ENABLED=true
- Start with conservative limits: MAX_PER_TICK=1, RISK_MAX_TRADES_HOUR=2
- Monitor /risk/state, SSE alerts, and executions for an hour

6) Observability & Safety
- Monitor /health and /health/full
- Keep kill-switch endpoint handy: POST /kill-switch { enabled: true }
- Review logs for CORS fallback counts and adjust WEB_ORIGIN

7) Maintenance
- Rotate Coinbase API keys monthly (rotation scheduler can help)
- Regularly back up MongoDB
- Review risk knobs after a week of stable operation

If any step fails, revert DRY_RUN=true and investigate using /health/full, logs, and the `scripts/verify_api.js` utility.
