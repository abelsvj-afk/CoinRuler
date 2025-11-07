# Railway Web Deployment Guide

## Deploy Web App to Railway

### 1. Create New Service in Railway
- Open your Railway project
- Click "New Service"
- Select "GitHub Repo"
- Choose your CoinRuler repository
- Set root directory: `WorkSpace/apps/web`

### 2. Configure Environment Variables
Add these in Railway's Variables tab:
```
NEXT_PUBLIC_API_BASE=https://your-api-service.railway.app
NODE_ENV=production
```

### 3. Configure Build Settings
Railway will auto-detect the Dockerfile and build it.

Build settings:
- Build Command: Automatic (uses Dockerfile)
- Start Command: `node server.js`
- Port: 3000 (auto-detected)

### 4. Custom Domain (Optional)
- Go to Settings → Domains
- Add custom domain or use Railway's generated URL
- Example: `coinruler.up.railway.app`

### 5. Deploy
- Push changes to GitHub
- Railway auto-deploys on every push to main

## Testing the Deployment
Once deployed, visit your Railway URL:
- Homepage: `https://your-web-service.railway.app`
- Should connect to API automatically

## Troubleshooting
If deployment fails:
1. Check Railway build logs
2. Verify `NEXT_PUBLIC_API_BASE` points to your API service
3. Ensure Dockerfile is in `WorkSpace/apps/web/`
4. Make sure `output: 'standalone'` is in next.config.ts

## Auto-Deploy on Push
Railway automatically redeploys when you:
- Push to main branch
- Merge pull requests
- Update environment variables
