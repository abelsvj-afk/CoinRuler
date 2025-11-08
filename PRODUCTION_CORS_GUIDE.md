## Production CORS & Domain Validation

This guide helps you finalize custom domain access (e.g. `https://mycoinruler.xyz`) and validate Coinbase data loading end‑to‑end.

### 1. Current CORS Implementation Recap
The API parses a comma‑separated `WEB_ORIGIN` list supporting:
- Exact origins (`https://mycoinruler.xyz`)
- Wildcards (`https://*.vercel.app` or `*.example.com`)
- Fallback allowlist via `CORS_FALLBACK_ALLOW` for safety (suffix match).

Metrics exposed:
- `GET /metrics/cors` returns `{ allowed, fallback, ratioFallback, fallbackDomains, originsConfigured }`.
- `GET /env` also includes `corsMetrics`.

Goal: `fallback` should remain 0 after initial stabilization. If it increments, production relied on the emergency path and `WEB_ORIGIN` must be corrected.

### 2. Set Correct Railway Variables
In Railway → API Service → Variables:
```
WEB_ORIGIN=https://mycoinruler.xyz,https://www.mycoinruler.xyz,http://localhost:3000,https://*.vercel.app
CORS_FALLBACK_ALLOW=mycoinruler.xyz
```
Optional (keep for wildcard dev): include vercel wildcard only if you still use the staging web.

Redeploy after saving. Watch deploy logs for line:
```
Startup CORS ORIGINS resolved: https://mycoinruler.xyz, https://www.mycoinruler.xyz, http://localhost:3000, https://*.vercel.app
```

### 3. Verification Script Usage
Run locally (replace BASE):
```powershell
node scripts/verify_api.js --base https://YOUR_API_DOMAIN --origin https://mycoinruler.xyz
```
Expect:
- `/version` returns commit hash.
- `/coinbase/status` returns `hasCredentials: false` until you add keys.
- Access-Control-Allow-Origin header equals `https://mycoinruler.xyz`.
- `/metrics/cors` => `fallback: 0`.

### 4. Adding Coinbase Credentials
Add:
```
COINBASE_API_KEY=****
COINBASE_API_SECRET=****
COINBASE_API_PASSPHRASE=****   # if required by your key type
```
Redeploy. Re-run script; expect `/coinbase/status`:
```
{ hasCredentials: true, status: "connected", balancesSample: { ... } }
```
If `status` is `failed` or `error`, double-check key, secret, passphrase ordering.

### 5. Force Initial Snapshot
```powershell
node scripts/verify_api.js --base https://YOUR_API_DOMAIN --origin https://mycoinruler.xyz --forceSnapshot
```
Follow-up `/portfolio/current` should show:
```
hasData: true
totalValueUSD: > 0
```

### 6. Troubleshooting Matrix
| Symptom | Likely Cause | Action |
|---------|--------------|--------|
| CORS blocked / header missing | Origin not in `WEB_ORIGIN` | Add domain; redeploy |
| `fallback > 0` | Domain relied on fallback | Add apex & www to `WEB_ORIGIN`; redeploy |
| `hasCredentials: false` | Missing API key vars | Add and redeploy |
| `status: failed` on `/coinbase/status` | Connectivity / rate limit | Wait & retry; confirm key permissions |
| Snapshot returns error | Credentials incomplete | Re-add all three fields (key/secret/passphrase) |

### 7. Post-Stabilization Hardening
- Remove unused wildcard domains to reduce attack surface.
- Set an alert if `fallback > 0` after stabilization (log aggregator or simple periodic script).
- Consider adding `WEB_ORIGIN_LOCK=1` (future feature) to disallow runtime changes.

### 8. Optional PowerShell One-Liners
```powershell
# Quick header check
Invoke-WebRequest -UseBasicParsing -Uri https://YOUR_API_DOMAIN/coinbase/status -Headers @{Origin='https://mycoinruler.xyz'} | Select-Object -ExpandProperty Headers

# Just metrics
Invoke-RestMethod -Uri https://YOUR_API_DOMAIN/metrics/cors
```

### 9. Success Criteria
- CORS stable (no fallback hits after initial deploy window).
- Coinbase connection = connected.
- Portfolio populated with `hasData: true`.
- Tests pass locally (`coinbase-status.test.ts`).

### 10. Next Suggested Enhancements
- Add `/metrics/system` aggregating snapshot cadence adjustments & risk throttle state.
- Wire a small Prometheus exporter (translate current counters to gauges).
- Add integration test that boots a real server instance (future, currently minimal stub).

---
Maintained automatically via the engineering workflow; update when new domains or metrics added.
