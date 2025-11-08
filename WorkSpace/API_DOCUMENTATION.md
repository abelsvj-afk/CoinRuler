# CoinRuler API Documentation

**Complete endpoint reference for the autonomous crypto trading bot**

---

## 🚀 Core Endpoints

### Health & Status

#### `GET /health`
Simple health check.

**Response:**
```json
{
  "ok": true,
  "db": "connected",
  "dryRun": false
}
```

#### `GET /health/full`
Comprehensive system diagnostics including MongoDB, Coinbase, kill-switch, and collateral status.

#### `GET /env`
Environment configuration details (non-sensitive only).

**Response includes:**
- `activePort`: Actual port server is listening on (after retry)
- `origins`: CORS allowed origins
- `hasMongoUri`, `hasCoinbaseKey`: Boolean flags

---

## 💰 Portfolio & Balances

### `GET /portfolio/current`
Current portfolio with balances, prices, USD value, baselines, and **collateral breakdown**.

**Response:**
```json
{
  "balances": { "BTC": 1.5, "XRP": 5000, "USDC": 10000 },
  "prices": { "BTC": 70000, "XRP": 0.50, "USDC": 1.0 },
  "totalValueUSD": 108500,
  "baselines": { "BTC": { "baseline": 1.0 }, "XRP": { "baseline": 10 } },
  "btcFree": 1.0,
  "collateral": {
    "btcTotal": 1.5,
    "btcLocked": 0.5,
    "btcFree": 1.0,
    "ltv": 0.5
  },
  "updatedAt": "2025-11-08T...",
  "hasData": true
}
```

**Key fields:**
- `btcFree`: BTC available for trading (not locked as collateral)
- `collateral`: Detailed breakdown showing **total BTC exposure** despite locks

### `GET /balances`
Raw balances (live fetch if Coinbase credentials present, else from snapshot).

### `POST /portfolio/snapshot/force`
Force create a live snapshot from Coinbase balances.

**Headers:** `X-Owner-Id` required

---

## 🛡️ Collateral Protection

### `GET /collateral/status`
Detailed collateral information for BTC loan collateral.

**Response:**
```json
{
  "btcTotal": 1.5,
  "btcLocked": 0.5,
  "btcFree": 1.0,
  "btcExposureUSD": 105000,
  "btcLockedUSD": 35000,
  "btcFreeUSD": 70000,
  "lockedPct": 33.33,
  "maxLTV": 0.5,
  "ltvPct": 50,
  "collateralFlag": "BTC is being used as loan collateral",
  "warning": null,
  "updatedAt": "2025-11-08T...",
  "hasCollateral": true
}
```

**Important:** Shows **full BTC market exposure** even when locked as collateral.

---

## ✅ Approvals & Trading

### `GET /approvals`
List pending approvals (trades awaiting manual review).

### `POST /approvals`
Create a new approval.

### `PATCH /approvals/:id`
Update approval status (approve/reject).

**Headers:** `X-Owner-Id` required

### `POST /approvals/:id/execute`
Execute an approved trade manually.

**Body (optional):**
```json
{ "mfaCode": "123456" }
```

**Headers:** `X-Owner-Id` required

---

## 💸 Profit-Taking

### `GET /analysis/profit-taking`
Scan for profit-taking opportunities (above baseline, net after fees).

**Response:**
```json
{
  "count": 2,
  "opportunities": [
    {
      "asset": "XRP",
      "gainPct": 12.5,
      "recommendedSellQty": 1250,
      "estimatedNetUSD": 625,
      "reEntryPrice": 0.485,
      "confidence": 0.85
    }
  ]
}
```

### `POST /analysis/profit-taking/scan`
Run profit-taking scanner and create approvals.

**Headers:** `X-Owner-Id` required

### `GET /profits/recent`
Recent profit-taking executions with **USDC yield tracking**.

**Response:**
```json
{
  "count": 5,
  "totalNetUSD": 3420,
  "byAsset": {
    "XRP": { "count": 3, "netUSD": 2100 },
    "BTC": { "count": 2, "netUSD": 1320 }
  },
  "usdcYield": {
    "principal": 3420,
    "apy": 0.05,
    "accrued": 17.1
  },
  "items": [...]
}
```

---

## 📊 Analysis & Predictions

### `GET /analysis/projection`
Monte Carlo simulation + ML confidence.

### `GET /analysis/prices`
Price analytics: SMA(7/30), 24h return, 7d volatility.

**Query params:**
- `coins`: Comma-separated (default: `BTC,XRP,USDC`)
- `days`: Lookback period (default: 60, max: 60)

### `GET /analysis/predictions`
ML price predictions (LSTM/ARIMA lite).

**Query params:**
- `symbol`: Asset symbol (default: `BTC`)

---

## 😨 Macro Sentiment

### `GET /macro/sentiment`
Latest Fear & Greed Index value.

**Response:**
```json
{
  "ok": true,
  "latest": {
    "value": 45,
    "classification": "neutral",
    "timestamp": "2025-11-08T..."
  }
}
```

**Integration:** Fetched hourly from https://feargreedmeter.com/ (or API equivalent)

---

## 🧠 Knowledge Store

### `POST /knowledge/ingest`
Ingest new knowledge document (market insights, patterns, decisions).

**Headers:** `X-Owner-Id` required

**Body:**
```json
{
  "type": "market_insight",
  "title": "BTC Bull Flag Pattern",
  "content": "Detailed analysis...",
  "tags": ["btc", "pattern", "bullish"],
  "confidence": 0.85,
  "source": "pattern_recognition",
  "relevance": 1.0
}
```

### `GET /knowledge/query`
Query knowledge documents.

**Query params:**
- `type`: `market_insight`, `pattern`, `user_preference`, `decision_rationale`
- `tags`: Comma-separated
- `minConfidence`: Float (0-1)
- `minRelevance`: Float (0-1)
- `limit`: Max results (default: 50)
- `sortBy`: `createdAt`, `confidence`, `relevance`

### `GET /knowledge/context`
Get AI chat context from most relevant knowledge.

**Query params:**
- `tags`: Comma-separated context tags

---

## 🤖 Machine Learning

### `GET /ml/events`
Recent ML training, predictions, and anomaly detection events.

**Query params:**
- `limit`: Max results (default: 50, max: 100)

**Response:**
```json
{
  "count": 10,
  "items": [
    {
      "type": "training_complete",
      "model": "lstm_btc",
      "metrics": { "accuracy": 0.87, "loss": 0.13 },
      "timestamp": "2025-11-08T..."
    }
  ]
}
```

### `GET /ml/preferences`
User preference learning (calculated from trade decisions).

### `POST /ml/predict-approval`
Predict if user would approve a trade (ML-based).

---

## 🔴 Live Events (SSE)

### `GET /live`
Server-Sent Events stream for real-time updates.

**Event types:**
- `approval:created`, `approval:updated`
- `killswitch:changed`
- `portfolio:updated`
- `alert` (with subtypes: `profit_taking_auto`, `collateral`, `anomaly`, `ml_training`, etc.)
- `trade:submitted`, `trade:result`

**Client usage:**
```javascript
const es = new EventSource('http://localhost:3002/live');
es.onmessage = (e) => {
  const event = JSON.parse(e.data);
  console.log(event.type, event.data);
};
```

---

## 🔐 Security

### Owner Authentication
Protected endpoints require `X-Owner-Id` header matching `OWNER_ID` env var.

### MFA (Multi-Factor Authentication)
Large trades (>$5000) require MFA verification:
1. Request MFA: System generates code (console/email)
2. Submit trade with `mfaCode` in body
3. Auto-expires after 5 minutes

---

## ⚙️ Configuration

### Environment Variables

**Required:**
- `MONGODB_URI`: MongoDB connection string
- `OWNER_ID`: Discord/unique owner ID for auth
- `COINBASE_API_KEY`, `COINBASE_API_SECRET`: Trading credentials

**Optional:**
- `API_PORT` / `PORT`: Server port (auto-retries 3001→3005)
- `WEB_ORIGIN`: CORS allowed origins (comma-separated)
- `AUTO_EXECUTE_ENABLED`: Enable autonomous trading (default: false)
- `AUTO_EXECUTE_PROFIT_TAKING`: Enable auto profit-taking (default: false)
- `USDC_APY`: USDC yield APY for tracking (default: 0.05)

---

## 📈 Activity Feed Events

The Activity page displays rich event classification:

- **Executions**: Manual/auto trade completions
- **Approvals**: New/updated pending trades
- **Profit-Taking**: Automatic profit realization
- **Collateral**: BTC lock/unlock, LTV warnings
- **Alerts**: General system alerts
- **ML Events**: Training, predictions, anomalies
- **Learning**: Daily insights and pattern discovery
- **Macro**: Fear & Greed updates

---

## 🧪 Testing

Run tests:
```bash
npm test -w apps/api
```

Test coverage includes:
- Port retry logic
- Collateral calculations
- Profit-taking net after fees
- Fear & Greed storage
- Knowledge store ingestion/query
- USDC yield accrual
- ML event logging

---

## 🚦 Port Retry Logic

If primary port (3001) is busy, the server automatically retries ports 3002-3005.

Check active port:
```bash
curl http://localhost:3002/env | jq .activePort
```

---

## 📝 Notes

- **Collateral Flag**: `/collateral/status` always shows full BTC exposure even when locked
- **SSE Reconnect**: Auto-reconnects with exponential backoff (2s, 4s, 8s, max 30s)
- **Fallback Polling**: Activity page polls if SSE disconnects
- **Knowledge Decay**: Relevance decays 5% per period (configurable)
- **ML Events**: High-confidence predictions (≥0.8) trigger SSE alerts

---

For more details, see:
- `SYSTEM_STATUS.md` - Feature coverage
- `RAILWAY_DEPLOYMENT.md` - Production setup
- `TESTING_GUIDE.md` - Integration tests
