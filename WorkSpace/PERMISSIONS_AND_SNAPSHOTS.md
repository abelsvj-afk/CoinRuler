# CoinRuler Permission Model & Snapshot System

## Permission Model (Updated)

### Core Assets (BTC & XRP)
- **Auto-Execute Trades**: Bot can trade WITHOUT your approval
- **Baseline Protection**: Always enforced (can't sell below baseline)
- **Baseline Auto-Increment**: Grows automatically when you deposit
- **No Staking**: Never staked (hard-coded protection)

### Other Coins (ETH, SOL, USDC, etc.)
- **Require Approval**: All trades need your explicit approval
- **Staking Suggestions**: Bot recommends, you approve
- **New Coin Alerts**: Bot notifies when it finds interesting opportunities
- **You Decide**: Review reasoning, data, and approve/decline

### How It Works

```javascript
// Example: Set your objectives
PUT http://localhost:3000/objectives
{
  "coreAssets": {
    "BTC": { 
      "baseline": 0.5,              // Current baseline
      "autoIncrementOnDeposit": true // Auto-grow on deposit
    },
    "XRP": { 
      "baseline": 1000,              // Minimum 1000 XRP
      "minTokens": 10,               // Never go below 10
      "autoIncrementOnDeposit": true
    }
  },
  "autoExecuteCoreAssets": true,    // BTC/XRP trades auto-execute
  "approvalsRequired": {
    "newCoin": true,                 // Need approval for new coins
    "staking": true,                 // Need approval for staking
    "largeTradeUsd": 5000           // Need approval if trade > $5k
  }
}
```

### Approval Flow Examples

#### BTC Trade (Auto-Execute)
```
1. Rule triggers: BTC +15% gain detected
2. Risk layer: Check baseline (0.5 BTC) vs current holding (1.2 BTC)
3. Action: Sell 0.18 BTC (15% of portfolio)
4. Result: EXECUTES IMMEDIATELY (no approval needed)
5. Notification: "BTC profit taken: +$2,150"
```

#### ETH Trade (Requires Approval)
```
1. Rule triggers: ETH RSI < 30 (oversold)
2. Risk layer: ETH not in coreAssets
3. Action: Create approval "Buy 0.5 ETH (~$1,800)"
4. You see: Dashboard shows reasoning, indicators, risk analysis
5. You decide: /approve or /decline
6. Result: Executes only if approved
```

#### Staking Suggestion
```
1. Bot analyzes: "SOL staking yields 7% APY, low risk"
2. Action: Create approval "Stake 50 SOL for 90 days"
3. You see: Expected returns, lock period, risks
4. You decide: Approve with USDC funding or decline
5. Result: Stakes only if approved
```

---

## Deposit & Baseline System

### When You Deposit

**Scenario**: You deposit 0.3 BTC

1. **You Call Endpoint**:
   ```bash
   POST http://localhost:3000/portfolio/snapshot
   {
     "balances": {
       "BTC": 1.5,  # New total (was 1.2)
       "XRP": 1500,
       "USDC": 10000
     },
     "prices": {
       "BTC": 69000,
       "XRP": 0.55,
       "USDC": 1.00
     },
     "isDeposit": true,
     "depositAmounts": {
       "BTC": 0.3  # Amount deposited
     },
     "reason": "Weekly DCA deposit"
   }
   ```

2. **System Responds**:
   - Stores snapshot in MongoDB
   - Auto-increments BTC baseline: 0.5 → 0.8
   - Emits live event for notification
   - Returns confirmation:
     ```json
     {
       "ok": true,
       "snapshot": { ... },
       "baselineUpdated": {
         "BTC": { "old": 0.5, "new": 0.8 }
       }
     }
     ```

3. **Bot Adjusts**:
   - Profit calculations now based on 0.8 BTC baseline
   - Can sell down to 0.8 BTC (not below)
   - Your "protected" holdings grow with your deposits

### Manual Baseline Adjustment

If you want to manually set baseline (e.g., after withdrawal):

```bash
PUT http://localhost:3000/objectives
{
  "coreAssets": {
    "BTC": { 
      "baseline": 0.6,  # Reduced after withdrawal
      "autoIncrementOnDeposit": true
    }
  }
}
```

---

## Portfolio Snapshot System

### Automatic Snapshots

**Triggered by**:
- Every deposit (via API call)
- Significant portfolio changes (>5% value swing)
- Every trade execution
- Daily scheduled snapshot (midnight UTC)
- Manual request (Discord `/snapshot` command)

### Snapshot Endpoints

#### Get Latest Snapshot
```bash
GET http://localhost:3000/portfolio
```

Response:
```json
{
  "BTC": 1.2,
  "XRP": 1500,
  "USDC": 10000,
  "_prices": {
    "BTC": 69000,
    "XRP": 0.55,
    "USDC": 1.00
  },
  "timestamp": "2025-11-06T10:30:00Z",
  "reason": "daily_snapshot"
}
```

#### Create Snapshot (Manual or Deposit)
```bash
POST http://localhost:3000/portfolio/snapshot
{
  "balances": { ... },
  "prices": { ... },
  "reason": "manual|deposit|trade|significant_change",
  "isDeposit": true,  # If this is a deposit
  "depositAmounts": { "BTC": 0.3 }  # What was deposited
}
```

#### Get Changes Since Time
```bash
GET http://localhost:3000/portfolio/changes?since=2025-11-01T00:00:00Z
```

Response:
```json
{
  "changes": [
    {
      "coin": "BTC",
      "qtyChange": 0.15,
      "priceChange": 3500,
      "pctChange": "+5.34%",
      "valueChange": "+$14,850",
      "latestQty": 1.2,
      "latestPrice": 69000
    },
    {
      "coin": "XRP",
      "qtyChange": 0,
      "priceChange": 0.08,
      "pctChange": "+14.55%",
      "valueChange": "+$120",
      "latestQty": 1500,
      "latestPrice": 0.55
    }
  ],
  "since": "2025-11-01T00:00:00Z",
  "latest": "2025-11-06T10:30:00Z"
}
```

---

## Notification System

### When Snapshots Trigger Notifications

**Significant Change Detected** (>5% portfolio value):
```
📸 Portfolio Snapshot - Significant Change
─────────────────────────────────────────
BTC: +0.15 (+$10,350) → Now 1.2 BTC
XRP: No change → 1500 XRP
Total Value: $92,675 (+12.5%)

Reason: BTC price surge
Timestamp: Nov 6, 2025 10:30 AM
```

**Deposit Recorded**:
```
💰 Deposit Recorded
─────────────────────────────────────────
BTC: +0.3 → Total 1.5 BTC
Baseline: 0.5 → 0.8 BTC (auto-increased)

Protected Holdings: 0.8 BTC ($55,200)
Available for Trading: 0.7 BTC ($48,300)
```

**Daily Summary**:
```
📊 Daily Portfolio Summary
─────────────────────────────────────────
24h Change: +$4,850 (+5.2%)

BTC: 1.2 @ $69,000 = $82,800 (+3.8%)
XRP: 1500 @ $0.55 = $825 (+14.5%)
USDC: 10000 @ $1.00 = $10,000 (flat)

Baselines Protected:
✅ BTC: 0.8 (protected $55,200)
✅ XRP: 1000 (protected $550)
```

### Request Snapshot Manually

**Discord Command**:
```
/snapshot
```

**API Call**:
```bash
POST http://localhost:3000/portfolio/snapshot
{
  "balances": { current portfolio },
  "prices": { current prices },
  "reason": "user_requested"
}
```

**Response**: Snapshot created + notification sent

---

## Live Events (SSE Stream)

The API broadcasts snapshot events via Server-Sent Events:

```javascript
// Connect to live stream
const eventSource = new EventSource('http://localhost:3000/live');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'portfolio:snapshot':
      console.log('Snapshot created:', data.data);
      // Update dashboard UI
      break;
      
    case 'approval:created':
      console.log('New approval needed:', data.data);
      // Show notification banner
      break;
      
    case 'alert':
      console.log('Alert:', data.data);
      // Show alert popup
      break;
  }
};
```

Events include:
- `portfolio:snapshot` - New snapshot created
- `portfolio:updated` - Holdings changed
- `approval:created` - Trade needs approval (non-core assets)
- `approval:updated` - You approved/declined
- `killswitch:changed` - Emergency stop activated
- `alert` - Price alerts, whale trades, volatility spikes

---

## Integration with Discord Bot

### Commands (Future Enhancement)

```
/snapshot
→ Creates and sends current portfolio snapshot

/deposit <coin> <amount>
→ Records deposit, auto-increments baseline, creates snapshot

/baseline btc <amount>
→ Manually adjust BTC baseline

/baseline xrp <amount>
→ Manually adjust XRP baseline

/changes [24h|7d|30d]
→ Show portfolio changes over time period

/approve <id>
→ Approve pending trade for non-core assets

/decline <id> [reason]
→ Decline pending trade
```

### Automatic Notifications

Bot sends Discord DM when:
- Portfolio value changes >5%
- New deposit recorded
- Baseline auto-incremented
- Significant price movement in holdings
- Daily summary (configurable time)
- Weekly/monthly reports

---

## Summary

### What Changed:

✅ **BTC/XRP Permission Fixed**:
- Bot can trade these WITHOUT approval
- Baseline protection still enforced
- Baselines auto-grow on deposit

✅ **Other Coins Require Approval**:
- ETH, SOL, USDC, etc. need your permission
- Staking suggestions always need approval
- New coins flagged for your review

✅ **Snapshot System Added**:
- Manual snapshots via API
- Automatic on deposits (with baseline increment)
- Change tracking over time
- Notification triggers

✅ **WebSocket Warning Fixed**:
- Changed from ⚠️ to ℹ️ (informational)
- Not an error, just optional browser feature

### API Endpoints Summary:

```
GET  /portfolio              # Latest snapshot
POST /portfolio/snapshot     # Create snapshot + handle deposits
GET  /portfolio/changes      # Track changes over time
GET  /objectives             # Get current settings
PUT  /objectives             # Update baselines & permissions
```

**Your bot now:**
1. Trades BTC/XRP autonomously (respecting baselines)
2. Asks approval for all other coins
3. Auto-increases baselines when you deposit
4. Sends snapshots on significant changes
5. Tracks portfolio changes over time
