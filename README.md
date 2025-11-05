# CoinRuler — Ultimate Crypto Advisor Bot

This repository contains the CoinRuler bot: an autonomous crypto advisor that
tracks portfolio snapshots, suggests approvals, and can fetch live balances
from Coinbase. It persists state to MongoDB and integrates with Discord.

This README covers: local setup, environment variables, GitHub + Railway
deployment guidance, and Discord bot setup.

## Quick start (local)

- Copy `.env.example` to `.env` and fill in values.
- Install dependencies:

```powershell
npm install
```

- Run in dry-run mode (no real executions):

```powershell
$env:DRY_RUN='true'; node .\bot.js
```

- Run the read-only account summary:

```powershell
node .\account_summary.js
```

## Environment variables (`.env`)

Create a `.env` file with these keys (see `.env.example`):

- MONGODB_URI — Mongo connection string
- DATABASE_NAME — optional DB name (default: cryptoAdvisorUltimate)
- DISCORD_TOKEN — Discord bot token
- OWNER_ID — Discord user ID that can approve actions
- COINBASE_API_KEY — Coinbase API key (rotate if leaked)
- COINBASE_API_SECRET — Coinbase API secret
- DRY_RUN — true|false (default true)
- PORT — webhook server port (default 3000)

Security: Do NOT commit `.env` or any files containing private keys. Rotate any
exposed keys immediately.

## GitHub & Railway deployment (recommended)

1. Create a GitHub repository and push this project.
2. Create a Railway project and connect the GitHub repo (or use Railway CLI).
3. In Railway / GitHub repository secrets, set:
   - `MONGODB_URI`
   - `COINBASE_API_KEY` and `COINBASE_API_SECRET`
   - `DISCORD_TOKEN`
   - `OWNER_ID`
   - `RAILWAY_API_KEY` (optional; only if you want GitHub Actions to call Railway)

This repo includes a GitHub Actions workflow that runs CI and deploys when
pushed to `main` if `RAILWAY_API_KEY` is present in the repository secrets.

## Discord bot setup

1. Create an application at https://discord.com/developers/applications.
2. Add a Bot to the application and copy its token into `DISCORD_TOKEN`.
3. Invite the bot to your server with the proper scopes (bot & applications.commands)
   and permissions to read/send messages.
4. Set `OWNER_ID` to your Discord user ID so you can approve trades.

## Running migrations & normalizing data

This repo contains `scripts/migrate_normalize_deposits.js` which will detect
and propose fixes for deposits mistakenly stored in USD rather than coin amounts.
By default it prints proposed changes; pass `--apply` to make changes.

## CI / Deployment

See `.github/workflows/ci-deploy.yml` for the continuous integration flow. It
installs dependencies, runs tests, and (optionally) deploys to Railway if a
`RAILWAY_API_KEY` secret is provided.

## Next steps I can help with

- Create the GitHub repo and push the code (I can generate the commands or
  use your token if you ask me to and provide it).
- Set up Railway project wiring (I can prepare a template `railway` config but
  you must complete the connection in Railway).
- Create the Discord application and generate required bot credentials (I can
  guide you step-by-step).

If you want me to perform the remote steps (create GitHub repo or call Railway
APIs), tell me which you'd like me to do and provide the required tokens or
confirm you want command snippets you can run locally.
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

If you want, I can now run `npm install` and perform a quick smoke run of `node bot.js` to verify it starts (it will not perform live trades)."