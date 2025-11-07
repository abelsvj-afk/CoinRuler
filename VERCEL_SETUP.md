# Vercel Deployment Setup for CoinRuler

## Problem: 404 NOT_FOUND Error

Your build succeeds but the deployment shows 404. This is because Vercel doesn't know where the Next.js app is located in your monorepo.

## Solution: Configure Root Directory in Vercel Dashboard

### Step 1: Update Root Directory Setting

1. Go to **https://vercel.com/dashboard**
2. Click on your **CoinRuler** project
3. Go to **Settings** (top navigation)
4. Scroll to **Root Directory** section
5. Click **Edit**
6. Set Root Directory to: `WorkSpace/apps/web`
7. Click **Save**

### Step 2: Set Environment Variables

While in Settings, go to **Environment Variables** and add:

#### Required Variables:
```bash
NEXT_PUBLIC_API_BASE=https://your-railway-api.railway.app
NEXTAUTH_URL=https://your-vercel-domain.vercel.app
NEXTAUTH_SECRET=<generate with command below>
```

Generate NEXTAUTH_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Optional (for Discord login):
```bash
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
```

### Step 3: Redeploy

After changing the Root Directory:

1. Go to **Deployments** tab
2. Click on the latest deployment
3. Click the **⋮** (three dots) menu
4. Click **Redeploy**
5. Confirm the redeployment

OR just push a new commit:
```bash
git commit --allow-empty -m "trigger redeploy"
git push origin main
```

### Step 4: Verify Build Settings

In **Settings → General → Build & Development Settings**, you should see:

- **Framework Preset:** Next.js
- **Root Directory:** WorkSpace/apps/web
- **Build Command:** (leave default or use `npm run build`)
- **Output Directory:** (leave default `.next`)
- **Install Command:** (leave default or use `npm install`)

## Alternative: Use Vercel CLI

If you prefer CLI setup:

```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Link this project
cd c:\Users\Student\Desktop\CoinRuler\WorkSpace\apps\web
vercel link

# Deploy
vercel --prod
```

## Troubleshooting

### Still Getting 404?

1. **Check Deployment Logs**: Look for any build errors
2. **Verify Root Directory**: Make sure it's set to `WorkSpace/apps/web`
3. **Check Framework Detection**: Should auto-detect as Next.js
4. **Clear Build Cache**: In Settings → General, scroll to "Delete Build Cache"

### Build Succeeds but Runtime Errors?

1. Check browser console for errors
2. Verify `NEXT_PUBLIC_API_BASE` is set correctly
3. Check that `NEXTAUTH_SECRET` is set
4. Look at Function Logs in Vercel dashboard

### CORS Issues?

Make sure your Railway API has:
```bash
WEB_ORIGIN=https://your-vercel-domain.vercel.app
```

## Expected Behavior After Fix

Once Root Directory is set correctly:

✅ Build completes successfully  
✅ Deployment shows "Ready" status  
✅ Clicking "Visit" opens your site  
✅ You see the CoinRuler login page or dashboard  
✅ API status indicators work  
✅ SSE connection establishes  

## Next Steps

After deployment works:

1. Test login functionality
2. Verify API connection
3. Check SSE live updates
4. Test all pages (dashboard, approvals, alerts, etc.)
5. Configure custom domain (optional)
