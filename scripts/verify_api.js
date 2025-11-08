#!/usr/bin/env node
// Automated API verification script
// Usage: node scripts/verify_api.js --base https://api.example.com --origin https://mycoinruler.xyz [--forceSnapshot]
// Node 18+ global fetch assumed.

const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return def;
  const val = args[idx].includes('=') ? args[idx].split('=')[1] : args[idx + 1];
  return val === undefined ? true : val;
}

const base = (getArg('base') || process.env.API_BASE || '').replace(/\/$/, '');
const origin = getArg('origin', 'https://mycoinruler.xyz');
const forceSnapshot = getArg('forceSnapshot', false) === 'true' || getArg('forceSnapshot') === true;
if (!/^https?:\/\//.test(base)) {
  console.error('ERROR: Provide --base https://your-api-domain');
  process.exit(1);
}

function hr(title) {
  console.log('\n' + '='.repeat(8) + ' ' + title + ' ' + '='.repeat(8));
}

async function fetchJson(path, opts = {}) {
  const url = base + path;
  const headers = Object.assign({ 'Origin': origin, 'Accept': 'application/json' }, opts.headers || {});
  try {
    const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: res.ok, status: res.status, headers: Object.fromEntries(res.headers.entries()), json };
  } catch (err) {
    return { ok: false, error: err.message, path };
  }
}

async function run() {
  hr('API Verification');
  console.log('Base:', base);
  console.log('Origin header:', origin);

  // 1. Version
  hr('Version');
  const version = await fetchJson('/version');
  console.log(version);

  // 2. Coinbase status
  hr('Coinbase Status');
  const coinbaseStatus = await fetchJson('/coinbase/status');
  console.log(coinbaseStatus);

  // 3. Portfolio current (pre snapshot)
  hr('Portfolio Current');
  const portfolioCurrent = await fetchJson('/portfolio/current');
  console.log({ status: portfolioCurrent.status, hasData: portfolioCurrent.json?.hasData, totalValueUSD: portfolioCurrent.json?.totalValueUSD });

  // 4. CORS metrics
  hr('CORS Metrics');
  const corsMetrics = await fetchJson('/metrics/cors');
  console.log(corsMetrics);
  const allowHeader = coinbaseStatus.headers?.['access-control-allow-origin'];
  console.log('Access-Control-Allow-Origin header for /coinbase/status:', allowHeader);
  if (allowHeader !== origin) {
    console.warn('WARN: Access-Control-Allow-Origin does not match requested origin.');
  }
  if ((corsMetrics.json?.fallback || 0) > 0) {
    console.warn('WARN: Fallback CORS path used. Consider updating WEB_ORIGIN env.');
  }

  // 5. Force snapshot if requested and credentials available
  if (forceSnapshot) {
    hr('Force Snapshot');
    if (!coinbaseStatus.json?.hasCredentials) {
      console.warn('Skipping force snapshot: credentials not configured');
    } else {
      const snap = await fetchJson('/portfolio/snapshot/force', { method: 'POST' });
      console.log(snap);
      const after = await fetchJson('/portfolio/current');
      console.log('Post-snapshot portfolio:', { hasData: after.json?.hasData, totalValueUSD: after.json?.totalValueUSD });
    }
  }

  // 6. Summary
  hr('Summary');
  const summary = {
    commit: version.json?.commit,
    hasCoinbaseCreds: !!coinbaseStatus.json?.hasCredentials,
    portfolioHasData: !!portfolioCurrent.json?.hasData,
    cors: {
      allowHeader,
      fallbackHits: corsMetrics.json?.fallback,
      allowedHits: corsMetrics.json?.allowed,
    },
  };
  console.log(summary);

  // Exit code logic: fail if CORS broken or missing creds (non-critical) or fallback used
  if (allowHeader !== origin) process.exitCode = 2;
  if ((corsMetrics.json?.fallback || 0) > 0) process.exitCode = 3;
  if (!coinbaseStatus.json?.hasCredentials) process.exitCode = process.exitCode || 0; // not fatal
}

run().catch(e => { console.error('Fatal script error', e); process.exit(1); });
