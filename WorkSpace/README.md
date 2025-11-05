# CoinRuler Workspace

Production-grade monorepo for the CoinRuler crypto advisor bot.

## Structure

- **apps/api**: Express + TypeScript REST API
- **apps/bot**: Discord.js bot with LLM advice
- **apps/web**: Next.js + Tailwind dashboard
- **packages/shared**: Shared types and DTOs
- **packages/llm**: OpenAI wrapper
- **packages/analytics**: Whale/social/correlation analytics
- **packages/security**: MFA and key vault integration
- **packages/alerting**: Volatility, fraud, and economic event monitoring

## Quick Start

```powershell
# Install dependencies
npm install

# Build all workspaces
npm run build

# Run API (dev mode)
npm run dev -w apps/api

# Run Bot (dev mode)
npm run dev -w apps/bot

# Run Web dashboard (dev mode)
cd apps/web
npm run dev
```

## Environment Variables

Copy `.env.example` files in each app:
- `apps/api/.env.example` → `apps/api/.env`
- `apps/bot/.env.example` → `apps/bot/.env`
- `apps/web/.env.example` → `apps/web/.env`

## Docker

```powershell
# Build and run all services with MongoDB
docker-compose up --build
```

## CI/CD

GitHub Actions workflow in `.github/workflows/ci.yml` runs on PRs and pushes to main.

## Scripts

- `npm run build`: Build all packages and apps
- `npm run lint`: Lint all code (placeholder)
- `npm run test`: Run tests (placeholder)
- `npm run format`: Format code (placeholder)

## Pre-commit Hooks

Husky pre-commit hook blocks committing `.env` files and warns on large changes to `bot_features.json`.

## Features

- ✅ TypeScript monorepo with npm workspaces
- ✅ Express API with Helmet, Morgan, rate limiting
- ✅ Discord bot with /ping, /status, /advice commands
- ✅ Next.js dashboard with Tailwind CSS
- ✅ OpenAI LLM integration
- ✅ Whale/social/correlation analytics stubs
- ✅ MFA and key vault stubs
- ✅ Advanced alerting stubs (volatility, fraud, economic events)
- ✅ Docker and docker-compose setup
- ✅ CI workflow with GitHub Actions
- ✅ Pre-commit guards for secrets

## TODO

- Wire existing bot logic (approvals, kill-switch, Monte Carlo, ML)
- Implement full analytics integrations (Twitter, Glassnode, Whale Alert)
- Add true MFA (TOTP) and AWS/Azure key vault
- Expand ML pipeline with retraining and evaluation
- Add full alerting with Discord/email/SMS notifications
