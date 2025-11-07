# Deploy API Only to Railway

This guide simplifies Railway deployment so only the API service runs (bot & web handled elsewhere or later).

## Why This Change
Railway saw the original `Procfile` and tried to start both `web` (API) and `bot`. We commented out the bot line so only the API runs. Frontend is on Vercel; bot can be re-enabled later.

## Files Involved
- `railway.json` (builds packages + apps/api, starts API)
- `Procfile` (now only API active)
- `WorkSpace/apps/api` (Express server)

## Steps (GUI)
1. Create / open project on Railway.
2. Add new service from GitHub → select this repo.
3. If prompted for root directory, set: `.` (repo root). Railway will use `railway.json`.
4. Build Command (auto from `railway.json`): installs, builds packages, builds API.
5. Start Command (auto): `cd WorkSpace/apps/api && node dist/index.js`.
6. Add environment variables (Variables tab):
```
NODE_ENV=production
WEB_ORIGIN=https://<your-vercel-app>.vercel.app,http://localhost:3000
MONGODB_URI=your_mongo_uri_here   # optional for now
DATABASE_NAME=coinruler           # optional
```
7. Redeploy. Wait for log line: `API listening on :<port>`.
8. Copy the provided domain (Networking / Domains panel).
9. Test:
   - https://YOUR-API.up.railway.app/health
   - https://YOUR-API.up.railway.app/env

## Steps (CLI)
```powershell
npm install -g railway
railway login
cd WorkSpace\apps\api
railway init   # or railway link if project exists
railway variables set NODE_ENV "production"
railway variables set WEB_ORIGIN "https://<your-vercel-app>.vercel.app,http://localhost:3000"
railway up
railway url
```
Test with:
```powershell
Invoke-WebRequest -Uri "$(railway url)/health" -UseBasicParsing
```

## Re-Enabling the Bot Later
Edit `Procfile` and remove the `#` before bot line:
```
bot: cd WorkSpace/apps/bot && npm install && node dist/index.js
```
Railway will then detect two processes again; consider moving bot to a separate service for clearer logs.

## Vercel Integration
Set on Vercel:
```
NEXT_PUBLIC_API_BASE=https://YOUR-API.up.railway.app
```
Redeploy web; dashboard should show API: UP.

## Troubleshooting
| Issue | Cause | Fix |
|-------|-------|-----|
| Bot still starts | Cached Procfile | Trigger fresh deploy (Redeploy button) |
| Health 404 | API build failed | Check build logs; ensure `railway.json` present |
| CORS error | Missing WEB_ORIGIN prod domain | Update WEB_ORIGIN & redeploy |
| SSE not connecting | Wrong API base URL | Confirm NEXT_PUBLIC_API_BASE on Vercel |

## Next
After confirming connectivity you can tighten auth, add Mongo, and re-enable bot if needed.
