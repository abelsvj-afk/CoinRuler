# CoinRuler — Ultimate Crypto Advisor Bot

This repository contains the CoinRuler bot: an autonomous crypto advisor that
tracks portfolio snapshots, suggests approvals, and can fetch live balances
from Coinbase. It persists state to MongoDB and integrates with Discord.

## Professional Project Setup

- **Install dependencies:**
  ```sh
  npm install
  ```
- **Copy and configure your environment:**
  ```sh
  cp .env.example .env
  # Edit .env with your secrets
  ```
- **Lint and format code:**
  ```sh
  npm run lint
  npm run format
  ```
- **Run tests:**
  ```sh
  npm test
  ```
- **Start the bot (dry-run by default):**
  ```sh
  npm start
  ```

## Code Style & Quality
- All code must pass ESLint and Prettier checks before merging.
- Use 2 spaces for indentation, LF line endings, and single quotes (see `.editorconfig`).
- See [CONTRIBUTING.md](CONTRIBUTING.md) for workflow and code review guidelines.

## Continuous Integration
- Every PR and push runs lint and Jest tests via GitHub Actions (see `.github/workflows/ci.yml`).
- Merges are gated on green CI.

## Security
- Never commit secrets or `.env` files.
- See [SECURITY.md](SECURITY.md) for credential rotation and best practices.

## Contributing
- See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, workflow, and PR instructions.

---

# CoinRuler — Ultimate Autonomous Crypto Advisor (safe skeleton)

This repository contains a safer, skeleton implementation of the crypto advisory bot originally in `bot.js`.

Important: This project is intentionally conservative by default (DRY_RUN enabled). Do NOT connect live exchange API keys or enable execution until you've reviewed and tested the trade execution logic.

## Quick start (Windows PowerShell)

1. Install Node.js (>=16) and have access to a MongoDB instance if you want persistence.

2. Install dependencies:

```powershell
npm install discord.js mongodb axios node-cron
```

3. Create environment variables. Copy `.env.example` to `.env` and fill values. IMPORTANT: do NOT commit `.env` to source control. Rotate any keys that were accidentally committed.

4. Run the bot (dry-run mode by default):

```powershell
$env:DRY_RUN = 'true'; $env:DISCORD_CHANNEL_ID='your-channel-id'; # set other vars as needed
node .\bot.js
```

## Files added
- `bot.js` — main bot code (updated to use env, guarded startup, safer messaging)
- `package.json` — minimal manifest
- `.env.example` — sample environment variables

## Environment variables
See `.env.example` for the list. Key ones:
- `DISCORD_TOKEN` — (optional) your bot token. If not provided, Discord features are disabled.
- `DISCORD_CHANNEL_ID` — (optional) channel id to post advisories.
- `MONGODB_URI` — (optional) MongoDB connection string. If not provided, DB persistence is disabled and DRY_RUN logs are used.
- `DRY_RUN` — set to `true` to avoid any automatic execution. Default: `true`.

Security checklist:
- Add `.env` and any private key files (e.g. `coinbase api.txt`) to `.gitignore`.
- If you accidentally committed keys, rotate them immediately and purge the files from git history.
- Use host-provided secrets (Railway, Heroku, etc.) in production rather than committing `.env`.

## Next steps I can do for you
- Wire up authenticated exchange API calls (requires careful key handling and order signing).
- Add approval queue and two-admin approval flow.
- Add unit tests for `monteCarloSimulation` and `analyzePortfolio`.

If you want, I can now run `npm install` and perform a quick smoke run of `node bot.js` to verify it starts (it will not perform live trades).