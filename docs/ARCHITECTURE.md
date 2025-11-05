# Project Architecture

## Overview
CoinRuler is a modular, event-driven crypto advisor bot. It integrates with Coinbase, MongoDB, and Discord, and is designed for safety, extensibility, and professional operations.

### Key Modules
- `bot.js`: Main orchestrator (Express server, Discord, scheduling, approvals)
- `lib/execution.js`: Order execution logic (CCXT-backed, DRY_RUN/sandbox support)
- `lib/core.js`: Monte Carlo simulation
- `lib/ml.js`: ML stubs (prediction, training)
- `lib/sentiment.js`: News/social sentiment analysis
- `lib/reporting.js`: Daily/periodic reporting
- `lib/backtest.js`: Backtesting engine
- `lib/notifier.js`: Notification helpers (Discord/Twilio)
- `scripts/featureTracker.js`: Feature tracking CLI
- `scripts/register_slash_commands.js`: Discord slash command registration

### Data Flow
1. **User/cron triggers** main loop or endpoints.
2. **Portfolio snapshot** fetched from Coinbase or DB.
3. **Analysis** (Monte Carlo, ML, sentiment) runs.
4. **Advisory/approval** generated and stored in MongoDB.
5. **User approves/declines** via Discord or dashboard.
6. **Execution** (if enabled) via CCXT, with full audit trail.
7. **Reports** and notifications sent to Discord/web.

### API Endpoints
- `/webhook/deposit` — record deposit
- `/webhook/collateral` — record collateral
- `/admin/kill-switch` — toggle kill-switch
- `/admin/approvals` — list approvals
- `/admin/backtest` — run backtest
- `/admin/whatif` — scenario planning
- `/feedback` — store user feedback
- `/health` — health check
- `/dashboard` — dashboard data

### Safety & Security
- DRY_RUN by default; execution must be explicitly enabled
- Pre-commit hook blocks secrets and large metadata changes
- All actions/audits stored in MongoDB
- See `SECURITY.md` for credential rotation

---

For more, see each module's docstring and the main README.
