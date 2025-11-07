# CoinRuler Autonomous Rules Engine

## Overview
The CoinRuler rules engine provides autonomous, AI-assisted trading capabilities that respect your portfolio objectives and baseline protections. It continuously monitors market conditions and generates trade suggestions as approvals for your review.

## Architecture

### Core Components

**@coinruler/rules Package** (`WorkSpace/packages/rules/`)
- `types.ts`: Rule DSL definitions (Trigger, Condition, Action, RiskSpec)
- `parser.ts`: Validates and normalizes rule specifications
- `registry.ts`: MongoDB-backed rule CRUD operations
- `evaluator.ts`: Evaluates active rules against market context
- `risk.ts`: Enforces baseline protection, cooldowns, position limits
- `indicators.ts`: RSI, SMA, volatility calculators

**API Integration** (`WorkSpace/apps/api/src/index.ts`)
- `/objectives` - GET/PUT portfolio objectives (baselines, risk tolerance)
- `/rules` - GET/POST rule management
- `/rules/:id/activate` - POST enable/disable rules
- `/rules/:id/metrics` - GET performance history
- Background evaluator runs every 60s, generates approvals for matching conditions

## Your Portfolio Objectives (Implemented)

Based on your requirements, the system enforces:

### Core Asset Protection
- **BTC**: Treated as digital gold / loan collateral
- **XRP**: Minimum 10 tokens never sold or staked
- **Baseline Protection**: Auto-increases baselines on deposits; never allows automated sales below baseline

### Profit Strategy (BTC Chain)
Example rule for your BTC profit chain:
- If BTC +15% from baseline → sell 15%
- If then −10% → rebuy that amount
- If −25% → sell 10% total
- Max 1 execution per 3 hours, max 10 loops

### Safety Controls
- Dry-run mode by default (all trades generate approvals)
- Baseline protection guardrail always active
- Cooldown enforcement prevents rapid-fire trades
- MongoDB brain stores all decisions, baselines, trade history

### Staking Policy
- BTC and XRP: Never stake
- Other assets: Only after AI suggestion + your explicit approval

## Rule DSL Format

### JSON Structure
```json
{
  "name": "btc-profit-cycle-buy",
  "enabled": true,
  "trigger": { "type": "interval", "every": "15m" },
  "conditions": [
    { "priceChangePct": { "symbol": "BTC-USD", "windowMins": 60, "lt": -10 } },
    { "portfolioExposure": { "symbol": "BTC-USD", "ltPct": 50 } }
  ],
  "actions": [
    { "type": "enter", "symbol": "BTC-USD", "allocationPct": 2, "orderType": "limit", "slippageMaxPct": 0.2 }
  ],
  "risk": {
    "maxPositionPct": 60,
    "cooldownSecs": 10800,
    "guardrails": ["baselineProtection", "throttleVelocity"]
  },
  "meta": { "strategyTag": "btc-profit-chain", "loopMax": 10 }
}
```

### Trigger Types
- `{ "type": "interval", "every": "15m" }` - Periodic check (5m, 15m, 1h, 4h, 1d)
- `{ "type": "event", "name": "price-spike" }` - External event (future)

### Condition Types
- **RSI**: `{ "indicator": "rsi", "symbol": "BTC-USD", "lt": 30, "period": 14 }`
- **Volatility**: `{ "indicator": "volatility", "symbol": "ETH-USD", "lt": 0.025 }`
- **SMA**: `{ "indicator": "sma", "symbol": "BTC-USD", "period": 50, "gt": 68000 }`
- **Portfolio Exposure**: `{ "portfolioExposure": { "symbol": "BTC-USD", "ltPct": 15 } }`
- **Price Change**: `{ "priceChangePct": { "symbol": "BTC-USD", "windowMins": 60, "gt": 15 } }`

### Action Types
- **Enter (Buy)**: `{ "type": "enter", "symbol": "BTC-USD", "allocationPct": 5, "orderType": "limit", "slippageMaxPct": 0.3 }`
- **Exit (Sell)**: `{ "type": "exit", "symbol": "BTC-USD", "allocationPct": 10, "orderType": "market" }`
- **Rebalance**: `{ "type": "rebalance", "target": { "BTC": 50, "ETH": 30, "USDC": 20 } }`

### Risk Guardrails
- `baselineProtection`: Never sell below BTC/XRP baselines
- `throttleVelocity`: Limit trade frequency (requires history tracking)
- `circuitDrawdown`: Global halt on drawdown threshold breach

### Risk Parameters
- `maxPositionPct`: Max % of portfolio in single asset
- `maxDailyLossPct`: Daily loss limit before auto-pause
- `cooldownSecs`: Minimum seconds between rule executions (e.g., 10800 = 3 hours)

## API Endpoints

### Portfolio Objectives
```bash
# Get current objectives
GET http://localhost:3000/objectives

# Set objectives
PUT http://localhost:3000/objectives
Content-Type: application/json

{
  "coreAssets": {
    "BTC": { "baseline": 0.5, "neverStake": true },
    "XRP": { "baseline": 1000, "minTokens": 10, "neverStake": true }
  },
  "dryRunDefault": true,
  "approvalsRequired": {
    "newCoin": true,
    "staking": true,
    "largeTradeUsd": 5000,
    "collateralChange": true
  }
}
```

### Rules Management
```bash
# List all rules
GET http://localhost:3000/rules

# Create new rule
POST http://localhost:3000/rules
Content-Type: application/json

{
  "name": "btc-dip-buy-rsi",
  "enabled": true,
  "trigger": { "type": "interval", "every": "15m" },
  "conditions": [
    { "indicator": "rsi", "symbol": "BTC-USD", "lt": 30 },
    { "portfolioExposure": { "symbol": "BTC-USD", "ltPct": 50 } }
  ],
  "actions": [
    { "type": "enter", "symbol": "BTC-USD", "allocationPct": 3 }
  ],
  "risk": {
    "cooldownSecs": 3600,
    "guardrails": ["baselineProtection"]
  }
}

# Enable/disable rule
POST http://localhost:3000/rules/:id/activate
Content-Type: application/json

{ "enabled": true }

# Get rule performance metrics
GET http://localhost:3000/rules/:id/metrics
```

### Approvals (Generated by Rules)
```bash
# List pending approvals (includes rule-generated ones)
GET http://localhost:3000/approvals

# Approve or decline
PATCH http://localhost:3000/approvals/:id
Content-Type: application/json

{
  "status": "approved",
  "actedBy": "owner"
}
```

## How It Works

### Evaluation Loop (Every 60 seconds)
1. Fetch active rules from MongoDB
2. Load latest portfolio snapshot (balances + prices)
3. Load owner objectives (baselines, risk settings)
4. For each enabled rule:
   - Check if trigger condition met (interval timing)
   - Evaluate all conditions against market data
   - If all conditions pass, generate action intent
   - Apply risk layer (baseline protection, cooldown, position limits)
   - If risk approved, create approval record
5. Broadcast approvals via SSE to dashboard
6. Track last execution time for cooldown enforcement

### Safety Features
- **Dry-Run Default**: All intents create approvals, never execute directly
- **Baseline Protection**: Built into risk layer; blocks any sell that would reduce BTC/XRP below baseline
- **Cooldown Enforcement**: Tracks last execution per rule; blocks if within cooldown window
- **MongoDB Brain**: Stores rules, versions, metrics, execution history
- **Kill Switch**: Global emergency stop via `/kill-switch` endpoint
- **Live Events**: SSE stream pushes rule actions, approvals, alerts to dashboard in real-time

## Example Rules for Your Strategy

### BTC Profit Chain - Sell on +15% Gain
```json
{
  "name": "btc-profit-sell-15pct",
  "enabled": true,
  "trigger": { "type": "interval", "every": "15m" },
  "conditions": [
    { "priceChangePct": { "symbol": "BTC-USD", "windowMins": 1440, "gt": 15 } },
    { "portfolioExposure": { "symbol": "BTC-USD", "gtPct": 0.1 } }
  ],
  "actions": [
    { "type": "exit", "symbol": "BTC-USD", "allocationPct": 15 }
  ],
  "risk": {
    "cooldownSecs": 10800,
    "guardrails": ["baselineProtection"]
  }
}
```

### BTC Profit Chain - Rebuy on -10% Dip
```json
{
  "name": "btc-profit-rebuy-10pct",
  "enabled": true,
  "trigger": { "type": "interval", "every": "15m" },
  "conditions": [
    { "priceChangePct": { "symbol": "BTC-USD", "windowMins": 60, "lt": -10 } },
    { "portfolioExposure": { "symbol": "BTC-USD", "ltPct": 60 } }
  ],
  "actions": [
    { "type": "enter", "symbol": "BTC-USD", "allocationPct": 10 }
  ],
  "risk": {
    "cooldownSecs": 10800,
    "guardrails": ["baselineProtection"]
  }
}
```

### XRP Dip Buy (RSI Oversold)
```json
{
  "name": "xrp-dip-buy-rsi",
  "enabled": true,
  "trigger": { "type": "interval", "every": "15m" },
  "conditions": [
    { "indicator": "rsi", "symbol": "XRP-USD", "lt": 30 },
    { "portfolioExposure": { "symbol": "XRP-USD", "ltPct": 20 } }
  ],
  "actions": [
    { "type": "enter", "symbol": "XRP-USD", "allocationPct": 2 }
  ],
  "risk": {
    "cooldownSecs": 3600,
    "guardrails": ["baselineProtection"]
  }
}
```

## MongoDB Collections

- **rules**: Active rule specifications with metadata
- **ruleVersions**: Historical versions for audit trail
- **ruleMetrics**: Performance stats per rule (future: filled by execution results)
- **objectives**: Owner portfolio objectives (key: 'owner')
- **approvals**: Trade approvals (includes rule-generated intents)
- **snapshots**: Portfolio snapshots with prices (used by evaluator)

## Next Steps (Not Yet Implemented)

### Self-Learning Module
- Nightly optimizer generates candidate rule mutations
- Backtest candidates against historical data
- Rank by risk-adjusted return (Sharpe, max DD, win rate)
- Propose promotions to owner with diff + rationale
- Optional auto-apply for low-risk tweaks

### Backtesting Loop
- Integrate with `lib/backtest.ts` historical candle fetcher
- Run candidate rules over 30-90 days of price history
- Store metrics: PnL curve, Sharpe, max drawdown, trade count, win rate
- Reject rules below quality thresholds

### Risk Management Enhancements
- Position sizing based on volatility (Kelly Criterion)
- Max drawdown circuit breaker (global halt)
- Trade velocity throttling (max trades per hour/day)
- Correlation-based diversification enforcement

### Alerting Integration
- Hook into `@coinruler/alerting` package
- Discord/email notifications on:
  - Rule activation/deactivation
  - Performance threshold breaches
  - Risk events (baseline violation attempts)
  - New approvals requiring review

### Advanced Indicators
- On-chain metrics (whale alerts, exchange flows)
- Sentiment analysis integration (existing `lib/sentiment.ts`)
- Multi-timeframe confluence (15m + 1h + 4h alignment)
- ML-based trend prediction (LSTM/ARIMA from existing `lib/ml.ts`)

## Testing

Start the API:
```powershell
cd WorkSpace
npm start -w apps/api
# API runs on http://localhost:3000
```

Test health:
```bash
curl http://localhost:3000/health
# {"ok":true,"db":"connected"}
```

Set objectives:
```bash
curl -X PUT http://localhost:3000/objectives \
  -H "Content-Type: application/json" \
  -d '{"coreAssets":{"BTC":{"baseline":0.5},"XRP":{"baseline":1000}}}'
```

Create a test rule:
```bash
curl -X POST http://localhost:3000/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-btc-dip",
    "enabled": true,
    "trigger": {"type": "interval", "every": "15m"},
    "conditions": [{"priceChangePct": {"symbol": "BTC-USD", "windowMins": 60, "lt": -5}}],
    "actions": [{"type": "enter", "symbol": "BTC-USD", "allocationPct": 2}],
    "risk": {"cooldownSecs": 3600, "guardrails": ["baselineProtection"]}
  }'
```

Watch approvals in real-time:
```bash
curl -N http://localhost:3000/live
# SSE stream of all events including rule-generated approvals
```

## Summary

✅ **Rules Package**: Full DSL with conditions, actions, risk layer
✅ **API Integration**: CRUD endpoints, objectives, metrics
✅ **Baseline Protection**: BTC/XRP never sold below baseline
✅ **Cooldown Enforcement**: Prevents rapid-fire execution
✅ **Approval Pipeline**: All intents generate approvals (dry-run safe)
✅ **MongoDB Brain**: Persistent storage for rules, metrics, execution history
✅ **60s Evaluation Loop**: Continuous monitoring with non-blocking startup
✅ **Live Events**: SSE stream for dashboard integration

🚧 **Future Work**: Self-learning optimizer, backtesting, advanced risk, alerting, ML indicators

Your bot now has autonomous rule-based trading capabilities that respect your BTC/XRP baselines and generate safe approvals for your review!
