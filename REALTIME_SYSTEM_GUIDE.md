# CoinRuler Real-Time System Setup

## What You Have Now ✅

### 1. **Owner-Only Web Dashboard** (Basic Auth Protected)
- **Pages:**
  - `/` - Original full dashboard (portfolio, approvals, Monte Carlo, recent reports)
  - `/dashboard` - Simplified dashboard with **Panic/Resume** buttons
  - `/approvals` - Approve/decline trades
  - `/rotation` - Credential rotation status and actions
  - `/commands` - Dropdown command center (all bot actions)
  - `/chat` - **Streaming AI chat** (token-by-token responses)

### 2. **Real-Time Infrastructure (SSE)** 
- **API endpoint:** `GET /live`
  - Server-Sent Events for instant updates
  - Broadcasts: `approval:created`, `approval:updated`, `killswitch:changed`, `portfolio:updated`, `alert`
  - Heartbeat every 30s to keep connection alive
  - Auto-cleanup on disconnect

### 3. **Streaming Chat (OpenAI)**
- **API endpoint:** `POST /chat/stream`
  - Token-by-token streaming via SSE
  - Smooth typing effect in chat UI
  - Uses OpenAI streaming API under the hood

### 4. **Panic/Resume Buttons**
- One-click emergency stop/resume on dashboard
- Instant UI feedback
- Updates kill switch in MongoDB

### 5. **Discord Bot (Already Deployed on Railway)**
- 11 slash commands (all ephemeral/private)
- Owner-only authorization
- Running 24/7 in cloud

---

## What You're Missing (High Priority for Trading Bot)

### 🚨 **CRITICAL: You Need to See Everything Instantly**

For a high-stakes trading bot, you cannot rely on refresh or polling. Here's what's missing:

### 1. **SSE Live Updates Client** (HIGHEST PRIORITY)
**Why:** You need instant notifications when:
- New trades appear for approval
- Portfolio changes (price moves, balances update)
- Kill switch activates
- Whale alerts / volatility spikes / fraud detection

**What to Add:**
- Connect dashboard to `GET /live` SSE endpoint
- Listen for events and update UI in real-time
- Show toast/banner notifications for critical events
- Auto-update approval count, portfolio, kill switch status

### 2. **Live Alerts Widget** (CRITICAL)
**Why:** Your bot has whale alert, volatility monitoring, and fraud detection built-in but you're not seeing them

**What to Add:**
- Real-time alerts feed on dashboard
- Show: whale movements (> $1M), price spikes (> 10%), fraud anomalies
- Sound/visual notifications for critical alerts
- Connect to analytics package (`@coinruler/analytics` and `@coinruler/alerting`)

### 3. **Discord OAuth Owner Login** (SECURITY)
**Why:** Basic Auth is weak; Discord OAuth verifies you're the actual owner

**What to Add:**
- "Login with Discord" button
- OAuth callback route
- Check `interaction.user.id === OWNER_ID`
- Session management (cookies/JWT)
- Replace Basic Auth with Discord-verified sessions

### 4. **Portfolio Live Updates** (IMPORTANT)
**Why:** You need to see BTC/XRP/USDC balances change instantly as trades execute

**What to Add:**
- Real-time portfolio widget on dashboard
- Subscribe to `portfolio:updated` SSE event
- Show current prices, balances, total value
- Color-code gains/losses

### 5. **Approval Notifications** (IMPORTANT)
**Why:** You need to know immediately when the bot wants to execute a trade

**What to Add:**
- Browser push notifications when `approval:created` fires
- Sound alert for new approvals
- Badge count on "Approvals" nav link
- Desktop notification (if permitted)

---

## How Your Real-Time System Works

### Architecture Flow:
```
[Bot/Trading Logic] 
    ↓ (creates approval/changes killswitch/updates portfolio)
[MongoDB]
    ↓ (API detects change)
[EventEmitter]
    ↓ (broadcasts event)
[SSE /live endpoint]
    ↓ (pushes to all connected clients)
[Your Browser]
    ↓ (updates UI instantly)
[You See It Immediately] ✅
```

### Current Event Types:
1. `approval:created` - New trade needs approval
2. `approval:updated` - Trade approved/declined
3. `killswitch:changed` - Panic/resume triggered
4. `portfolio:updated` - Balance/price changed
5. `alert` - Whale/volatility/fraud alert

---

## What You Need to Do Next

### **Priority 1: Connect SSE Client to Dashboard**
**Goal:** Never miss an approval or alert

**Implementation:**
1. Add `useSSE()` hook in dashboard
2. Connect to `${api}/live`
3. Listen for events and update state
4. Show toast notifications for critical events

**Example:**
```typescript
useEffect(() => {
  const eventSource = new EventSource(`${api}/live`);
  
  eventSource.addEventListener('message', (e) => {
    const event = JSON.parse(e.data);
    if (event.type === 'approval:created') {
      // Show notification + update approval list
      showToast('New approval needed!');
      refetchApprovals();
    }
    if (event.type === 'killswitch:changed') {
      // Update kill switch status immediately
      setKillSwitch(event.data);
    }
    if (event.type === 'alert') {
      // Show critical alert
      showAlert(event.data);
    }
  });

  return () => eventSource.close();
}, []);
```

### **Priority 2: Add Live Alerts Widget**
**Goal:** See whale movements, volatility spikes, fraud detection in real-time

**Implementation:**
1. Create `/alerts` page or widget on dashboard
2. Connect to alerting package
3. Emit `alert` events from API when:
   - Whale Alert API detects large transaction
   - Volatility monitoring sees price spike > 10%
   - Fraud detection flags suspicious activity
4. Show in real-time feed with timestamps

### **Priority 3: Discord OAuth for Secure Login**
**Goal:** Only you can access the dashboard (verified by Discord)

**Implementation:**
1. Register OAuth app in Discord Developer Portal
2. Add `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` to env
3. Create `/api/auth/discord` callback route
4. Check `user.id === process.env.OWNER_ID`
5. Store session in cookie/JWT
6. Replace Basic Auth middleware with Discord session check

---

## Testing Locally

### Start Services:

**API (port 3001):**
```powershell
cd C:\Users\Student\Desktop\CoinRuler\WorkSpace\apps\api
npm install
npm run dev
```

**Web (port 3000):**
```powershell
cd C:\Users\Student\Desktop\CoinRuler\WorkSpace\apps\web
npm install
$env:WEB_USERNAME="owner"; $env:WEB_PASSWORD="pass"; $env:NEXT_PUBLIC_API_BASE="http://localhost:3001"; npm run dev
```

### Test Features:

1. **Streaming Chat:**
   - Go to http://localhost:3000/chat
   - Type a message
   - Watch tokens appear one-by-one (smooth typing)

2. **Panic/Resume:**
   - Go to http://localhost:3000/dashboard
   - Click "Panic" → Kill switch enables
   - Click "Resume" → Kill switch disables

3. **SSE Connection (Manual Test):**
   - Open browser console
   - Run:
     ```javascript
     const es = new EventSource('http://localhost:3001/live');
     es.onmessage = e => console.log(JSON.parse(e.data));
     ```
   - Trigger an approval or kill switch change
   - See events appear in console immediately

---

## Deployment to Railway

### Current Setup:
- **Bot:** Already deployed (Discord slash commands)
- **API:** Can deploy as separate service
- **Web:** Can deploy as separate service

### Environment Variables Needed:

**API Service:**
- All existing vars (MONGODB_URI, DISCORD_BOT_TOKEN, etc.)
- OPENAI_API_KEY (for streaming chat)

**Web Service:**
- `WEB_USERNAME` / `WEB_PASSWORD` (or remove for Discord OAuth)
- `API_BASE` (URL of your API service)
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` (for OAuth)
- `DISCORD_REDIRECT_URI` (for OAuth callback)
- `OWNER_ID` (your Discord user ID)

---

## Why This Matters for Your Trading Bot

### Without Real-Time Updates:
- ❌ You miss critical approvals (trades don't execute)
- ❌ You don't see whale movements until it's too late
- ❌ Portfolio changes are delayed (stale data)
- ❌ Kill switch lag (panic doesn't stop trades instantly)
- ❌ No alerts for fraud or volatility spikes

### With Real-Time Updates:
- ✅ Instant approval notifications (never miss a trade)
- ✅ See whale alerts as they happen (react immediately)
- ✅ Portfolio updates in real-time (always current)
- ✅ Kill switch triggers broadcast instantly (safe)
- ✅ Fraud/volatility alerts pushed to you (proactive)

---

## Next Steps

**I recommend we do this in order:**

1. **Add SSE client to dashboard** (30 min)
   - Connect to `/live` endpoint
   - Update UI on events
   - Show toast notifications

2. **Wire up live alerts widget** (45 min)
   - Fetch from analytics/alerting packages
   - Emit `alert` events from API
   - Display in real-time feed

3. **Add Discord OAuth** (60 min)
   - OAuth flow
   - Owner verification
   - Session management

4. **Add portfolio live updates** (20 min)
   - Subscribe to `portfolio:updated`
   - Show real-time balances/prices

5. **Add browser push notifications** (30 min)
   - Request permission
   - Send on critical events
   - Desktop alerts

**Total time to complete: ~3 hours**

---

## Summary

You now have:
- ✅ Streaming chat (smooth typing)
- ✅ Panic/Resume buttons (instant)
- ✅ SSE infrastructure (ready to use)
- ✅ Real-time event broadcasting

You need:
- ⏳ SSE client in dashboard (connect to `/live`)
- ⏳ Live alerts widget (whale/volatility/fraud)
- ⏳ Discord OAuth (secure owner-only login)
- ⏳ Portfolio live updates
- ⏳ Browser push notifications

**Let me know which one you want first and I'll build it right now.**
