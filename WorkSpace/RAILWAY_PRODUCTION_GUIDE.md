# Railway Deployment Guide for CoinRuler

This guide walks through deploying CoinRuler to Railway with automated rules engine, real-time monitoring, and live web dashboard.

## Prerequisites

- GitHub account with CoinRuler repository
- Railway account (get $5/month free credit at railway.app)
- MongoDB Atlas connection string
- Coinbase API credentials (optional for live trading)

## Step 1: Push Latest Changes to GitHub

```powershell
cd c:\Users\Student\Desktop\CoinRuler
git add .
git commit -m "Complete rules engine with optimizer, backtester, risk management, and tests"
git push origin main
```

## Step 2: Create Railway Project

1. Go to https://railway.app and sign in
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `CoinRuler` repository
5. Railway will detect it's a monorepo

## Step 3: Configure Services

### Service 1: API Server

**Root Directory**: `WorkSpace/apps/api`

**Build Command**:
```bash
cd ../../ && npm install && npm run build && cd apps/api
```

**Start Command**:
```bash
npm start
```

**Environment Variables**:
```
MONGODB_URI=mongodb+srv://your-cluster.mongodb.net/coinruler
PORT=3000
NODE_ENV=production
COINBASE_API_KEY=your_coinbase_key
COINBASE_API_SECRET=your_coinbase_secret
```

**Health Check**: Enable HTTP health check on `/health`

### Service 2: Web Dashboard

**Root Directory**: `WorkSpace/apps/web`

**Build Command**:
```bash
cd ../../ && npm install && npm run build && cd apps/web && npm run build
```

**Start Command**:
```bash
npm start
```

**Environment Variables**:
```
NEXTAUTH_SECRET=your-random-secret-key-here
NEXTAUTH_URL=https://your-railway-web-url.railway.app
API_URL=https://your-railway-api-url.railway.app
```

**Health Check**: Enable HTTP health check on `/`

## Step 4: Add MongoDB Atlas IP Whitelist

1. Go to MongoDB Atlas Dashboard
2. Click "Network Access"
3. Add IP Address: `0.0.0.0/0` (allow all - Railway uses dynamic IPs)
4. Or use Railway's static IP (if available on your plan)

## Step 5: Generate Secrets

```powershell
# Generate NEXTAUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 6: Link Services

The web dashboard needs to know the API URL:

1. After API service deploys, copy its Railway URL (e.g., `https://coinruler-api-production.up.railway.app`)
2. Update Web service's `API_URL` environment variable with this URL
3. Update Web service's `NEXTAUTH_URL` to its own Railway URL

## Step 7: Deploy & Monitor

Railway will automatically:
- Install dependencies from monorepo root
- Build TypeScript packages
- Start each service
- Provide live logs
- Auto-redeploy on git push

### Check Deployment Status

1. **API Service Logs**: Look for:
   ```
   ✅ MongoDB connected successfully
   ⏰ Starting rules evaluator (60s interval)...
   📊 Starting performance monitor (5m interval)...
   🤖 Scheduling nightly optimizer...
   🚀 API server running on port 3000
   ```

2. **Web Service Logs**: Look for:
   ```
   ready - started server on 0.0.0.0:3000
   ```

3. **Test Endpoints**:
   ```powershell
   # Health check
   curl https://your-api-url.railway.app/health
   
   # List rules
   curl https://your-api-url.railway.app/rules
   
   # Get objectives
   curl https://your-api-url.railway.app/objectives
   ```

## Step 8: Access Your Live Dashboard

Visit `https://your-web-url.railway.app` in your browser.

You'll see:
- Real-time portfolio status
- Active rules with performance metrics
- Pending approvals (BTC/XRP auto-execute, others require approval)
- Live SSE events for rule evaluations
- Performance alerts and optimization notifications

## Environment Variables Reference

### API Service (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `PORT` | API server port | `3000` |
| `NODE_ENV` | Environment mode | `production` |

### API Service (Optional - for live trading)

| Variable | Description |
|----------|-------------|
| `COINBASE_API_KEY` | Coinbase API key |
| `COINBASE_API_SECRET` | Coinbase API secret |
| `DRY_RUN_DEFAULT` | Default dry-run mode (`true`/`false`) |

### Web Service (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXTAUTH_SECRET` | NextAuth encryption secret | 32-char hex string |
| `NEXTAUTH_URL` | Web dashboard URL | `https://...railway.app` |
| `API_URL` | API server URL | `https://...railway.app` |

## Monorepo Build Configuration

Railway automatically handles the monorepo structure. The build process:

1. Installs all dependencies at workspace root (`npm install`)
2. Builds all packages (`npm run build` at root)
3. Changes to service directory (`cd apps/api` or `cd apps/web`)
4. Starts the service

If you encounter build issues, check:
- `package.json` workspaces configuration
- TypeScript `tsconfig.json` references
- Build order in root `package.json`

## Cost Estimate

With Railway's $5/month free credit:

- **API Service**: ~$3/month (always-on, low traffic)
- **Web Service**: ~$2/month (Next.js SSR)
- **Total**: ~$5/month (covered by free credit)

For production with higher traffic:
- Scale API service: $10-20/month
- Scale Web service: $10-20/month
- MongoDB Atlas M0 (free) or M10 ($57/month)

## Troubleshooting

### "Cannot find module @coinruler/rules"

**Fix**: Ensure monorepo build runs first:
```json
"scripts": {
  "build": "npm run build --workspaces"
}
```

### "MongoDB connection timeout"

**Fix**: Check MongoDB Atlas IP whitelist includes `0.0.0.0/0`

### "NEXTAUTH_URL missing"

**Fix**: Set `NEXTAUTH_URL` to your Railway web service URL

### "Rules evaluator not running"

**Fix**: Check API logs for MongoDB connection errors. Evaluator starts after successful DB connection.

### "SSE events not working"

**Fix**: Railway supports SSE. Ensure `Content-Type: text/event-stream` header is set. Check browser console for connection errors.

## Custom Domain (Optional)

1. In Railway dashboard, go to Web service settings
2. Click "Custom Domain"
3. Add your domain (e.g., `coinruler.yourdomain.com`)
4. Update DNS with provided CNAME record
5. Update `NEXTAUTH_URL` environment variable to use your custom domain

## Continuous Deployment

Railway automatically deploys on `git push`:

```powershell
git add .
git commit -m "Update rules or add features"
git push origin main
```

Railway will:
1. Detect commit
2. Rebuild affected services
3. Deploy with zero downtime
4. Keep previous deployment for instant rollback

## Next Steps

- [ ] Review API logs for rules evaluator activity
- [ ] Test creating a rule via dashboard
- [ ] Verify BTC/XRP auto-execution
- [ ] Test approval flow for non-core assets
- [ ] Monitor performance alerts (5m intervals)
- [ ] Review nightly optimizer results (2 AM UTC)
- [ ] Add Discord/email notifications (optional)

## Support & Resources

- **Railway Docs**: https://docs.railway.app
- **CoinRuler Docs**: See `/WorkSpace/` directory
- **Rules Engine Guide**: `RULES_ENGINE_GUIDE.md`
- **Permissions**: `PERMISSIONS_AND_SNAPSHOTS.md`
- **Testing**: `QUICK_TEST_GUIDE.md`

---

**You now have a fully autonomous trading rules engine running 24/7 with:**
- ✅ JSON DSL for rule creation
- ✅ 60-second evaluation loop
- ✅ BTC/XRP auto-execution with baseline protection
- ✅ Approval system for non-core assets
- ✅ Self-learning optimizer (nightly at 2 AM UTC)
- ✅ Backtesting with historical simulation
- ✅ Risk management (max DD, velocity throttle, daily loss limits)
- ✅ Performance monitoring with alerts (5m intervals)
- ✅ Real-time web dashboard with SSE events
