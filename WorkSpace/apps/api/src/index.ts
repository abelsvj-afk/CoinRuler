import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { Approval, KillSwitch, PortfolioSnapshot, monteCarloSimulation, getCoinbaseApiClient, validateEnv, isDryRun, getEnv, getLogger, hasCoinbaseCredentials } from '@coinruler/shared';
// Lazy import of rules package (monorepo build order safety)
import { parseRule, createRule as createRuleDoc, listRules as listRuleDocs, setRuleEnabled, evaluateRulesTick, runOptimizationCycle, backtestRule, getRiskState, recordExecution, type EvalContext, type RuleSpec, type BacktestConfig } from '@coinruler/rules';
import {
  getRotationStatus,
  rotateAPIKey,
  getRotationPolicy,
  updateRotationPolicy,
  startRotationScheduler,
  stopRotationScheduler,
  getSchedulerStatus,
  forceRotationCheck,
  type CredentialService,
} from '@coinruler/security';
import { getLLMAdvice, streamLLMAdvice, type ChatMessage } from '@coinruler/llm';
import { EventEmitter } from 'events';

// Coinbase WebSocket for live prices (browser environment compatibility)
let coinbaseWsClient: any = null;

// Initialize Coinbase WebSocket if in browser-like environment
if (typeof WebSocket !== 'undefined') {
  try {
    const { getCoinbaseWebSocketClient } = require('@coinruler/shared/coinbaseWebSocket');
    coinbaseWsClient = getCoinbaseWebSocketClient();
    
    // Connect and forward events to SSE clients
    coinbaseWsClient.connect();
    
    coinbaseWsClient.on('price:update', (data: any) => {
      liveEvents.emit('price', data);
    });
    
    coinbaseWsClient.on('whale:trade', (data: any) => {
      liveEvents.emit('alert', {
        type: 'whale',
        severity: 'high',
        message: `Large ${data.symbol} trade: $${data.value.toFixed(2)}`,
        data,
        timestamp: new Date().toISOString(),
      });
    });
    
    coinbaseWsClient.on('alert:volatility', (data: any) => {
      liveEvents.emit('alert', {
        type: 'volatility',
        severity: data.severity,
        message: `${data.symbol} moved ${data.change.toFixed(2)}%`,
        data,
        timestamp: new Date().toISOString(),
      });
    });
    
    console.log('✅ Coinbase WebSocket integration enabled');
  } catch (err) {
    console.log('ℹ️  Coinbase WebSocket: Browser-only feature (optional for Node.js API)');
  }
}

// Validate environment early
try {
  validateEnv();
  getLogger({ svc: 'api' }).info('Environment variables validated');
} catch (e) {
  getLogger({ svc: 'api' }).error('Environment validation failed. Exiting.');
  process.exit(1);
}

// Real-time event emitter for SSE
const liveEvents = new EventEmitter();
let sseClientCount = 0;
liveEvents.setMaxListeners(100); // Support many concurrent SSE clients

const app = express();
app.use(helmet({
  contentSecurityPolicy: false, // Allow SSE
}));
// CORS to allow the web app to call the API from a different port
// Support multiple origins via comma-separated WEB_ORIGIN values
// Accept forms like:
//  - http://localhost:3000
//  - https://app.example.com
//  - *.example.com
//  - https://*.vercel.app (scheme-prefixed wildcard)
const ORIGIN_RAW = process.env.WEB_ORIGIN || process.env.NEXT_PUBLIC_WEB_ORIGIN || 'http://localhost:3000';
const ORIGINS = ORIGIN_RAW.split(',').map(o => o.trim()).filter(Boolean);

type AllowedOrigin = {
  raw: string;
  scheme?: 'http:' | 'https:';
  host?: string; // without scheme
  wildcardBase?: string; // e.g. vercel.app for *.vercel.app
};

function parseAllowed(originStr: string): AllowedOrigin {
  // Normalize: pull out scheme if present
  try {
    // If no scheme provided, URL() will throw; handle below
    const u = new URL(originStr);
    const host = u.host; // includes hostname[:port]
    if (host.startsWith('*.') || host.startsWith('%2A.')) {
      return { raw: originStr, scheme: u.protocol as any, wildcardBase: host.replace(/^\*\*?\.?/, '').replace(/^%2A\.?/, '') };
    }
    return { raw: originStr, scheme: u.protocol as any, host };
  } catch {
    // No scheme: could be exact host or wildcard like *.domain.com
    const str = originStr.replace(/^https?:\/\//, '');
    if (str.startsWith('*.') || str.startsWith('%2A.')) {
      return { raw: originStr, wildcardBase: str.replace(/^\*\*?\.?/, '').replace(/^%2A\.?/, '') };
    }
    return { raw: originStr, host: str };
  }
}

const ALLOWED: AllowedOrigin[] = ORIGINS.map(parseAllowed);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin like curl or same-origin
    if (!origin) return callback(null, true);

    let u: URL | null = null;
    try { u = new URL(origin); } catch { /* ignore */ }
    const originHost = u?.host || origin.replace(/^https?:\/\//, '');
    const originScheme = (u?.protocol as 'http:' | 'https:' | undefined);

    const allowed = ALLOWED.some(a => {
      // Exact string match first (covers fully-qualified entries)
      if (origin === a.raw) return true;

      // Wildcard host match
      if (a.wildcardBase) {
        const base = a.wildcardBase.toLowerCase();
        const host = originHost.toLowerCase();
        const schemeOk = !a.scheme || a.scheme === originScheme;
        if (!schemeOk) return false;
        // Allow apex and any subdomain
        return host === base || host.endsWith(`.${base}`);
      }

      // Non-wildcard host comparison (with or without scheme in config)
      if (a.host) {
        const host = originHost.toLowerCase();
        const allowedHost = a.host.toLowerCase();
        const schemeOk = !a.scheme || a.scheme === originScheme;
        return schemeOk && host === allowedHost;
      }

      return false;
    });

    if (allowed) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));
app.options('*', cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60_000, max: 60 }));
// Extra request logger for deploy debugging (first 100 chars of path & UA)
app.use((req, _res, next) => {
  try {
    const ua = (req.headers['user-agent'] || '').toString().slice(0, 80);
    console.log(`[req] ${req.method} ${req.url} ua=${ua}`);
  } catch {}
  next();
});

// Lightweight mode flag to disable background schedulers & heavy tasks (for debugging deploy 502s)
const LIGHT_MODE = process.env.LIGHT_MODE === 'true';

// Root ping for platform health probes
app.get('/', (_req, res) => {
  res.type('text/plain').send('coinruler-api:ok');
});

let db: Db | null = null;
let lastRuleExecutions: Record<string, Date> = {};

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'coinruler';

// Connection options to fix SSL/TLS issues
// Note: tlsAllowInvalidCertificates set to true temporarily for MongoDB Atlas compatibility
// Determine TLS usage dynamically: use TLS for Atlas (mongodb+srv) URIs, disable for plain localhost fallback
const mongoOptions = (() => {
  const isSrv = MONGODB_URI.startsWith('mongodb+srv://');
  return {
    tls: isSrv,
    tlsAllowInvalidCertificates: isSrv, // Allow flexibility only for Atlas
    tlsAllowInvalidHostnames: false,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    retryWrites: true,
    w: 'majority' as const,
    maxPoolSize: 10,
  };
})();

async function connectMongoDB() {
  try {
    console.log(`🔄 Attempting MongoDB connection to ${MONGODB_URI.replace(/\/\/.*@/, '//<credentials>@')}...`);
    const client = await MongoClient.connect(MONGODB_URI, mongoOptions);
    db = client.db(DATABASE_NAME);
    getLogger({ svc: 'api' }).info('MongoDB connected successfully');
    liveEvents.emit('system:health', { component: 'mongodb', status: 'connected' });
    return true;
  } catch (err: any) {
    const log = getLogger({ svc: 'api' });
    log.error({ err: err?.message }, 'MongoDB connection error');
    log.warn('API will start in degraded mode without database access.');
    log.warn('Check: 1) MongoDB Atlas IP whitelist, 2) Credentials, 3) Cluster status');
    // Retry in background without blocking startup
    setTimeout(async () => {
      getLogger({ svc: 'api' }).info('Retrying MongoDB connection...');
      try {
        const client = await MongoClient.connect(MONGODB_URI, mongoOptions);
        db = client.db(DATABASE_NAME);
        getLogger({ svc: 'api' }).info('MongoDB reconnected successfully');
        liveEvents.emit('system:health', { component: 'mongodb', status: 'reconnected' });
      } catch (retryErr: any) {
        getLogger({ svc: 'api' }).error({ err: retryErr?.message }, 'MongoDB retry failed');
      }
    }, 30000); // Retry after 30s
    return false;
  }
}

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, db: db ? 'connected' : 'disconnected', dryRun: isDryRun() }));

// Quick env diagnostics (safe subset only)
app.get('/env', (_req, res) => {
  res.json({
    ok: true,
    origins: ORIGINS,
    port: Number(process.env.API_PORT || process.env.PORT || 3001),
    hasMongoUri: !!process.env.MONGODB_URI,
    hasOwnerId: !!getEnv().OWNER_ID,
    hasCoinbaseKey: !!process.env.COINBASE_API_KEY,
    hasCoinbaseSecret: !!process.env.COINBASE_API_SECRET,
    coinbaseKeyLength: process.env.COINBASE_API_KEY?.length || 0,
  });
});

// Version endpoint to verify deployed build hash/time
app.get('/version', (_req, res) => {
  res.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.COMMIT_SHA || 'unknown',
    builtAt: process.env.BUILD_TIME || new Date().toISOString(),
    features: ['portfolio/current','balances','approvals/pending','analysis/projection','report/daily']
  });
});

// Full system diagnostics
app.get('/health/full', async (_req, res) => {
  const checks: any = {
    time: new Date().toISOString(),
    dbConnected: !!db,
    sseClients: sseClientCount,
    lastRuleExecutions: Object.keys(lastRuleExecutions || {}).length,
    dryRun: isDryRun(),
    ownerProtection: !!getEnv().OWNER_ID,
  };
  try {
    if (db) {
      // Mongo ping and quick counts
      await db.command({ ping: 1 });
      checks.mongodb = 'ok';
      checks.counts = {
        approvals: await db.collection('approvals').countDocuments({ status: 'pending' }),
        rules: await db.collection('rules').countDocuments({ enabled: true }),
        snapshots: await db.collection('snapshots').countDocuments(),
        alerts24h: await db.collection('alerts')?.countDocuments?.({ ts: { $gt: new Date(Date.now() - 24*60*60*1000) } }).catch?.(() => undefined),
      };
      // Kill-switch status
      const ks = await db.collection('state').findOne({ key: 'killSwitch' });
      checks.killSwitch = ks?.value || { enabled: false };
    }
    
    // Coinbase integration (optional)
    if (hasCoinbaseCredentials()) {
      try {
        const coinbaseClient = getCoinbaseApiClient();
        const isConnected = await coinbaseClient.testConnection();
        checks.coinbase = {
          status: isConnected ? 'connected' : 'failed',
          apiKeyConfigured: true,
        };
        if (isConnected) {
        // Get live balances
        const balances = await coinbaseClient.getAllBalances();
        const prices = await coinbaseClient.getSpotPrices(Object.keys(balances));
        checks.coinbase.balances = balances;
        checks.coinbase.prices = prices;
        // Calculate total portfolio value
        let totalValue = 0;
        for (const [currency, amount] of Object.entries(balances)) {
          totalValue += (amount as number) * (prices[currency] || 0);
        }
        checks.coinbase.totalValueUSD = totalValue.toFixed(2);
        
        // Get collateral information (if available)
        try {
          const collateral = await coinbaseClient.getCollateral();
          checks.coinbase.collateral = collateral;
          
          // Store collateral in MongoDB for risk layer
          if (db && collateral.length > 0) {
            await db.collection('collateral').deleteMany({}); // Clear old data
            await db.collection('collateral').insertMany(
              collateral.map((c: any) => ({
                ...c,
                updatedAt: new Date(),
              }))
            );
          }
        } catch (collateralErr: any) {
          checks.coinbase.collateralError = collateralErr.message;
        }
        }
      } catch (err: any) {
        checks.coinbase = {
          status: 'error',
          error: err.message,
          apiKeyConfigured: true,
        };
      }
    } else {
      checks.coinbase = { status: 'disabled', apiKeyConfigured: false };
    }
  } catch (err: any) {
    checks.mongodb = 'error';
    checks.error = err.message;
  }
  res.json(checks);
});

// Status
app.get('/status', (_req, res) => res.json({ status: 'running', ts: new Date().toISOString() }));

// Get approvals
app.get('/approvals', async (_req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const approvals = await db.collection<Approval>('approvals')
      .find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
    res.json(approvals);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create approval
app.post('/approvals', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const approval: Approval = {
      ...req.body,
      status: 'pending',
      createdAt: new Date(),
    };
    const result = await db.collection<Approval>('approvals').insertOne(approval as any);
    const created = { id: result.insertedId, ...approval };
    liveEvents.emit('approval:created', created); // Broadcast to SSE clients
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update approval status
app.patch('/approvals/:id', ownerAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { id } = req.params;
    const { status, actedBy } = req.body;
    await db.collection('approvals').updateOne(
      { _id: new ObjectId(id) as any },
      { $set: { status, actedBy, actedAt: new Date() } }
    );
    liveEvents.emit('approval:updated', { id, status, actedBy }); // Broadcast to SSE clients
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Kill-switch endpoints
app.get('/kill-switch', async (_req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const ks = await db.collection<KillSwitch>('kill_switch').findOne({});
    res.json(ks || { enabled: false, reason: '', timestamp: new Date() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/kill-switch', ownerAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { enabled, reason, setBy } = req.body;
    const ks: KillSwitch = { enabled, reason, timestamp: new Date(), setBy };
    await db.collection<KillSwitch>('kill_switch').replaceOne({}, ks, { upsert: true });
    liveEvents.emit('killswitch:changed', ks); // Broadcast to SSE clients
    res.json(ks);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Portfolio snapshot
app.get('/portfolio', async (_req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const snapshot = await db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
    res.json(snapshot || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create snapshot and notify (for deposits or significant changes)
app.post('/portfolio/snapshot', ownerAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { balances, prices, reason, isDeposit, depositAmounts } = req.body;
    const snapshot = {
      ...balances,
      _prices: prices,
      timestamp: new Date(),
      reason: reason || 'manual',
    };
    
    // Store snapshot
    await db.collection('snapshots').insertOne(snapshot);
    
    // If deposit, auto-increment baselines
    if (isDeposit && depositAmounts) {
      const objectives = await db.collection('objectives').findOne({ key: 'owner' });
      if (objectives?.value?.coreAssets) {
        const coreAssets = objectives.value.coreAssets;
        let updated = false;
        
        if (depositAmounts.BTC && coreAssets.BTC?.autoIncrementOnDeposit) {
          coreAssets.BTC.baseline = (coreAssets.BTC.baseline || 0) + depositAmounts.BTC;
          updated = true;
        }
        if (depositAmounts.XRP && coreAssets.XRP?.autoIncrementOnDeposit) {
          coreAssets.XRP.baseline = (coreAssets.XRP.baseline || 0) + depositAmounts.XRP;
          updated = true;
        }
        
        if (updated) {
          await db.collection('objectives').updateOne(
            { key: 'owner' },
            { $set: { 'value.coreAssets': coreAssets, updatedAt: new Date() } }
          );
          console.log('✅ Baselines auto-incremented on deposit');
        }
      }
    }
    
    // Emit snapshot event for notifications
    liveEvents.emit('portfolio:snapshot', { snapshot, reason, isDeposit });
    
    res.json({ ok: true, snapshot });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Force snapshot creation from live Coinbase balances (no auth required for testing)
app.post('/portfolio/snapshot/force', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    if (!hasCoinbaseCredentials()) {
      return res.status(400).json({ error: 'Coinbase credentials not configured' });
    }
    
    const client = getCoinbaseApiClient();
    const balances = await client.getAllBalances();
    const prices = await client.getSpotPrices(Object.keys(balances));
    
    const snapshot = {
      ...balances,
      _prices: prices,
      timestamp: new Date(),
      reason: 'force-refresh',
    };
    
    await db.collection('snapshots').insertOne(snapshot);
    
    // Initialize baselines if not present
    const baselineDoc = await db.collection('baselines').findOne({ key: 'owner' });
    if (!baselineDoc) {
      const baselines = {
        BTC: { baseline: balances.BTC || 0 },
        XRP: { baseline: Math.max(10, balances.XRP || 0) }
      };
      await db.collection('baselines').insertOne({ key: 'owner', value: baselines, createdAt: new Date() });
    }
    
    liveEvents.emit('portfolio:snapshot', { snapshot, reason: 'force-refresh' });
    
    res.json({ ok: true, snapshot, message: 'Snapshot created from live Coinbase data' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Portfolio comparison (detect significant changes)
app.get('/portfolio/changes', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { since } = req.query;
    const sinceDate = since ? new Date(since as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const [latest, baseline] = await Promise.all([
      db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } }),
      db.collection('snapshots').findOne({ timestamp: { $gte: sinceDate } }, { sort: { timestamp: 1 } }),
    ]);
    
    if (!latest || !baseline) {
      return res.json({ changes: [], message: 'Insufficient data' });
    }
    
    const changes = [];
    const latestPrices = (latest as any)._prices || {};
    const baselinePrices = (baseline as any)._prices || {};
    
    for (const coin of Object.keys(latest)) {
      if (coin === '_id' || coin === '_prices' || coin === 'timestamp' || coin === 'reason') continue;
      
      const latestQty = (latest as any)[coin] || 0;
      const baselineQty = (baseline as any)[coin] || 0;
      const qtyChange = latestQty - baselineQty;
      const latestPrice = latestPrices[coin] || 0;
      const baselinePrice = baselinePrices[coin] || 0;
      const valueChange = (latestQty * latestPrice) - (baselineQty * baselinePrice);
      const pctChange = baselinePrice > 0 ? ((latestPrice - baselinePrice) / baselinePrice) * 100 : 0;
      
      if (Math.abs(qtyChange) > 0.0001 || Math.abs(pctChange) > 5) {
        changes.push({
          coin,
          qtyChange,
          priceChange: latestPrice - baselinePrice,
          pctChange: pctChange.toFixed(2) + '%',
          valueChange: valueChange.toFixed(2),
          latestQty,
          latestPrice,
        });
      }
    }
    
    res.json({ changes, since: sinceDate, latest: latest.timestamp });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Monte Carlo simulation
app.post('/monte-carlo', async (req, res) => {
  try {
    const { portfolio, sims = 1000, days = 30 } = req.body;
    const result = monteCarloSimulation(portfolio, sims, days);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard data
app.get('/dashboard', async (_req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const [portfolio, approvals, killSwitch, reports] = await Promise.all([
      db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } }),
      db.collection<Approval>('approvals').find({ status: 'pending' }).limit(5).toArray(),
      db.collection<KillSwitch>('kill_switch').findOne({}),
      db.collection('reports').find({}).sort({ createdAt: -1 }).limit(10).toArray(),
    ]);
    
    res.json({
      portfolio: portfolio || {},
      approvals,
      killSwitch: killSwitch || { enabled: false, reason: '', timestamp: new Date() },
      reports,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Current portfolio with balances, USD value, freshness & baselines
app.get('/portfolio/current', async (_req, res) => {
  try {
    const latest = await db?.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
    let balances: Record<string, number> = {};
    let prices: Record<string, number> = {};
    let usdTotal = 0;
    if (latest) {
      prices = (latest as any)._prices || {};
      for (const k of Object.keys(latest)) {
        if (['_id','_prices','timestamp','reason'].includes(k)) continue;
        const qty = (latest as any)[k];
        if (typeof qty === 'number') {
          balances[k] = qty;
          usdTotal += qty * (prices[k] || 0);
        }
      }
    } else if (hasCoinbaseCredentials()) {
      // Fallback to live fetch if no snapshot exists yet
      try {
        const client = getCoinbaseApiClient();
        balances = await client.getAllBalances();
        prices = await client.getSpotPrices(Object.keys(balances));
        for (const c of Object.keys(balances)) usdTotal += (balances[c] || 0) * (prices[c] || 0);
      } catch {}
    }
    // Baselines seed
    const baselineDoc = await db?.collection('baselines').findOne({ key: 'owner' });
    let baselines = baselineDoc?.value || { BTC: { baseline: balances.BTC || 0 }, XRP: { baseline: Math.max(10, balances.XRP || 0) } };
    if (!baselineDoc && db) {
      await db.collection('baselines').insertOne({ key: 'owner', value: baselines, createdAt: new Date() });
    }
    const ts = latest?.timestamp || null;
    const ageMs = ts ? Date.now() - new Date(ts).getTime() : null;
    res.json({
      balances,
      prices,
      totalValueUSD: Number(usdTotal.toFixed(2)),
      baselines,
      xrpAboveBaseline: balances.XRP && baselines.XRP?.baseline ? Math.max(0, balances.XRP - baselines.XRP.baseline) : 0,
      btcFree: balances.BTC || 0, // collateral lock handled separately
      updatedAt: ts,
      ageMs,
      hasData: Object.keys(balances).length > 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Raw balances (live fetch if credentials present, else from snapshot)
app.get('/balances', async (_req, res) => {
  try {
    let live: Record<string, number> = {};
    let prices: Record<string, number> = {};
    let source: 'live' | 'snapshot' = 'snapshot';
    if (hasCoinbaseCredentials()) {
      try {
        const client = getCoinbaseApiClient();
        live = await client.getAllBalances();
        prices = await client.getSpotPrices(Object.keys(live));
        source = 'live';
      } catch (e: any) {
        // fallback to snapshot
      }
    }
    if (!Object.keys(live).length) {
      const latest = await db?.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
      if (latest) {
        for (const k of Object.keys(latest)) {
          if (['_id','_prices','timestamp','reason'].includes(k)) continue;
          const qty = (latest as any)[k];
          if (typeof qty === 'number') live[k] = qty;
        }
        prices = (latest as any)._prices || {};
      }
    }
    let totalUSD = 0;
    for (const c of Object.keys(live)) totalUSD += live[c] * (prices[c] || 0);
    res.json({ balances: live, prices, totalUSD: Number(totalUSD.toFixed(2)), source });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pending approvals (explicit endpoint)
app.get('/approvals/pending', async (_req, res) => {
  try {
    const items = await db?.collection('approvals').find({ status: 'pending' }).sort({ createdAt: -1 }).limit(50).toArray() || [];
    res.json({ count: items.length, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Simple projection endpoint combining Monte Carlo & placeholder ML confidence
app.get('/analysis/projection', async (_req, res) => {
  try {
    const latest = await db?.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
    const balances: Record<string, number> = {};
    const prices: Record<string, number> = (latest as any)?._prices || {};
    if (latest) {
      for (const k of Object.keys(latest)) {
        if (['_id','_prices','timestamp','reason'].includes(k)) continue;
        const qty = (latest as any)[k];
        if (typeof qty === 'number') balances[k] = qty;
      }
    }
    // Monte Carlo on portfolio value (aggregate)
    const portfolioValue: Record<string, number> = {};
    for (const c of Object.keys(balances)) portfolioValue[c] = balances[c] * (prices[c] || 0);
  const sims = monteCarloSimulation(portfolioValue as any, 1000, 30);
    // Placeholder ML confidence: higher if BTC & USDC present
    const mlConfidence = (balances.BTC ? 0.4 : 0) + (balances.USDC ? 0.3 : 0) + (balances.XRP ? 0.2 : 0);
    const confidence = Math.min(0.95, 0.1 + mlConfidence);
    res.json({
      monteCarlo: sims,
      confidence,
      summary: {
        mean: sims.mean,
        median: sims.median,
        p5: sims.percentile_5,
        p95: sims.percentile_95,
        samples: sims.outcomes?.length || 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Daily reports (stub) - last 7 days from reports collection
app.get('/report/daily', async (_req, res) => {
  try {
    const docs = await db?.collection('reports').find({}).sort({ createdAt: -1 }).limit(50).toArray() || [];
    // Group by date
    const grouped: Record<string, any[]> = {};
    for (const r of docs) {
      const d = new Date(r.createdAt || r.timestamp || Date.now()).toISOString().slice(0,10);
      grouped[d] = grouped[d] || [];
      grouped[d].push(r);
    }
    const daily = Object.entries(grouped).slice(0,7).map(([day, items]) => ({ day, count: items.length, samples: items.slice(0,3) }));
    res.json({ days: daily });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Objectives (owner portfolio and policy) endpoints
app.get('/objectives', async (_req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    // Use a string key without ObjectId constraint by omitting _id special handling
    const objectives = await db.collection('objectives').findOne({ key: 'owner' });
    res.json(objectives?.value || {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/objectives', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const doc = { key: 'owner', value: req.body, updatedAt: new Date() };
    await db.collection('objectives').updateOne({ key: 'owner' }, { $set: doc }, { upsert: true });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Rules CRUD endpoints
app.get('/rules', async (_req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const rules = await listRuleDocs(db);
    res.json(rules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/rules', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const spec = parseRule(req.body as RuleSpec);
    const created = await createRuleDoc(db, spec);
    res.json(created);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/rules/:id/activate', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { id } = req.params;
    const { enabled } = req.body as { enabled: boolean };
    await setRuleEnabled(db, id, !!enabled);
    
    // Send alert on activation change
    const rule = await db.collection('rules').findOne({ _id: new ObjectId(id) as any });
    liveEvents.emit('alert', {
      type: 'rule_status',
      severity: 'info',
      message: `Rule ${rule?.name || id} ${enabled ? 'activated' : 'deactivated'}`,
      data: { ruleId: id, enabled },
      timestamp: new Date().toISOString(),
    });
    
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/rules/:id/metrics', async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { id } = req.params;
    const docs = await db.collection('ruleMetrics').find({ ruleVersionId: id }).sort({ windowEnd: -1 }).limit(50).toArray();
    res.json(docs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Run optimizer manually or get last results
app.post('/rules/optimize', ownerAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const config = req.body || {};
    const results = await runOptimizationCycle(db, config);
    
    // Send alert for optimization results
    if (results.length > 0) {
      liveEvents.emit('alert', {
        type: 'optimization',
        severity: 'medium',
        message: `Optimizer generated ${results.length} rule improvements`,
        data: { candidateCount: results.length, topCandidates: results.slice(0, 3) },
        timestamp: new Date().toISOString(),
      });
    }
    
    // Create approvals for top candidates
    for (const result of results.slice(0, 3)) {
      const approval: Approval = {
        type: 'stake-suggestion',
        coin: 'RULE_UPDATE',
        amount: 0,
        title: `Optimize: ${result.candidateRule.name}`,
        summary: result.reasoning,
        status: 'pending',
        createdAt: new Date(),
        metadata: { optimization: result },
      };
      await db.collection('approvals').insertOne(approval as any);
      liveEvents.emit('approval:created', approval);
    }
    
    res.json({ candidates: results.length, topResults: results.slice(0, 5) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Backtest a rule
app.post('/rules/:id/backtest', ownerAuth, async (req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { id } = req.params;
    const rule = await db.collection('rules').findOne({ _id: new ObjectId(id) as any }) as any as RuleSpec;
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    
    const config: BacktestConfig = {
      startDate: new Date(req.body.startDate || Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(req.body.endDate || Date.now()),
      initialBalance: req.body.initialBalance || { BTC: 1, USDC: 50000 },
      initialPrices: req.body.initialPrices || { BTC: 69000, USDC: 1 },
    };
    
    const result = await backtestRule(db, rule, config);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Evaluate rules once (dry-run, no approvals created)
app.post('/rules/evaluate', ownerAuth, async (_req, res) => {
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const objectivesDoc = await db.collection('objectives').findOne({ key: 'owner' });
    const latest = await db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
    const balances = { ...(latest || {}) } as any;
    const prices = (latest?._prices as Record<string, number>) || {};
    delete (balances as any)._prices; delete (balances as any)._id; delete (balances as any).timestamp;
    const collateralDocs = await db.collection('collateral').find({}).toArray();
    const collateral = collateralDocs.map(doc => ({ currency: doc.currency, locked: doc.locked || 0, ltv: doc.ltv, health: doc.health }));
    const ctx: EvalContext = { now: new Date(), portfolio: { balances, prices }, objectives: objectivesDoc?.value || {}, lastExecutions: {}, collateral };
    const intents = await evaluateRulesTick(db, ctx);
    res.json({ ok: true, intents: intents.length, sample: intents.slice(0, 3) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get risk state
app.get('/risk/state', async (_req, res) => {
  try {
    const state = getRiskState();
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Credential rotation endpoints
app.get('/rotation/status', async (_req, res) => {
  try {
    const status = await getRotationStatus(db);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/rotation/policy/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const policy = await getRotationPolicy(db, service as CredentialService);
    if (!policy) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    res.json(policy);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/rotation/policy/:service', ownerAuth, async (req, res) => {
  try {
    const { service } = req.params;
    const policy = { service: service as CredentialService, ...req.body };
    await updateRotationPolicy(db, policy);
    res.json({ ok: true, policy });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/rotation/rotate/:service', ownerAuth, async (req, res) => {
  try {
    const { service } = req.params;
    const result = await rotateAPIKey(db, service as CredentialService);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/rotation/scheduler', async (_req, res) => {
  try {
    const status = getSchedulerStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/rotation/scheduler/check', ownerAuth, async (_req, res) => {
  try {
    await forceRotationCheck(db);
    res.json({ ok: true, message: 'Rotation check triggered' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Chat (LLM) endpoint
app.post('/chat', async (req, res) => {
  try {
    const { prompt, messages } = req.body as { prompt?: string; messages?: ChatMessage[] };
    const msgs: ChatMessage[] = messages && messages.length
      ? messages
      : [
          { role: 'system', content: 'You are an expert crypto trading advisor. Be safe, compliant, and actionable.' },
          { role: 'user', content: prompt || 'Give me crypto trading advice.' },
        ];
    const reply = await getLLMAdvice(msgs, { user: 'web-dashboard' });
    res.json({ reply });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Streaming chat endpoint (SSE)
app.post('/chat/stream', async (req, res) => {
  try {
    const { prompt, messages } = req.body as { prompt?: string; messages?: ChatMessage[] };
    const msgs: ChatMessage[] = messages && messages.length
      ? messages
      : [
          { role: 'system', content: 'You are an expert crypto trading advisor. Be safe, compliant, and actionable.' },
          { role: 'user', content: prompt || 'Give me crypto trading advice.' },
        ];

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.flushHeaders();

    await streamLLMAdvice(msgs, (token) => {
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }, { user: 'web-dashboard' });

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ML Learning endpoints
app.get('/ml/preferences', async (_req, res) => {
  try {
    const { calculateUserPreferences } = await import('@coinruler/shared');
    
    // Fetch trade decisions from MongoDB
    const decisions = await db?.collection('trade_decisions').find({}).toArray() || [];
    
    if (decisions.length === 0) {
      return res.json({
        message: 'No learning data yet',
        preferences: null,
        recommendations: 'Start approving/declining trades to build learning data',
      });
    }
    
    const preferences = calculateUserPreferences(decisions as any);
    res.json({ preferences });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/ml/patterns', async (_req, res) => {
  try {
    const { extractLearningPatterns } = await import('@coinruler/shared');
    
    const decisions = await db?.collection('trade_decisions').find({}).toArray() || [];
    
    if (decisions.length === 0) {
      return res.json({ patterns: [], message: 'No learning data available' });
    }
    
    const patterns = extractLearningPatterns(decisions as any);
    res.json({ 
      patterns,
      totalDecisions: decisions.length,
      analyzedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/ml/predict-approval', async (req, res) => {
  try {
    const { coin, type, amount, price, profitPct, marketConditions } = req.body;
    const { predictUserApproval, calculateUserPreferences, extractLearningPatterns } = await import('@coinruler/shared');
    
    const decisions = await db?.collection('trade_decisions').find({}).toArray() || [];
    const preferences = calculateUserPreferences(decisions as any);
    const patterns = extractLearningPatterns(decisions as any);
    
    const prediction = predictUserApproval(
      { coin, type, amount, price, profitPct, marketConditions },
      preferences,
      patterns
    );
    
    res.json({ 
      prediction,
      basedOn: {
        historicalDecisions: decisions.length,
        learnedPatterns: patterns.length,
        confidenceScore: preferences.confidenceScore,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/intelligence/:coin', async (req, res) => {
  try {
    const { coin } = req.params;
    const { gatherMarketIntelligence } = await import('@coinruler/shared');
    
    // Get latest price data
    const snapshot = await db?.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
    const prices = snapshot?._prices || {};
    const currentPrice = prices[coin.toUpperCase()] || 0;
    
    // Calculate 24h change (would need historical data)
    const priceChange24h = 0; // Placeholder
    const volumeChange24h = 0; // Placeholder
    
    const intelligence = await gatherMarketIntelligence(
      coin.toUpperCase(),
      { currentPrice, priceChange24h, volumeChange24h }
    );
    
    res.json({ intelligence });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/intelligence', async (_req, res) => {
  try {
    const { gatherMarketIntelligence } = await import('@coinruler/shared');
    
    // Get intelligence for core assets
    const snapshot = await db?.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
    const prices = snapshot?._prices || {};
    
    const coins = ['BTC', 'XRP'];
    const intelligenceData = await Promise.all(
      coins.map(async coin => {
        const currentPrice = prices[coin] || 0;
        const intelligence = await gatherMarketIntelligence(
          coin,
          { currentPrice, priceChange24h: 0, volumeChange24h: 0 }
        );
        return { coin, intelligence };
      })
    );
    
    res.json({ data: intelligenceData, timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// SSE endpoint for live updates
app.get('/live', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  res.flushHeaders();

  // Track client
  sseClientCount += 1;
  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: new Date().toISOString() })}\n\n`);

  // Event handlers
  const handlers = {
    'approval:created': (data: any) => res.write(`data: ${JSON.stringify({ type: 'approval:created', data })}\n\n`),
    'approval:updated': (data: any) => res.write(`data: ${JSON.stringify({ type: 'approval:updated', data })}\n\n`),
    'killswitch:changed': (data: any) => res.write(`data: ${JSON.stringify({ type: 'killswitch:changed', data })}\n\n`),
    'portfolio:updated': (data: any) => res.write(`data: ${JSON.stringify({ type: 'portfolio:updated', data })}\n\n`),
    'alert': (data: any) => res.write(`data: ${JSON.stringify({ type: 'alert', data })}\n\n`),
  };

  Object.entries(handlers).forEach(([event, handler]) => liveEvents.on(event, handler));

  // Heartbeat every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  // Cleanup on client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    Object.entries(handlers).forEach(([event, handler]) => liveEvents.removeListener(event, handler));
    sseClientCount = Math.max(0, sseClientCount - 1);
  });
});

function resolvePort(): { port: number; via: 'PORT' | 'API_PORT' | 'default' } {
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
  // In production on platforms like Railway, always prefer PORT when provided
  if (process.env.PORT) return { port: Number(process.env.PORT), via: 'PORT' };
  if (!isProd && process.env.API_PORT) return { port: Number(process.env.API_PORT), via: 'API_PORT' };
  // Fallbacks
  if (process.env.API_PORT) return { port: Number(process.env.API_PORT), via: 'API_PORT' };
  return { port: 3001, via: 'default' };
}

const { port, via: portVia } = resolvePort();

// Simple owner auth middleware: checks X-Owner-Id header against OWNER_ID
function ownerAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const env = getEnv();
  if (!env.OWNER_ID) return res.status(403).json({ error: 'Owner protection not configured' });
  const header = (req.headers['x-owner-id'] || req.headers['x-owner'] || req.headers['x-user-id']) as string | undefined;
  if (header === env.OWNER_ID) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

async function startServer() {
  getLogger({ svc: 'api' }).info('Starting CoinRuler API server...');
  let rulesInterval: NodeJS.Timeout | null = null;
  let perfInterval: NodeJS.Timeout | null = null;
  let diagInterval: NodeJS.Timeout | null = null;
  let nightlyTimeout: NodeJS.Timeout | null = null;
  let snapshotInterval: NodeJS.Timeout | null = null;

  // Helper: create a live snapshot from Coinbase balances (internal reuse)
  async function createLiveSnapshot(reason: string) {
    if (!db) return { skipped: 'db-not-connected' };
    if (!hasCoinbaseCredentials()) return { skipped: 'coinbase-credentials-missing' };
    try {
      const client = getCoinbaseApiClient();
      const balances = await client.getAllBalances();
      const prices = await client.getSpotPrices(Object.keys(balances));
      const snapshot = { ...balances, _prices: prices, timestamp: new Date(), reason };
      await db.collection('snapshots').insertOne(snapshot);
      // Initialize baselines if absent
      const baselineDoc = await db.collection('baselines').findOne({ key: 'owner' });
      if (!baselineDoc) {
        const baselines = {
          BTC: { baseline: balances.BTC || 0 },
          XRP: { baseline: Math.max(10, balances.XRP || 0) },
        };
        await db.collection('baselines').insertOne({ key: 'owner', value: baselines, createdAt: new Date() });
      }
      liveEvents.emit('portfolio:snapshot', { snapshot, reason });
      getLogger({ svc: 'api' }).info(`Auto snapshot stored (reason=${reason})`);
      return { ok: true };
    } catch (err: any) {
      getLogger({ svc: 'api' }).warn({ err: err?.message }, 'Auto snapshot failed');
      return { error: err?.message };
    }
  }
  
  // Connect MongoDB first (non-blocking with reduced timeout)
  const connectPromise = connectMongoDB();
  const timeoutPromise = new Promise((resolve) => setTimeout(() => {
    console.warn('⏱️  MongoDB connection taking longer than expected, continuing startup...');
    resolve(false);
  }, 6000)); // Reduced from 8s to 6s
  
  await Promise.race([connectPromise, timeoutPromise]);
  
  // Start listening regardless of MongoDB status
  const server = app.listen(port, '0.0.0.0', async () => {
    const log = getLogger({ svc: 'api' });
    log.info(`API listening on 0.0.0.0:${port} (LIGHT_MODE=${LIGHT_MODE}, via=${portVia})`);
    log.info(`Health: http://localhost:${port}/health`);
    log.info(`Full Health: http://localhost:${port}/health/full`);
  log.info(`CORS origins: ${ORIGINS.join(', ')}`);
    
    if (!db) {
  const log = getLogger({ svc: 'api' });
  log.warn('MongoDB not connected - many features will be unavailable');
  log.warn('Troubleshooting: https://www.mongodb.com/docs/atlas/troubleshoot-connection/');
    }
    
    // Start credential rotation scheduler if DB is ready and not in LIGHT_MODE
    if (!LIGHT_MODE) {
      if (db) {
        try {
          await startRotationScheduler(db, {
            checkIntervalHours: 24,
            enabled: process.env.ROTATION_SCHEDULER_ENABLED !== 'false',
            notifyOnRotation: true,
            notifyOnFailure: true,
          });
          getLogger({ svc: 'api' }).info('Rotation scheduler started');
        } catch (err: any) {
          getLogger({ svc: 'api' }).warn({ err: err?.message || err }, 'Rotation scheduler failed to start');
        }
      } else {
        getLogger({ svc: 'api' }).warn('Rotation scheduler skipped (MongoDB not connected)');
      }
    } else {
      getLogger({ svc: 'api' }).info('LIGHT_MODE enabled: rotation scheduler disabled');
    }

    // Rules evaluator scheduler (disabled in LIGHT_MODE)
    if (!LIGHT_MODE) {
      getLogger({ svc: 'api' }).info('Starting rules evaluator (60s interval)...');
      rulesInterval = setInterval(async () => {
      if (!db) return;
      try {
        // Respect kill-switch: skip evaluation when enabled
        const ks = await db.collection('kill_switch').findOne({});
        if (ks?.enabled) return;
        const objectivesDoc = await db.collection('objectives').findOne({ key: 'owner' });
        // Minimal portfolio snapshot
        const latest = await db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
        const balances = { ...(latest || {}) } as any;
        const prices = (latest?._prices as Record<string, number>) || {};
        // Remove non-balance keys
        delete balances._prices;
        delete balances._id;
        delete balances.timestamp;

        // Fetch collateral data for risk checks
        const collateralDocs = await db.collection('collateral').find({}).toArray();
        const collateral = collateralDocs.map(doc => ({
          currency: doc.currency,
          locked: doc.locked || 0,
          ltv: doc.ltv,
          health: doc.health,
        }));

        const ctx: EvalContext = {
          now: new Date(),
          portfolio: { balances, prices },
          objectives: objectivesDoc?.value || {},
          lastExecutions: lastRuleExecutions,
          collateral,
        };
        const intents = await evaluateRulesTick(db, ctx);
        for (const intent of intents) {
          // For safety: always create an approval (dry-run by default)
          const approval: Approval = {
            type: intent.action.type === 'enter' ? 'buy' : intent.action.type === 'exit' ? 'sell' : 'stake-suggestion',
            coin: (intent.action as any).symbol || 'MULTI',
            amount: (intent.action as any).allocationPct || 0,
            title: `Rule ${intent.ruleId} proposes ${intent.action.type}`,
            summary: intent.reason,
            status: 'pending',
            createdAt: new Date(),
            metadata: { intent, dryRun: intent.dryRun },
          };
          await db.collection('approvals').insertOne(approval as any);
          liveEvents.emit('approval:created', approval);
          lastRuleExecutions[intent.ruleId] = new Date();
          
            // Send alert for new approval
            liveEvents.emit('alert', {
              type: 'rule_action',
              severity: 'medium',
              message: `Rule ${intent.ruleId} generated trade proposal: ${approval.title}`,
              data: approval,
              timestamp: new Date().toISOString(),
            });
        }
      } catch (err) {
        // Silent fail for rule evaluation (non-critical)
      }
      }, 60_000);
    } else {
      getLogger({ svc: 'api' }).info('LIGHT_MODE enabled: rules evaluator disabled');
    }
    
    // Performance monitoring scheduler (disabled in LIGHT_MODE)
    if (!LIGHT_MODE) {
      getLogger({ svc: 'api' }).info('Starting performance monitor (5m interval)...');
      perfInterval = setInterval(async () => {
        if (!db) return;
        try {
          // Check rule performance for alerts
          const rules = await db.collection('rules').find({ enabled: true }).toArray();
          for (const rule of rules) {
            const metrics = await db.collection('ruleMetrics')
              .find({ ruleVersionId: rule._id.toString() })
              .sort({ windowEnd: -1 })
              .limit(10)
              .toArray();
          
            if (metrics.length >= 5) {
              const recent = metrics.slice(0, 5);
              const avgSharpe = recent.reduce((sum: number, m: any) => sum + (m.sharpe || 0), 0) / recent.length;
              const avgMaxDD = recent.reduce((sum: number, m: any) => sum + (m.maxDD || 0), 0) / recent.length;
              const avgWinRate = recent.reduce((sum: number, m: any) => sum + (m.winRate || 0), 0) / recent.length;
            
              // Alert on poor performance
              if (avgSharpe < 0.5 && avgWinRate < 40) {
                liveEvents.emit('alert', {
                  type: 'performance',
                  severity: 'high',
                  message: `Rule "${rule.name}" underperforming: Sharpe ${avgSharpe.toFixed(2)}, Win Rate ${avgWinRate.toFixed(1)}%`,
                  data: { ruleId: rule._id.toString(), avgSharpe, avgMaxDD, avgWinRate },
                  timestamp: new Date().toISOString(),
                });
              }
            
              // Alert on high drawdown
              if (avgMaxDD > 20) {
                liveEvents.emit('alert', {
                  type: 'risk',
                  severity: 'high',
                  message: `Rule "${rule.name}" experiencing high drawdown: ${avgMaxDD.toFixed(1)}%`,
                  data: { ruleId: rule._id.toString(), maxDrawdown: avgMaxDD },
                  timestamp: new Date().toISOString(),
                });
              }
            }
          }
        
          // Check risk state for alerts
          const riskState = getRiskState();
          if (riskState.tradesLastHour >= 4) {
            liveEvents.emit('alert', {
              type: 'risk',
              severity: 'medium',
              message: `High trading velocity: ${riskState.tradesLastHour} trades in last hour (throttle at 5)`,
              data: riskState,
              timestamp: new Date().toISOString(),
            });
          }
        
          if (riskState.dailyLoss < -1000) {
            liveEvents.emit('alert', {
              type: 'risk',
              severity: 'high',
              message: `Daily loss threshold approaching: $${riskState.dailyLoss.toFixed(2)}`,
              data: riskState,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (err) {
          // Silent fail for monitoring
        }
        }, 5 * 60 * 1000);
      } else {
        getLogger({ svc: 'api' }).info('LIGHT_MODE enabled: performance monitor disabled');
      }
    
      // System diagnostics writer (disabled in LIGHT_MODE)
    if (!LIGHT_MODE) {
      getLogger({ svc: 'api' }).info('Starting diagnostics writer (5m interval)...');
      diagInterval = setInterval(async () => {
          if (!db) return;
          try {
            const health = await (await fetch(`http://localhost:${port}/health/full`)).json();
            await db.collection('systemHealth').insertOne({ ...health, ts: new Date() });
          } catch {
            // ignore
          }
        }, 5 * 60 * 1000);
    } else {
      getLogger({ svc: 'api' }).info('LIGHT_MODE enabled: diagnostics writer disabled');
    }

      // Nightly optimizer (disabled in LIGHT_MODE)
    if (!LIGHT_MODE) {
      getLogger({ svc: 'api' }).info('Scheduling nightly optimizer...');
      const scheduleNextOptimization = () => {
        const now = new Date();
        const next = new Date(now);
        next.setUTCHours(2, 0, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        const delay = next.getTime() - now.getTime();
        nightlyTimeout = setTimeout(async () => {
          getLogger({ svc: 'api' }).info('Running nightly optimization cycle...');
          if (db) {
            try {
              const results = await runOptimizationCycle(db, {});
              getLogger({ svc: 'api' }).info(`Optimization complete: ${results.length} candidates generated`);
              if (results.length > 0) {
                liveEvents.emit('alert', {
                  type: 'optimization',
                  severity: 'info',
                  message: `Nightly optimization: ${results.length} rule improvements available`,
                  data: { candidates: results.slice(0, 3) },
                  timestamp: new Date().toISOString(),
                });
              }
            } catch (err: any) {
              getLogger({ svc: 'api' }).error({ err: err?.message }, 'Optimization error');
            }
          }
          scheduleNextOptimization();
        }, delay);
      };
      scheduleNextOptimization();
    } else {
      getLogger({ svc: 'api' }).info('LIGHT_MODE enabled: nightly optimizer disabled');
    }
    
    getLogger({ svc: 'api' }).info('API fully initialized and ready for requests');

    // ---- Automatic Snapshot System ----
    // Skip in LIGHT_MODE to minimize background work
    if (!LIGHT_MODE) {
      try {
        const existingCount = db ? await db.collection('snapshots').countDocuments() : 0;
        if (existingCount === 0 && hasCoinbaseCredentials()) {
          getLogger({ svc: 'api' }).info('No snapshots found – creating initial live snapshot...');
          await createLiveSnapshot('initial-startup');
        } else {
          getLogger({ svc: 'api' }).info(`Snapshot count at startup: ${existingCount}`);
        }
        // Periodic snapshots (default every 60 minutes) configurable via SNAPSHOT_INTERVAL_MINUTES
        const intervalMinutes = Number(process.env.SNAPSHOT_INTERVAL_MINUTES || '60');
        if (intervalMinutes > 0 && hasCoinbaseCredentials()) {
          snapshotInterval = setInterval(() => {
            createLiveSnapshot('scheduled-interval').catch(() => {});
          }, intervalMinutes * 60 * 1000);
          getLogger({ svc: 'api' }).info(`Scheduled automatic snapshots every ${intervalMinutes}m`);
        } else {
          getLogger({ svc: 'api' }).info('Automatic snapshot scheduler disabled (interval <= 0 or credentials missing)');
        }
      } catch (e: any) {
        getLogger({ svc: 'api' }).warn({ err: e?.message }, 'Failed to initialize automatic snapshot system');
      }
    } else {
      getLogger({ svc: 'api' }).info('LIGHT_MODE enabled: automatic snapshots disabled');
    }
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    try { await stopRotationScheduler(); } catch {}
    try { server.close(); } catch {}
    try { clearInterval(rulesInterval as any); } catch {}
    try { clearInterval(perfInterval as any); } catch {}
    try { clearInterval(diagInterval as any); } catch {}
    try { if (nightlyTimeout) clearTimeout(nightlyTimeout); } catch {}
    try { clearInterval(snapshotInterval as any); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Start the server
startServer().catch((err) => {
  getLogger({ svc: 'api' }).error({ err }, 'Fatal startup error');
  process.exit(1);
});

// Safety: prevent process exit on unexpected errors
process.on('uncaughtException', (err) => {
  getLogger({ svc: 'api' }).error({ err }, 'Uncaught exception');
});
process.on('unhandledRejection', (reason) => {
  getLogger({ svc: 'api' }).error({ reason }, 'Unhandled rejection');
});
