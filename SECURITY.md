# Security & Operational Safety

This document covers credential rotation, automated security controls, schedulers, and best practices for running CoinRuler safely in production. Rotate credentials promptly if you suspect exposure or when personnel change.

---

## 1. Credential Rotation Subsystem

The API exposes endpoints and a scheduler to enforce rotation policies per service.

Endpoints:
- `GET /rotation/status` – summary & recent rotation attempts
- `GET /rotation/policy/:service` – fetch policy (service examples: COINBASE, DISCORD, MONGODB)
- `PUT /rotation/policy/:service` – update or create policy
- `POST /rotation/rotate/:service` – force immediate rotation attempt
- `GET /rotation/scheduler` – runtime scheduler status
- `POST /rotation/scheduler/check` – manual on-demand policy check

Environment Variables:
- `ROTATION_SCHEDULER_ENABLED=true|false` (default true)
- `LIGHT_MODE=true|false` (disables schedulers when true)

Recommended Policy Fields:
```json
{
  "intervalDays": 30,
  "preRotateNotifyDays": 3,
  "graceHours": 2,
  "cooldownDays": 7,
  "notifyChannels": ["sse"],
  "autoRevokeOld": true
}
```

Lifecycle:
1. Check policy schedule.
2. Generate & validate new credential (connectivity test, minimal queries).
3. Enter grace period (old credential still valid) – alerts broadcast.
4. Swap secrets atomically; revoke old credential at grace expiry.
5. Persist rotation outcome; emit success/failure alert.

Rollback Strategy:
- If validation fails during grace, abort & retain old credential; mark failure and escalate.

---

## 2. Coinbase API Key Rotation (Manual Steps)
1. Log in to Coinbase / Advanced Trade.
2. Create new API key with required scopes (read balances, trade if enabled).
3. Update deployment secrets (`COINBASE_API_KEY`, `COINBASE_API_SECRET`, `COINBASE_API_PASSPHRASE`).
4. Restart API; verify via `GET /coinbase/status`.
5. Revoke old key in Coinbase.
6. Confirm portfolio endpoints and optional trade flows.

## 3. Discord Bot Token Rotation
1. Regenerate token in Developer Portal.
2. Update `DISCORD_TOKEN` secret.
3. Restart bot service; re-register slash commands if needed.
4. Invalidate old token in any secret store.

## 4. MongoDB Atlas Password Rotation
1. Set new password for DB user.
2. Update `MONGODB_URI` secret.
3. Restart API; check `/health/full` for `mongodb: ok`.
4. Remove previous URI from all configs.

---

## 5. Scheduled Backtests & Auto-Tuning (Safety)

Scheduler Environment:
- `BACKTEST_SCHED_ENABLED=true|false` (default true)
- `BACKTEST_SCHED_HOURS=24`
- `BACKTEST_LOOKBACK_DAYS=30`
- `BACKTEST_MAX_RULES=20`
- `BACKTEST_AUTOTUNE_ENABLED=true|false`

Data & Endpoints:
- Backtest artifacts stored in `backtests` collection.
- `GET /backtests/recent` to inspect outcomes.
- Auto-tuning proposes rule changes via approvals (never silent changes).

Best Practices:
- Keep auto-tuning on; approvals + kill-switch enforce safety.
- Review performance metrics & anomaly alerts before enabling auto-execution.

---

## 6. Kill-Switch & Dynamic Risk Throttles
- Automatic engagement on trade velocity, daily loss, or collateral health breaches.
- Environment knobs: `RISK_MAX_TRADES_HOUR`, `RISK_DAILY_LOSS_LIMIT`, `RISK_COLLATERAL_MIN_HEALTH`, `RISK_RECOVERY_GRACE_MIN`.
- Manual override: `POST /kill-switch` (owner auth required).

---

## 7. Anomaly Detection & Volatility Cadence
- Monitors portfolio USD total (z-score & single-step % changes).
- Adjusts snapshot cadence based on 24h return std dev.
- Environment: `ANOMALY_*`, `VOL_*` variables.

---

## 8. Learning Loop
- Periodically recomputes user preferences from decision history.
- Controlled by `LEARNING_LOOP_ENABLED` & `LEARNING_RECOMPUTE_MINUTES`.

---

## 9. General Best Practices
- Never commit `.env` or secrets.
- Use unique, least-privilege credentials; enable MFA everywhere.
- Rotate sensitive credentials every ≤90 days (or sooner per policy).
- Maintain DRY RUN mode for new strategies before auto-execution.
- Monitor SSE stream `/live` for alerts (automation, risk, optimization).
- Backup MongoDB snapshots regularly; test restore procedures.

---

## 10. Incident Response
1. Engage kill-switch.
2. Verify portfolio & snapshot integrity.
3. Rotate any suspect credentials (`POST /rotation/rotate/:service`).
4. Inspect recent alerts & anomalies.
5. Re-enable execution only after remediation and validation.

---

For further questions contact the project owner/maintainer.
