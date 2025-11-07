# 🚀 CoinRuler Quick Start - Test in 5 Minutes

## Your API is Already Running!

Check: `http://localhost:3000/health`

---

## 1. Set Your Portfolio Settings (30 seconds)

```powershell
curl -X PUT http://localhost:3000/objectives `
  -H "Content-Type: application/json" `
  -d '{"coreAssets":{"BTC":{"baseline":0.5,"autoIncrementOnDeposit":true},"XRP":{"baseline":1000,"minTokens":10,"autoIncrementOnDeposit":true}},"autoExecuteCoreAssets":true,"approvalsRequired":{"newCoin":true,"staking":true}}'
```

**Result**: BTC/XRP will auto-trade, other coins need approval

---

## 2. Create Your BTC Profit Rule (30 seconds)

```powershell
curl -X POST http://localhost:3000/rules `
  -H "Content-Type: application/json" `
  -d '{"name":"btc-profit-15pct","enabled":true,"trigger":{"type":"interval","every":"15m"},"conditions":[{"priceChangePct":{"symbol":"BTC-USD","windowMins":1440,"gt":15}}],"actions":[{"type":"exit","symbol":"BTC-USD","allocationPct":15}],"risk":{"cooldownSecs":10800,"guardrails":["baselineProtection"]}}'
```

**Result**: Bot will sell 15% BTC when price is +15% (respecting baseline)

---

## 3. Record a Test Deposit (30 seconds)

```powershell
curl -X POST http://localhost:3000/portfolio/snapshot `
  -H "Content-Type: application/json" `
  -d '{"balances":{"BTC":1.5,"XRP":1500,"USDC":10000},"prices":{"BTC":69000,"XRP":0.55,"USDC":1.00},"isDeposit":true,"depositAmounts":{"BTC":0.3},"reason":"Test deposit"}'
```

**Result**: Baseline auto-increments from 0.5 → 0.8 BTC

---

## 4. Watch It Live (Optional)

```powershell
curl -N http://localhost:3000/live
```

**Result**: Real-time stream of rule evaluations, approvals, alerts

Press `Ctrl+C` to stop

---

## 5. Test from Your Phone (2 minutes)

### In VS Code:
1. Press `Ctrl+Shift+P`
2. Type "Forward a Port"
3. Enter `3000`
4. Set visibility to "Public"
5. Copy URL: `https://abc123-3000.preview.app.github.dev`

### On Your Phone:
- Open: `https://abc123-3000.preview.app.github.dev/health`
- Test: `https://abc123-3000.preview.app.github.dev/rules`
- Watch: `https://abc123-3000.preview.app.github.dev/live`

---

## What Just Happened?

✅ Your bot now:
1. **Trades BTC/XRP autonomously** (baseline protected)
2. **Asks approval** for other coins
3. **Auto-increments baseline** when you deposit
4. **Monitors 24/7** with custom rules
5. **Tracks everything** in MongoDB

---

## Next: Deploy to Railway (30 minutes)

See: `DEPLOY_TO_RAILWAY.md`

**Result**: Permanent website at `https://your-bot.railway.app`

---

## Full Documentation

- **RULES_ENGINE_GUIDE.md** - Complete DSL reference
- **PERMISSIONS_AND_SNAPSHOTS.md** - How permissions work
- **WEBSITE_DEPLOYMENT_OPTIONS.md** - All deployment choices
- **QUICK_TEST_GUIDE.md** - Full test suite
- **STATUS_UPDATE.md** - What's been built

---

## All Committed to Git

```
git log -1
```

Your changes are saved and ready to push to GitHub!

---

🎉 **You're done! Your bot is smarter than 99% of crypto traders.**
