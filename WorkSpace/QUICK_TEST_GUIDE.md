# CoinRuler API Quick Test Guide

## API is Running on http://localhost:3000

### 1. Test Health Check
```powershell
curl http://localhost:3000/health
```
Expected: `{"ok":true,"db":"connected"}`

---

### 2. Set Your Portfolio Objectives
```powershell
curl -X PUT http://localhost:3000/objectives `
  -H "Content-Type: application/json" `
  -d '{
    "coreAssets": {
      "BTC": { 
        "baseline": 0.5,
        "autoIncrementOnDeposit": true
      },
      "XRP": { 
        "baseline": 1000,
        "minTokens": 10,
        "autoIncrementOnDeposit": true
      }
    },
    "autoExecuteCoreAssets": true,
    "approvalsRequired": {
      "newCoin": true,
      "staking": true,
      "largeTradeUsd": 5000
    }
  }'
```

---

### 3. Verify Objectives Saved
```powershell
curl http://localhost:3000/objectives
```

---

### 4. Create BTC Profit Rule (Auto-Execute)
```powershell
curl -X POST http://localhost:3000/rules `
  -H "Content-Type: application/json" `
  -d '{
    "name": "btc-profit-sell-15pct",
    "enabled": true,
    "trigger": {"type": "interval", "every": "15m"},
    "conditions": [
      {"priceChangePct": {"symbol": "BTC-USD", "windowMins": 1440, "gt": 15}}
    ],
    "actions": [
      {"type": "exit", "symbol": "BTC-USD", "allocationPct": 15}
    ],
    "risk": {
      "cooldownSecs": 10800,
      "guardrails": ["baselineProtection"]
    },
    "meta": {"strategyTag": "btc-profit-chain"}
  }'
```

---

### 5. Create ETH Buy Rule (Requires Approval)
```powershell
curl -X POST http://localhost:3000/rules `
  -H "Content-Type: application/json" `
  -d '{
    "name": "eth-dip-buy-rsi",
    "enabled": true,
    "trigger": {"type": "interval", "every": "15m"},
    "conditions": [
      {"indicator": "rsi", "symbol": "ETH-USD", "lt": 30},
      {"portfolioExposure": {"symbol": "ETH-USD", "ltPct": 20}}
    ],
    "actions": [
      {"type": "enter", "symbol": "ETH-USD", "allocationPct": 3}
    ],
    "risk": {
      "cooldownSecs": 3600,
      "guardrails": ["baselineProtection"]
    }
  }'
```

---

### 6. List All Rules
```powershell
curl http://localhost:3000/rules
```

---

### 7. Record a Deposit (Auto-Increments Baseline)
```powershell
curl -X POST http://localhost:3000/portfolio/snapshot `
  -H "Content-Type: application/json" `
  -d '{
    "balances": {
      "BTC": 1.5,
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
      "BTC": 0.3
    },
    "reason": "Weekly DCA deposit"
  }'
```

Expected: Baseline increases from 0.5 → 0.8 BTC

---

### 8. Get Current Portfolio Snapshot
```powershell
curl http://localhost:3000/portfolio
```

---

### 9. Check Portfolio Changes (Last 24h)
```powershell
curl "http://localhost:3000/portfolio/changes?since=2025-11-05T00:00:00Z"
```

---

### 10. List Pending Approvals
```powershell
curl http://localhost:3000/approvals
```

---

### 11. Watch Live Events (SSE Stream)
```powershell
curl -N http://localhost:3000/live
```
Leave this running to see real-time events:
- Rule evaluations
- Approvals created
- Portfolio updates
- Alerts

Press Ctrl+C to stop

---

### 12. Test Monte Carlo Simulation
```powershell
curl -X POST http://localhost:3000/monte-carlo `
  -H "Content-Type: application/json" `
  -d '{
    "portfolio": {
      "BTC": {"qty": 1.2, "price": 69000},
      "XRP": {"qty": 1500, "price": 0.55}
    },
    "sims": 1000,
    "days": 30
  }'
```

---

### 13. Test Dashboard Endpoint (All-in-One)
```powershell
curl http://localhost:3000/dashboard
```
Returns: Portfolio + Approvals + Kill Switch + Reports

---

### 14. Test Kill Switch
```powershell
# Enable emergency stop
curl -X POST http://localhost:3000/kill-switch `
  -H "Content-Type: application/json" `
  -d '{
    "enabled": true,
    "reason": "Testing emergency stop",
    "setBy": "owner"
  }'

# Check status
curl http://localhost:3000/kill-switch

# Disable
curl -X POST http://localhost:3000/kill-switch `
  -H "Content-Type: application/json" `
  -d '{
    "enabled": false,
    "reason": "Test complete",
    "setBy": "owner"
  }'
```

---

## Testing with VS Code Port Forwarding

### Step 1: Forward Port 3000
1. Open VS Code
2. Press `Ctrl+Shift+P`
3. Type "Forward a Port"
4. Enter `3000`
5. Set visibility to "Public"
6. Copy the forwarded URL (e.g., `https://xyz-3000.preview.app.github.dev`)

### Step 2: Test from Your Phone
Replace `localhost:3000` with your forwarded URL:
```
https://xyz-3000.preview.app.github.dev/health
https://xyz-3000.preview.app.github.dev/portfolio
https://xyz-3000.preview.app.github.dev/rules
```

### Step 3: Test Web Dashboard
1. Forward port `3001` (if web is running)
2. Update `WorkSpace/apps/web/.env.local`:
   ```
   NEXT_PUBLIC_API_URL=https://xyz-3000.preview.app.github.dev
   ```
3. Restart web: `npm run dev -w apps/web`
4. Access from phone: `https://xyz-3001.preview.app.github.dev`

---

## What Works Now

✅ **Permission Model**:
- BTC/XRP trades auto-execute (no approval)
- Other coins require approval
- Baseline protection enforced
- Baselines auto-increment on deposit

✅ **Snapshot System**:
- Manual snapshots via API
- Auto-snapshot on deposit
- Baseline auto-increment
- Change tracking over time

✅ **Rules Engine**:
- 60s evaluation loop
- Condition checking (price, RSI, exposure)
- Risk layer (baseline, cooldown)
- Intent generation

✅ **Live Events**:
- SSE stream for real-time updates
- Approval notifications
- Portfolio changes
- System alerts

✅ **MongoDB Brain**:
- Rules stored and versioned
- Objectives persisted
- Snapshots tracked
- Execution history

---

## Next: Deploy to Railway

When you're ready to make this a permanent website:

1. **Push to GitHub**:
   ```powershell
   cd C:\Users\Student\Desktop\CoinRuler
   git add .
   git commit -m "Add rules engine, permissions, snapshots"
   git push origin main
   ```

2. **Follow Railway Guide**: See `DEPLOY_TO_RAILWAY.md`

3. **Result**: Live website at `https://your-app.railway.app`

---

## Troubleshooting

### API Won't Start
```powershell
# Check if port 3000 is in use
netstat -ano | findstr :3000

# Kill process if needed
taskkill /PID <process_id> /F

# Restart API
cd C:\Users\Student\Desktop\CoinRuler\WorkSpace\apps\api
node dist/index.js
```

### MongoDB Connection Issues
- Check `MONGODB_URI` in your environment
- Verify Atlas IP whitelist includes your IP
- Test connection at https://cloud.mongodb.com

### Port Forwarding Not Working
- Ensure you're signed into GitHub in VS Code
- Check firewall isn't blocking VS Code
- Try ngrok as alternative (see WEBSITE_DEPLOYMENT_OPTIONS.md)

---

## Summary

🎉 **Your bot is now running with:**
- Autonomous BTC/XRP trading (respecting baselines)
- Approval-required for other coins
- Auto-incrementing baselines on deposit
- Portfolio snapshot system
- Change tracking
- Live event notifications
- Rules engine (60s evaluation)

Test everything locally, then deploy to Railway for 24/7 access!
