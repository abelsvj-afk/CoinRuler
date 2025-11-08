# Quick Deploy Fix Guide

## Problem
- Web app (Vercel) can't reach API (Railway) due to CORS blocking

## Solution Applied Locally ✅
- Added `WEB_ORIGIN` to API `.env` with Vercel domains
- API now allows: `https://*.vercel.app`

## Deploy to Production

### 1. Railway API Setup

Go to https://railway.app/ → Your API Service → Variables tab

Add/Update these (use your own secret values; do NOT paste real secrets into source control):
```
WEB_ORIGIN=https://*.vercel.app,https://YOUR-ACTUAL-VERCEL-URL.vercel.app
PORT=3001
MONGODB_URI=YOUR_MONGODB_URI
DATABASE_NAME=YOUR_DB_NAME
DRY_RUN=true
OWNER_ID=YOUR_OWNER_ID
COINBASE_API_KEY=YOUR_COINBASE_API_KEY
COINBASE_API_SECRET=YOUR_COINBASE_API_SECRET
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
```

**Then click "Redeploy"**

### 2. Vercel Web Setup

Go to https://vercel.com/dashboard → Your Web Project → Settings → Environment Variables

Add:
```
NEXT_PUBLIC_API_BASE=https://YOUR-RAILWAY-API-URL.railway.app
```

Get your Railway API URL from:
- Railway dashboard → API service → Settings → Domains

**Then trigger a redeploy** (Settings → Deployments → Redeploy latest)

### 3. Test

Visit your Vercel URL in browser and check:
- Dashboard loads
- Health status shows green
- Portfolio data appears

## Troubleshooting

### If Vercel still can't connect:
1. Open browser console (F12)
2. Look for CORS error with actual origin
3. Add that exact origin to Railway's `WEB_ORIGIN`

### If Railway isn't responding:
1. Check Railway logs
2. Verify MongoDB connection string is correct
3. Ensure PORT is set to 3001

### Quick Test URLs:
- Railway API health: `https://YOUR-RAILWAY-URL.railway.app/health`
- Vercel web: `https://YOUR-VERCEL-URL.vercel.app`
