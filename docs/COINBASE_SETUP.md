# Coinbase Setup: Get Live Balances and Trading Working

This guide gets Coinbase data showing up in your dashboard and unlocks trading features. The single biggest blocker we saw: using the wrong key type. Coinbase has two very different credential types.

## Choose the right credentials

- Advanced Trade (Brokerage) API keys → HMAC keys used for REST headers CB-ACCESS-*. Needed for balances, accounts, orders, fills, bid/ask, candles. This is what our API client uses.
- CDP/Onchain (Wallet) keys → ECDSA keys (PEM/private key). These are NOT accepted by Advanced Trade endpoints; using them causes 401 Unauthorized. We can optionally list onchain wallets, but they won’t populate brokerage balances.

You must create Advanced Trade keys for live balances to appear.

## Create Advanced Trade API key

1. Log in to Coinbase (regular consumer exchange, not Coinbase Cloud)
2. Go to profile → Advanced Trade API (API Keys)
3. Create a new key with at minimum:
   - “read” permissions for accounts and market data
   - For live trading later: “trade” permission
4. Copy these two values:
   - API Key (string)
   - API Secret (random string; NOT a PEM key, not multi-line)

Do NOT paste any PEM/BEGIN PRIVATE KEY here; that’s a different product (CDP/Onchain).

## Required environment variables

Set these in your environment (Railway Variables or local .env):

- COINBASE_API_KEY
- COINBASE_API_SECRET

Optional (only for onchain wallet diagnostics):

- COINBASE_SDK_JSON or COINBASE_SDK_API_KEY_NAME and COINBASE_SDK_PRIVATE_KEY

## Verify credentials

After deploying the API (or running locally), check:

- GET /coinbase/status → should report status: connected and include a balances sample
- GET /coinbase/key-permissions (owner-only) → returns your key permissions
- GET /coinbase/accounts?limit=50 (owner-only) → returns brokerage accounts page
- GET /coinbase/market/best_bid_ask?product_ids=BTC-USD → returns bid/ask

If you see status: failed with a hint like “secret appears to be a CDP key,” regenerate a proper Advanced Trade key as above.

## Make the first portfolio snapshot

Your web shows $0 until a snapshot is stored or live balances are fetched. With valid credentials you can create one immediately:

- POST /portfolio/snapshot/force → pulls live balances and prices and stores a snapshot

This also seeds baselines if they don’t exist yet (e.g., BTC baseline = live BTC, XRP baseline = max(10, live XRP)).

## Local quick start (Windows PowerShell)

1) Set env and start API

```powershell
cd C:\Users\Student\Desktop\CoinRuler\WorkSpace
$env:COINBASE_API_KEY="<your-advanced-trade-key>"; $env:COINBASE_API_SECRET="<your-secret>"; npm run build
npm run start -w apps/api
```

2) Verify

```powershell
Invoke-WebRequest -Uri "http://localhost:3001/coinbase/status" -UseBasicParsing
```

3) Create first snapshot

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3001/portfolio/snapshot/force"
```

4) Start web and point it to the API

```powershell
cd ..\apps\web
$env:NEXT_PUBLIC_API_BASE="http://localhost:3001"; npm run dev
```

## Railway deployment notes

- Node version: We pin Node 20.18.0 to avoid Nixpacks choosing Node 22. If Railway logs show nodejs_22, ensure the root package.json engines is 20.18.0 and redeploy.
- Lockfile: Make sure WorkSpace/package-lock.json is committed so npm ci succeeds in Railway.
- Secrets: Put Coinbase keys in Railway Variables only; do not build-time bake secrets into Dockerfiles.

## Troubleshooting

- 401 Unauthorized on /api/v3/brokerage/... → Almost always wrong key type. Regenerate Advanced Trade HMAC key.
- /coinbase/status shows connected but balances empty → The account has zero brokerage balances; try CDP wallets diagnostics or deposit assets.
- Dashboard still shows $0 → Create a snapshot: POST /portfolio/snapshot/force. Also verify NEXT_PUBLIC_API_BASE is set for the web app.
- Candles/bid-ask errors → Some product IDs differ by venue; use BTC-USD, ETH-USD, etc.

## What’s implemented for Coinbase

- Status diagnostics (/coinbase/status)
- Accounts with pagination (/coinbase/accounts)
- Key permissions (/coinbase/key-permissions)
- Best bid/ask (/coinbase/market/best_bid_ask)
- Historical fills (/coinbase/fills)
- Candles (/coinbase/candles)
- Order preview (/coinbase/orders/preview)

Trading execution is available via a dry-run market order helper; live trading requires explicit enablement and risk guardrails. 
