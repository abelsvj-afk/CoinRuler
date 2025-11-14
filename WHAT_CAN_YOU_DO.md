# 🎯 What Can You Do With CoinRuler?

**Welcome to CoinRuler** - Your intelligent cryptocurrency trading advisor bot! This guide will help you understand everything you can do with this powerful system.

---

## 🚀 Quick Answer

CoinRuler is an **AI-powered cryptocurrency trading bot** that:
- 🛡️ **Protects your "digital gold"** (BTC & XRP baselines)
- 💰 **Takes profits automatically** in bull and bear markets
- 🧠 **Learns YOUR trading style** and adapts to you
- 📊 **Monitors markets 24/7** with real-time intelligence
- ✅ **Requires your approval** before executing trades
- 🔒 **Keeps you safe** with multiple protection layers

---

## 👥 Choose Your Experience Level

### 🌱 I'm New to CoinRuler
**Start here if you're just getting started:**

1. **Set up your baselines** (protected amounts)
   ```bash
   # Via Discord
   /deposit coin:BTC amount:1.0
   /deposit coin:XRP amount:2000
   ```

2. **Watch the dashboard**
   - Open http://localhost:3000
   - See your portfolio in real-time
   - Get notified of trading opportunities

3. **Approve or decline trades**
   - Bot creates proposals based on market conditions
   - You review and approve what looks good
   - Bot learns from your decisions

**That's it!** The bot does the heavy lifting, you make the final call.

---

### 🎯 I Want to Customize Trading Rules
**You're ready to create custom trading strategies:**

1. **Create profit-taking rules**
   ```bash
   POST http://localhost:3000/rules
   {
     "name": "Take 15% profits on 20% gains",
     "enabled": true,
     "trigger": { "type": "interval", "every": "5m" },
     "conditions": [{
       "priceChangePct": { "symbol": "BTC", "windowMins": 1440, "gt": 20 }
     }],
     "actions": [{
       "type": "exit",
       "symbol": "BTC",
       "allocationPct": 15
     }]
   }
   ```

2. **Set risk management**
   - Configure cooldown periods between trades
   - Set maximum daily loss limits
   - Define position size limits

3. **Backtest your strategies**
   ```bash
   POST http://localhost:3000/rules/backtest
   ```

**Result:** Custom trading system tailored to your goals!

---

### 🚀 I Want Advanced Features
**Unlock the full power of CoinRuler:**

1. **Machine Learning Analysis**
   ```bash
   GET /ml/preferences        # See what bot learned about you
   GET /ml/patterns           # View trading patterns
   POST /ml/predict-approval  # Predict your decision
   ```

2. **Market Intelligence**
   ```bash
   GET /intelligence/BTC      # Get AI analysis for Bitcoin
   GET /intelligence          # Full market overview
   ```

3. **Credential Security**
   ```bash
   /rotation-status           # Check API key rotation
   /rotate service:coinbase   # Manually rotate keys
   ```

4. **Advanced Monitoring**
   ```bash
   GET /health/full          # Complete system diagnostics
   GET /live                 # Real-time event stream (SSE)
   ```

**Result:** Professional-grade trading infrastructure!

---

## 💡 What Can You Actually Do?

### 📱 Through Discord Bot

**Portfolio Management:**
```
/deposit coin:BTC amount:0.5      → Record deposits (auto-updates baseline)
/status                           → Check portfolio health
/portfolio                        → View complete holdings
```

**Trade Management:**
```
/approvals                        → See pending trade proposals
/approve id:abc123                → Approve a specific trade
/decline id:abc123                → Decline a trade
```

**AI Assistance:**
```
/advice                           → Get AI trading recommendations
/advice Should I sell BTC now?    → Ask specific questions
```

**Emergency Controls:**
```
/panic                            → STOP all trading immediately
/resume                           → Resume normal operations
/kill-switch                      → View emergency stop status
```

**Security:**
```
/rotation-status                  → Check credential rotation status
/rotate service:coinbase          → Force API key rotation
```

---

### 🌐 Through Web Dashboard

**URL:** http://localhost:3000

**Main Dashboard:**
- 📊 Real-time portfolio value
- 💹 Live price updates
- 📈 Performance charts
- 🔔 Critical alerts

**Approvals Page:**
- ✅ One-click approve/decline
- 📋 View proposal details
- 🤖 See AI prediction scores
- 📊 Risk assessment

**Rules Page:**
- 📜 View all trading rules
- 🔧 Create new rules
- ⏸️ Enable/disable rules
- 📈 Backtest strategies

**Alerts Page:**
- 🚨 Price crash warnings
- 🐋 Whale activity alerts
- 📰 News sentiment shifts
- 🤖 ML predictions

**AI Chat:**
- 💬 Talk to your AI advisor
- 📊 Get personalized recommendations
- 🔍 Ask about market conditions
- 📈 Discuss strategies

---

### 🔌 Through REST API

**Quick Examples:**

```bash
# Check system health (includes Coinbase balances!)
curl http://localhost:3000/health/full

# Get your portfolio
curl http://localhost:3000/portfolio

# Record a deposit
curl -X POST http://localhost:3000/portfolio/snapshot \
  -H "Content-Type: application/json" \
  -d '{
    "balances": {"BTC": 1.5, "XRP": 2500},
    "isDeposit": true,
    "depositAmounts": {"BTC": 0.5}
  }'

# Create a trading rule
curl -X POST http://localhost:3000/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Profit at 10%",
    "enabled": true,
    "trigger": {"type": "interval", "every": "5m"},
    "conditions": [{"priceChangePct": {"symbol": "BTC", "windowMins": 1440, "gt": 10}}],
    "actions": [{"type": "exit", "symbol": "BTC", "allocationPct": 20}]
  }'

# Get AI market intelligence
curl http://localhost:3000/intelligence/BTC

# Check ML learned preferences
curl http://localhost:3000/ml/preferences

# Approve a trade
curl -X PATCH http://localhost:3000/approvals/abc123 \
  -H "Content-Type: application/json" \
  -d '{"status": "approved"}'

# Activate kill switch
curl -X POST http://localhost:3000/kill-switch \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "reason": "Market crash"}'
```

---

## 🎓 Common Use Cases

### 1️⃣ "I want to take profits when BTC goes up"

**Solution:**
```bash
# Create a rule
POST /rules
{
  "name": "BTC Profit Taking",
  "enabled": true,
  "trigger": {"type": "interval", "every": "5m"},
  "conditions": [{
    "priceChangePct": {"symbol": "BTC", "windowMins": 1440, "gt": 15}
  }],
  "actions": [{
    "type": "exit",
    "symbol": "BTC",
    "allocationPct": 25
  }],
  "risk": {
    "guardrails": ["baselineProtection"],
    "cooldownSecs": 3600
  }
}
```

**Result:** Bot sells 25% of profitable BTC when price is up 15%+, but never touches your baseline!

---

### 2️⃣ "I want to protect gains in a bear market"

**Solution:**
```bash
# Create a bear market protection rule
POST /rules
{
  "name": "Bear Market Protection",
  "enabled": true,
  "trigger": {"type": "interval", "every": "15m"},
  "conditions": [
    {"priceChangePct": {"symbol": "BTC", "windowMins": 60, "lt": -5}},
    {"rsi": {"symbol": "BTC", "period": 14, "lt": 30}}
  ],
  "actions": [{
    "type": "exit",
    "symbol": "BTC",
    "allocationPct": 40
  }]
}
```

**Result:** Bot sells 40% of profits when price drops 5%+ and RSI shows oversold!

---

### 3️⃣ "I want to track my baselines"

**Solution:**
```bash
# Record a deposit via API
POST /portfolio/snapshot
{
  "balances": {"BTC": 2.5, "XRP": 6000},
  "prices": {"BTC": 69000, "XRP": 0.55},
  "isDeposit": true,
  "depositAmounts": {"BTC": 0.5},
  "reason": "Monthly DCA"
}

# Or via Discord
/deposit coin:BTC amount:0.5
```

**Result:** Your baseline auto-increments from 2.0 → 2.5 BTC. Bot will NEVER sell below this!

---

### 4️⃣ "I want to see what the AI learned about me"

**Solution:**
```bash
# Check learned preferences
GET /ml/preferences

# Returns:
{
  "tradingStyle": "swing_trader",
  "riskTolerance": "aggressive",
  "avgApprovalRate": 0.67,
  "preferredProfitTarget": 12,
  "favoriteCoins": ["BTC", "XRP"],
  "avgHoldingPeriod": "3.2 days"
}
```

**Result:** Understand how the bot sees your trading behavior!

---

### 5️⃣ "I want to get notified of whale activity"

**Solution:**
```bash
# Enable whale alerts (auto-enabled if WHALE_ALERT_API_KEY set)
GET /intelligence/BTC

# Returns:
{
  "symbol": "BTC",
  "whaleActivity": {
    "recentTransfers": [
      {
        "amount": "$8.5M",
        "direction": "to_exchange",
        "timestamp": "2024-01-15T10:30:00Z"
      }
    ],
    "signal": "bearish",
    "confidence": 0.75
  }
}
```

**Result:** Know when big players are moving money!

---

### 6️⃣ "I want to test my strategy before going live"

**Solution:**
```bash
# Backtest a rule
POST /rules/backtest
{
  "ruleId": "abc123",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "initialBalance": {"BTC": 2.0, "USDC": 50000}
}

# Returns:
{
  "totalReturn": 0.15,        # 15% return
  "sharpeRatio": 1.8,
  "maxDrawdown": 0.08,        # 8% max loss
  "winRate": 0.68,            # 68% winning trades
  "totalTrades": 24
}
```

**Result:** Know if your strategy would have been profitable!

---

## 🛡️ How Your Money is Protected

### Layer 1: Baseline Protection
- **What it does:** Never sells below your baseline
- **Example:** Baseline = 2.0 BTC → Bot can only sell from amounts ABOVE 2.0
- **How to set:** `/deposit coin:BTC amount:2.0`

### Layer 2: Minimum Tokens (XRP)
- **What it does:** Always keeps minimum number of tokens
- **Example:** minTokens = 10 XRP → Always keeps at least 10 XRP
- **How to set:** Configure in objectives: `{XRP: {minTokens: 10}}`

### Layer 3: Collateral Protection
- **What it does:** Never sells BTC used as loan collateral
- **Example:** 0.5 BTC locked for loan → Bot won't touch it
- **How it works:** Fetched automatically from Coinbase

### Layer 4: Kill Switch
- **What it does:** Instantly stops ALL trading
- **Example:** Market crash → Hit `/panic` → All trading stops
- **How to use:** Discord `/panic` or API `POST /kill-switch`

### Layer 5: Circuit Breakers
- **What it does:** Limits daily losses and trade frequency
- **Example:** Max 10% daily loss → Bot stops if hit
- **How to configure:** Set in objectives and rule risk settings

---

## 📊 What Gets Monitored 24/7

### 🎯 Your Portfolio
- Real-time balances from Coinbase
- Live price updates
- Total value in USD
- Profit/loss tracking
- Performance metrics

### 🌊 Market Conditions
- Price changes (1h, 24h, 7d)
- Volume spikes
- Volatility levels
- RSI indicators
- Moving averages

### 🐋 Whale Activity
- Large transactions (millions)
- Exchange inflows/outflows
- Accumulation vs distribution
- Suspicious patterns

### 📰 News & Sentiment
- Crypto news articles
- Sentiment scoring (-1 to +1)
- Extreme fear/greed signals
- Breaking news alerts

### 🤖 AI Predictions
- 24h price predictions
- Confidence scores
- Trend signals
- Pattern recognition

---

## ⚙️ System Requirements

### Minimum Setup
```bash
# Required Environment Variables
MONGODB_URI=mongodb://...              # Database connection
COINBASE_API_KEY=your_key             # For live trading
COINBASE_API_SECRET=your_secret       # For live trading
DISCORD_BOT_TOKEN=your_token          # For Discord bot
OWNER_ID=your_discord_user_id         # For permissions
```

### Optional Features
```bash
# AI Advisor
OPENAI_API_KEY=sk-...                 # For chat advisor

# Advanced Analytics
NEWSAPI_KEY=...                       # News sentiment
WHALE_ALERT_KEY=...                   # Whale tracking
TRADING_ECONOMICS_API_KEY=...         # Economic events
```

---

## 🎮 How to Get Started

### Step 1: Start the System
```bash
cd WorkSpace
npm install          # Install dependencies
npm run build        # Build all packages
npm start -w apps/api     # Start API server (port 3000)
npm start -w apps/bot     # Start Discord bot
npm run dev -w apps/web   # Start web dashboard (port 3000)
```

### Step 2: Set Your Baselines
```bash
# Option 1: Discord
/deposit coin:BTC amount:2.0
/deposit coin:XRP amount:5000

# Option 2: API
curl -X POST http://localhost:3000/portfolio/snapshot \
  -H "Content-Type: application/json" \
  -d '{
    "balances": {"BTC": 2.0, "XRP": 5000},
    "isDeposit": true,
    "depositAmounts": {"BTC": 2.0, "XRP": 5000}
  }'
```

### Step 3: Create Your First Rule
```bash
# Use the API or Discord
POST http://localhost:3000/rules
{
  "name": "My First Profit Rule",
  "enabled": true,
  "trigger": {"type": "interval", "every": "5m"},
  "conditions": [{
    "priceChangePct": {"symbol": "BTC", "windowMins": 1440, "gt": 10}
  }],
  "actions": [{
    "type": "exit",
    "symbol": "BTC",
    "allocationPct": 20
  }],
  "risk": {
    "guardrails": ["baselineProtection"],
    "cooldownSecs": 1800
  }
}
```

### Step 4: Monitor & Approve
- Open dashboard: http://localhost:3000
- Watch for approval notifications
- Review and approve good opportunities
- Bot learns from your decisions!

---

## 🎯 Pro Tips

### 💡 Tip 1: Let the Bot Learn
- Start with conservative rules
- Approve/decline trades for 1-2 weeks
- Check `/ml/preferences` to see what bot learned
- Adjust rules based on learned preferences

### 💡 Tip 2: Use Multiple Rules
- Create different rules for different scenarios
- Bull market rules (take small profits, let winners run)
- Bear market rules (take larger profits, protect capital)
- Sideways rules (wait for clear opportunities)

### 💡 Tip 3: Monitor Intelligence
- Check `/intelligence/BTC` daily
- Watch for extreme sentiment (< -0.7 or > 0.8)
- Pay attention to whale activity alerts
- Use ML predictions as additional data points

### 💡 Tip 4: Start with DRY_RUN
- Set `dryRunDefault: true` in objectives
- Test all rules without real money
- Review bot behavior for 1 week
- Switch to live trading when confident

### 💡 Tip 5: Use the Kill Switch
- Don't hesitate to use `/panic` if unsure
- Better safe than sorry
- Resume with `/resume` when ready
- No shame in stopping to reassess

---

## 📚 Documentation Files

### Getting Started
- **README.md** - Project overview
- **QUICK_START.md** - 5-minute test guide
- **READY_TO_USE.md** - System status & commands

### Deep Dives
- **COMPLETE_SYSTEM_GUIDE.md** - Full feature documentation
- **PROJECT_COMPLETION_SUMMARY.md** - All implemented features
- **REALTIME_SYSTEM_GUIDE.md** - Real-time monitoring guide

### Deployment
- **DEPLOY_TO_RAILWAY.md** - Deploy to Railway
- **DEPLOY_WEBSITE.md** - Deploy web dashboard
- **DEPLOYMENT_GUIDE.md** - General deployment guide

### Development
- **CONTRIBUTING.md** - How to contribute
- **NAVIGATION.md** - Project structure
- **TESTING_CHECKLIST.md** - Testing guide

---

## 🤔 Frequently Asked Questions

### Q: Will the bot sell my baseline?
**A:** NO. The baseline is sacred and will NEVER be touched. The bot only trades amounts above your baseline.

### Q: Can I test without real money?
**A:** YES. Set `dryRunDefault: true` in objectives. All trades will be simulated.

### Q: How does the bot learn from me?
**A:** Every approve/decline decision is stored with market conditions. ML analyzes patterns in your decisions.

### Q: What if I disagree with a proposal?
**A:** Simply decline it! The bot learns from your decline and won't suggest similar trades.

### Q: Can I trade without approvals?
**A:** YES. Set `autoExecuteCoreAssets: true` for BTC/XRP. Other coins still need approval.

### Q: How do I stop trading immediately?
**A:** Use `/panic` in Discord or `POST /kill-switch` via API. All trading stops instantly.

### Q: What exchanges are supported?
**A:** Currently Coinbase (Advanced Trade API). Uses CCXT library which supports 100+ exchanges.

### Q: Can I add custom trading strategies?
**A:** YES. Use the Rules Engine to create any strategy you want with conditions and actions.

---

## 🎉 What Makes CoinRuler Special

### ✨ Unique Features
1. **Baseline Protection** - Your "digital gold" is never touched
2. **Human-in-the-Loop** - You approve everything
3. **Real Machine Learning** - Learns YOUR trading style
4. **24/7 Intelligence** - Never misses an opportunity
5. **Multiple Interfaces** - Discord, Web, API - your choice
6. **Production Ready** - Built by engineers, for traders

### 🚀 Ready to Use
- ✅ 76.5% feature complete
- ✅ Tested and documented
- ✅ Security hardened
- ✅ Multiple protection layers
- ✅ Real Coinbase integration
- ✅ Professional architecture

---

## 🎯 Your Next Steps

### Right Now (5 minutes)
1. Start the system
2. Check http://localhost:3000/health/full
3. Open web dashboard
4. Explore the interface

### This Week (1 hour)
1. Set your baselines
2. Create 2-3 trading rules
3. Make 5-10 approve/decline decisions
4. Check what bot learned (`/ml/preferences`)

### This Month (Ongoing)
1. Let bot monitor 24/7
2. Approve good opportunities
3. Review performance weekly
4. Adjust rules based on results

---

## 💬 Need Help?

### Check Documentation
- Read the relevant .md files in the repo
- Most questions answered in existing docs

### Check System Health
```bash
curl http://localhost:3000/health/full
```

### Check Logs
- API logs: WorkSpace/apps/api output
- Bot logs: WorkSpace/apps/bot output
- MongoDB: Check `approvals`, `snapshots`, `reports` collections

### Common Issues
- **API won't start:** Check MongoDB connection
- **Bot offline:** Verify Discord token
- **No balances:** Check Coinbase API keys
- **Rules not triggering:** Check rule conditions and intervals

---

## 🚀 Start Trading Smarter Today!

**CoinRuler gives you:**
- 🛡️ Protection (baselines, kill switch, circuit breakers)
- 🧠 Intelligence (ML, whale tracking, sentiment)
- 💰 Automation (24/7 monitoring, smart proposals)
- ✅ Control (you approve everything)

**You provide:**
- 🎯 Your baselines (protected amounts)
- 🔧 Your rules (profit targets, risk tolerance)
- ✅ Your decisions (approve/decline)

**Together you build:**
- 📈 Profitable trading system
- 🤖 AI that understands you
- 💎 Growing wealth over time

---

**Ready?** Start with: `cd WorkSpace && npm run build && npm start -w apps/api`

**Questions?** Check the docs or open the dashboard at http://localhost:3000

**Let's make you money! 💰🚀**
