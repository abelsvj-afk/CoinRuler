import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { Approval, KillSwitch, PortfolioSnapshot, monteCarloSimulation, getCoinbaseClient as getCoinbaseApiClient, validateEnv, isDryRun, getEnv, getLogger, hasCoinbaseCredentials, executeTrade, type TradeSide, type TradeResult } from '@coinruler/shared';
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
import { DataScheduler } from './scheduler';
import { initializeCollections, enforceXRPMinBaseline } from './collections';
import { checkBTCSellAllowed, monitorLTV, type CollateralStatus } from './collateralProtection';
import { requiresMFA, requestMFA, verifyMFA, cleanupExpiredMFA, getPendingMFA } from './mfa';
import { generateDailyLearning, scheduleDailyLearning } from './learningSystem';
import { scanProfitOpportunities, createProfitTakingApproval } from './profitTaking';
import { fetchFearGreedIndex, storeFearGreed, latestFearGreed } from './macroSentiment';

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
// Soft environment validation: log problems but continue in degraded/local mode
try {
  validateEnv();
  getLogger({ svc: 'api' }).info('Environment variables validated');
} catch (e: any) {
  console.warn('⚠️ Environment validation failed, continuing in LIGHT_MODE (degraded).', e?.message);
  process.env.LIGHT_MODE = 'true';
}

// Real-time event emitter for SSE (shared across modules)
import { liveEvents } from './events';
let sseClientCount = 0;

const app = express();

// Trust Railway proxy (or other reverse proxy) for X-Forwarded-* headers
// Required for rate-limit and client IP detection behind proxy
app.set('trust proxy', 1);

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
//  - https://mycoinruler.xyz (custom domain)
const ORIGIN_RAW = process.env.WEB_ORIGIN || process.env.NEXT_PUBLIC_WEB_ORIGIN || 'http://localhost:3000,https://mycoinruler.xyz';
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
// Fallback domains always permitted (suffix match) to avoid deploy lockouts when WEB_ORIGIN is misconfigured
const CORS_FALLBACK_ALLOW = (process.env.CORS_FALLBACK_ALLOW || 'mycoinruler.xyz').split(',').map(s => s.trim()).filter(Boolean);
// Metrics: track how many times fallback path was used vs regular allowlist
let corsFallbackHits = 0;
let corsAllowedHits = 0;

// Diagnostics: log resolved CORS origins at startup (helps verify deployment picked up changes)
try {
  const logger = getLogger({ svc: 'api' });
  logger.info(`Startup CORS ORIGINS resolved: ${ORIGINS.join(', ')}`);
  const hasCustom = ORIGINS.some(o => o.includes('mycoinruler.xyz'));
  if (!hasCustom) {
    logger.warn('Custom domain https://mycoinruler.xyz NOT present in ORIGINS; check WEB_ORIGIN env override');
  }
} catch {}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin like curl or same-origin
    if (!origin) return callback(null, true);

    let u: URL | null = null;
    try { u = new URL(origin); } catch { /* ignore */ }
    const originHost = u?.host || origin.replace(/^https?:\/\//, '');
    const originScheme = (u?.protocol as 'http:' | 'https:' | undefined);

    let allowed = ALLOWED.some(a => {
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

    // Fallback: allow if origin host ends with any domain in CORS_FALLBACK_ALLOW (scheme respected when provided)
    if (!allowed) {
      const host = originHost.toLowerCase();
      const schemeOk = !originScheme || ['http:', 'https:'].includes(originScheme);
      if (schemeOk) {
        const hit = CORS_FALLBACK_ALLOW.some(dom => host === dom.toLowerCase() || host.endsWith(`.${dom.toLowerCase()}`));
        if (hit) {
          try { getLogger({ svc: 'api' }).warn(`CORS fallback allow matched for origin ${origin}`); } catch {}
          corsFallbackHits += 1;
          allowed = true;
        }
      }
    }

    if (allowed) {
      corsAllowedHits += 1;
      return callback(null, true);
    }
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
    
    // Initialize collections and seed data (Requirement 2)
    await initializeCollections(db);
    await enforceXRPMinBaseline(db);
    
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
let ACTIVE_PORT: number | null = null; // will be set after successful listen
app.get('/env', (_req, res) => {
  res.json({
    ok: true,
    origins: ORIGINS,
    configuredPort: Number(process.env.API_PORT || process.env.PORT || 3001),
    activePort: ACTIVE_PORT,
    portSource: ACTIVE_PORT ? 'resolved' : 'pending',
    hasMongoUri: !!process.env.MONGODB_URI,
    hasOwnerId: !!getEnv().OWNER_ID,
    hasCoinbaseKey: !!process.env.COINBASE_API_KEY,
    hasCoinbaseSecret: !!process.env.COINBASE_API_SECRET,
    coinbaseKeyLength: process.env.COINBASE_API_KEY?.length || 0,
    autoExecuteEnabled: process.env.AUTO_EXECUTE_ENABLED === 'true',
    snapshotIntervalMinutes: Number(process.env.SNAPSHOT_INTERVAL_MINUTES || '60'),
    rotationSchedulerEnabled: (process.env.ROTATION_SCHEDULER_ENABLED || 'true') === 'true',
    backtestSchedulerEnabled: (process.env.BACKTEST_SCHED_ENABLED || 'true') === 'true',
    backtestEveryHours: Number(process.env.BACKTEST_SCHED_HOURS || '24'),
    backtestLookbackDays: Number(process.env.BACKTEST_LOOKBACK_DAYS || '30'),
    backtestAutotuneEnabled: (process.env.BACKTEST_AUTOTUNE_ENABLED || 'true') === 'true',
    corsMetrics: {
      allowed: corsAllowedHits,
      fallback: corsFallbackHits,
      fallbackDomains: CORS_FALLBACK_ALLOW,
    },
  });
});

// CORS metrics endpoint (lightweight, no auth)
app.get('/metrics/cors', (_req, res) => {
  res.json({
    allowed: corsAllowedHits,
    fallback: corsFallbackHits,
    ratioFallback: corsAllowedHits > 0 ? Number((corsFallbackHits / corsAllowedHits).toFixed(4)) : null,
    fallbackDomains: CORS_FALLBACK_ALLOW,
    originsConfigured: ORIGINS,
  });
});

// Coinbase credential + connectivity diagnostics (safe; never returns secrets)
// Heuristic classifier for credential type to improve guidance
function classifyCoinbaseSecret(key?: string, secret?: string): { type: 'none' | 'hmac' | 'cdp-pem' | 'cdp-base64' | 'unknown'; hints: string[] } {
  const hints: string[] = [];
  if (!key || !secret) return { type: 'none', hints };
  const s = secret.trim();
  if (/-----BEGIN (EC|PRIVATE) KEY-----/i.test(s) || s.includes('BEGIN ') || s.includes('\n') && s.length > 200) {
    hints.push('Secret looks like PEM (multi-line)');
    return { type: 'cdp-pem', hints };
  }
  const likelyBase64 = /^[A-Za-z0-9+/=]{32,}$/.test(s);
  if (likelyBase64 && s.includes('=')) {
    hints.push('Secret appears base64-like');
    return { type: 'cdp-base64', hints };
  }
  // HMAC secrets are typically shorter random strings (no line breaks, no PEM headers)
  if (!s.includes('\n') && s.length >= 16 && s.length <= 128) {
    return { type: 'hmac', hints };
  }
  return { type: 'unknown', hints };
}

app.get('/coinbase/status', async (_req, res) => {
  const details: any = {
    hasCredentials: hasCoinbaseCredentials(),
    keyLength: process.env.COINBASE_API_KEY?.length || 0,
    status: 'disabled',
    advice: null,
  };
  if (!details.hasCredentials) {
    return res.json(details);
  }
  try {
    const kind = classifyCoinbaseSecret(process.env.COINBASE_API_KEY, process.env.COINBASE_API_SECRET);
    details.credentialType = kind.type;
    details.credentialHints = kind.hints;
    const client = getCoinbaseApiClient();
    const ok = await client.testConnection();
    details.status = ok ? 'connected' : 'failed';
    if (!ok) {
      switch (kind.type) {
        case 'cdp-pem':
          details.advice = 'CDP PEM key detected. If you see 401, verify CDP key scopes include wallet:accounts:read (and related reads) and that the key targets Advanced Trade in the CDP portal. See docs/CDP_KEY_GENERATION.md.';
          break;
        case 'cdp-base64':
          details.advice = 'CDP key format detected. Ensure you generated keys in the CDP portal and that scopes include wallet:accounts:read. For brokerage endpoints, CDP JWT auth is required; see docs/CDP_KEY_GENERATION.md.';
          break;
        case 'hmac':
          details.advice = 'Authentication failed. Ensure this HMAC key has read (and later trade) permissions for Advanced Trade. Try regenerating the key and updating env vars.';
          break;
        default:
          details.advice = 'Authentication failed. Likely wrong key type. Use Advanced Trade API keys (HMAC), not CDP/PEM.';
      }
      // If CDP client is present, expose CDP status so UI can show a useful fallback
      try {
        // @ts-ignore access helper
        if ((client as any).hasCdpSupport?.()) {
          details.cdp = { enabled: true };
          try {
            // @ts-ignore list wallets
            const wallets = await (client as any).listCdpWallets?.();
            details.cdp.wallets = { count: Array.isArray(wallets) ? wallets.length : 0 };
            if (Array.isArray(wallets) && wallets.length > 0) {
              const first = wallets[0];
              details.cdp.sample = {
                id: first?.id || first?.uuid || null,
                assets: (first?.assets || []).slice(0, 3).
                  map((a: any) => ({ symbol: a?.asset?.symbol || a?.symbol, qty: a?.quantity || a?.amount }))
              };
            }
          } catch (e: any) {
            details.cdp.error = e?.message || String(e);
          }
        } else {
          details.cdp = { enabled: false };
        }
      } catch {}
    }
    // Try a lightweight balances fetch (sample only)
    try {
      const balances = await client.getAllBalances();
      const sampleEntries = Object.entries(balances).slice(0, 5);
      details.balancesSample = Object.fromEntries(sampleEntries);
    } catch (e: any) {
      details.balanceError = e?.message || String(e);
    }
    return res.json(details);
  } catch (err: any) {
    details.status = 'error';
    details.error = err?.message || String(err);
    return res.json(details);
  }
});

// Owner-only CDP diagnostics: signature + optional wallet sample
app.get('/coinbase/debug/cdp', ownerAuth, async (_req, res) => {
  try {
    const client = getCoinbaseApiClient();
    const sample: any = {};
    // Try CDP wallet list augmentation if supported
    try {
      // Access private cdp field via any
      // @ts-ignore
      const wallets = await (client as any).cdp?.listWallets?.();
      if (Array.isArray(wallets)) {
        sample.walletCount = wallets.length;
        sample.firstWallet = wallets[0]?.id || wallets[0]?.uuid || null;
        sample.firstWalletAssets = wallets[0]?.assets?.slice(0,3) || [];
      }
    } catch (e: any) {
      sample.walletsError = e?.message;
    }
    // Try new Coinbase Platform SDK if configured
    try {
      const sdkWallets = await client.listWalletsSdk?.();
      if (Array.isArray(sdkWallets)) {
        sample.sdkWalletCount = sdkWallets.length;
        sample.sdkFirstWallet = sdkWallets[0] || null;
      }
    } catch (e: any) {
      sample.sdkError = e?.message;
    }
    res.json({ ok: true, sample });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// List wallets via Coinbase Platform SDK (owner only), falls back to CDP
app.get('/coinbase/wallets', ownerAuth, async (_req, res) => {
  try {
    const client = getCoinbaseApiClient();
    const result: any = {};
    try {
      const sdkWallets = await client.listWalletsSdk?.();
      result.sdk = { count: Array.isArray(sdkWallets) ? sdkWallets.length : 0, wallets: sdkWallets };
    } catch (e: any) {
      result.sdk = { error: e?.message };
    }
    try {
      // @ts-ignore
      const cdpWallets = await (client as any).cdp?.listWallets?.();
      result.cdp = { count: Array.isArray(cdpWallets) ? cdpWallets.length : 0, wallets: cdpWallets };
    } catch (e: any) {
      result.cdp = { error: e?.message };
    }
    res.json({ ok: true, ...result });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Signature debug endpoint (owner only) to verify HMAC computation
app.get('/coinbase/debug/signature', ownerAuth, async (req, res) => {
  try {
    if (!hasCoinbaseCredentials()) return res.status(400).json({ error: 'No credentials configured' });
    const path = (req.query.path as string) || '/api/v3/brokerage/accounts';
    const method = (req.query.method as string) || 'GET';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = (req.query.body as string) || '';
    const client = getCoinbaseApiClient();
    // @ts-ignore access private sign
    const signature = (client as any).sign(timestamp, method, path, body);
    res.json({ timestamp, method, path, body: body || null, signature });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// List brokerage accounts (owner; paginated)
app.get('/coinbase/accounts', ownerAuth, async (req, res) => {
  try {
    if (!hasCoinbaseCredentials()) return res.status(400).json({ error: 'Coinbase brokerage credentials required' });
    const limit = Math.max(1, Math.min(250, Number((req.query.limit as string) || '49')));
    const cursor = (req.query.cursor as string) || undefined;
    const client = getCoinbaseApiClient();
    // @ts-ignore getAccountsPage is available on shared client
    const page = await (client as any).getAccountsPage?.({ limit, cursor });
    res.json({ ok: true, ...page });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Brokerage key permissions (owner)
app.get('/coinbase/key-permissions', ownerAuth, async (_req, res) => {
  try {
    if (!hasCoinbaseCredentials()) return res.status(400).json({ error: 'No credentials configured' });
    const client = getCoinbaseApiClient();
    const perms = await (client as any).getKeyPermissions?.();
    res.json({ ok: true, permissions: perms });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Best bid/ask for product IDs (public if credentials present)
app.get('/coinbase/market/best_bid_ask', async (req, res) => {
  try {
    if (!hasCoinbaseCredentials()) return res.status(400).json({ error: 'Coinbase brokerage credentials required' });
    const ids = ((req.query.product_ids as string) || 'BTC-USD').split(',').map(s => s.trim()).filter(Boolean);
    const client = getCoinbaseApiClient();
    const data = await (client as any).getBestBidAsk?.(ids);
    res.json({ ok: true, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Historical fills (owner)
app.get('/coinbase/fills', ownerAuth, async (req, res) => {
  try {
    if (!hasCoinbaseCredentials()) return res.status(400).json({ error: 'Coinbase brokerage credentials required' });
    const { product_id, order_id, limit, cursor } = req.query as any;
    const client = getCoinbaseApiClient();
    const data = await (client as any).getFills?.({ product_id, order_id, limit: limit ? Number(limit) : undefined, cursor });
    res.json({ ok: true, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Candles (public if credentials present)
app.get('/coinbase/candles', async (req, res) => {
  try {
    if (!hasCoinbaseCredentials()) return res.status(400).json({ error: 'Coinbase brokerage credentials required' });
    const { product_id, granularity, start, end, lastMinutes } = req.query as any;
    if (!product_id) return res.status(400).json({ error: 'product_id required' });
    if (!granularity) return res.status(400).json({ error: 'granularity required' });
    const client = getCoinbaseApiClient();
    const data = await (client as any).getCandles?.({ product_id, granularity, start, end, lastMinutes: lastMinutes ? Number(lastMinutes) : undefined });
    res.json({ ok: true, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Order preview (owner)
app.post('/coinbase/orders/preview', ownerAuth, async (req, res) => {
  try {
    if (!hasCoinbaseCredentials()) return res.status(400).json({ error: 'Coinbase brokerage credentials required' });
    const body = req.body || {};
    const client = getCoinbaseApiClient();
    const preview = await (client as any).previewOrder?.(body);
    res.json({ ok: true, preview });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
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
          // Try to fetch collateral - Coinbase's loans API endpoint
          let collateral: any[] = [];
          try {
            const { CoinbaseApiClient } = await import('@coinruler/shared');
            const client = new CoinbaseApiClient();
            collateral = await client.getCollateral();
          } catch (methodErr: any) {
            console.warn('[Collateral] Method not available or API error:', methodErr.message);
          }
          checks.coinbase.collateral = collateral;
          
          // Store collateral in MongoDB for risk layer and emit update event
          if (db) {
            await db.collection('collateral').deleteMany({}); // Replace with latest
            if (collateral.length > 0) {
              await db.collection('collateral').insertMany(
                collateral.map((c: any) => ({
                  ...c,
                  updatedAt: new Date(),
                }))
              );
            }
            // Emit lightweight summary for UI Activity feed
            try {
              const btc = collateral.filter((c: any) => (c.currency || '').toUpperCase() === 'BTC');
              const btcLocked = btc.reduce((s: number, c: any) => s + (c.locked || 0), 0);
              const maxLTV = collateral.map((c: any) => typeof c.ltv === 'number' ? c.ltv : null).filter((x: any) => x !== null).reduce((m: number, v: number) => Math.max(m, v), 0);
              liveEvents.emit('alert', {
                type: 'collateral',
                severity: maxLTV > 0.6 ? 'warning' : 'info',
                message: `Collateral updated: BTC locked ${btcLocked.toFixed(8)} (LTV ${maxLTV ? (maxLTV*100).toFixed(1)+'%' : 'n/a'})`,
                data: { btcLocked, maxLTV },
                timestamp: new Date().toISOString(),
              });
            } catch {}
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

// Manual execution endpoint (owner only): place order for an approved intent.
app.post('/approvals/:id/execute', ownerAuth, async (req, res) => {
  const { mfaCode } = req.body; // MFA code for large trades
  if (!db) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { id } = req.params;
    const approval = await db.collection('approvals').findOne({ _id: new ObjectId(id) as any });
    if (!approval) return res.status(404).json({ error: 'Approval not found' });
    if (approval.status !== 'pending' && approval.status !== 'approved') {
      return res.status(400).json({ error: 'Approval not executable in current status' });
    }
    // Derive trade details from intent metadata (simplified)
    const intent = (approval as any).metadata?.intent;
    if (!intent?.action) return res.status(400).json({ error: 'No intent action data' });
    const action = intent.action;
    const symbol = (action.symbol || 'BTC').toUpperCase();
    const side: 'buy' | 'sell' = action.type === 'enter' ? 'buy' : action.type === 'exit' ? 'sell' : 'buy';
    const allocationPct = Number(action.allocationPct || 0.01); // fallback tiny fraction
    // Fetch balances for sizing
    let balances: Record<string, number> = {};
    if (hasCoinbaseCredentials()) {
      try { balances = await getCoinbaseApiClient().getAllBalances(); } catch {}
    }
    const baseBalance = balances[symbol] || 0;
    // Notional sizing: for buy, use allocationPct * existing BTC or fallback 0.001
    const amount = side === 'buy'
      ? Number((baseBalance * allocationPct).toFixed(6)) || 0.001
      : Math.min(Number((baseBalance * allocationPct).toFixed(6)), baseBalance);
    if (amount <= 0) return res.status(400).json({ error: 'Calculated amount <= 0; insufficient balance or allocation' });
    
    // Get current price for value estimation
    const prices = hasCoinbaseCredentials() 
      ? await getCoinbaseApiClient().getSpotPrices([symbol])
      : {};
    const estimatedValueUSD = amount * (prices[symbol] || 0);
    
    // BTC COLLATERAL PROTECTION (CRITICAL)
    if (side === 'sell' && symbol === 'BTC') {
      const btcCheck = await checkBTCSellAllowed(db, amount);
      if (!btcCheck.allowed) {
        liveEvents.emit('alert', {
          type: 'collateral_blocked',
          severity: 'critical',
          message: `🚫 BTC SELL BLOCKED: ${btcCheck.reason}`,
          data: { symbol, amount, status: btcCheck.status },
          timestamp: new Date().toISOString(),
        });
        return res.status(403).json({ 
          error: btcCheck.reason,
          collateralStatus: btcCheck.status,
          blocked: true
        });
      }
    }
    
    // MFA VERIFICATION (for large trades)
    if (requiresMFA(estimatedValueUSD)) {
      if (!mfaCode) {
        // Generate MFA code
        const mfaData = await requestMFA(db, {
          tradeId: id,
          userId: 'owner',
          type: side,
          asset: symbol,
          quantity: amount,
          estimatedValueUSD,
        });
        return res.status(403).json({
          error: 'MFA required for large trade',
          mfaRequired: true,
          estimatedValueUSD,
          expiresAt: mfaData.expiresAt,
          message: `Check terminal for verification code (expires in 5 minutes)`,
        });
      } else {
        // Verify MFA code
        const verification = await verifyMFA(db, id, mfaCode);
        if (!verification.valid) {
          return res.status(403).json({
            error: verification.reason,
            mfaFailed: true,
          });
        }
      }
    }
    
    const risk = getRiskState();
    const tradeRes = await executeTrade({
      side,
      symbol,
      amount,
      mode: 'market',
      reason: `manual-exec:${id}`,
      risk: {
        tradesLastHour: (risk as any)?.tradesLastHour,
        dailyLoss: (risk as any)?.dailyLoss,
        killSwitch: false,
        maxTradesHour: Number(process.env.AUTO_EXECUTE_RISK_MAX_TRADES_HOUR || '0'),
        dailyLossLimit: Number(process.env.AUTO_EXECUTE_DAILY_LOSS_LIMIT || 'NaN'),
      },
    });
    // SSE trade events for clients
    try {
      liveEvents.emit('trade:submitted', { mode: 'manual', side, symbol, amount, ts: new Date().toISOString() });
      liveEvents.emit('trade:result', { mode: 'manual', ok: tradeRes.ok, orderId: tradeRes.orderId, status: tradeRes.status, ts: new Date().toISOString() });
    } catch {}
    if (!tradeRes.ok) return res.status(500).json({ error: tradeRes.error || 'Trade failed' });
    // Update approval
    await db.collection('approvals').updateOne({ _id: new ObjectId(id) as any }, { $set: { status: 'executed', actedBy: 'owner:manual', actedAt: new Date() } });
    // Record execution document
    const execDoc = {
      approvalId: id,
      side,
      symbol,
      amount,
      orderId: tradeRes.orderId,
      status: tradeRes.status,
      filledQty: tradeRes.filledQty,
      avgFillPrice: tradeRes.avgFillPrice,
      executedAt: new Date(),
      mode: 'manual',
      dryRun: isDryRun(),
    };
    await db.collection('executions').insertOne(execDoc as any);
    liveEvents.emit('alert', { type: 'execution', severity: 'info', message: `Manual ${side} ${symbol} ${amount} (order=${tradeRes.orderId})`, data: execDoc, timestamp: new Date().toISOString() });
    res.json({ ok: true, trade: tradeRes, execution: execDoc });
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
  // Also emit portfolio:updated for clients listening only to updated events
  liveEvents.emit('portfolio:updated', { snapshot, reason: 'force-refresh' });
    // Persist alert for audit
    try {
      await db.collection('alerts').insertOne({
        type: 'snapshot',
        severity: 'info',
        message: 'Manual live snapshot created',
        data: { reason: 'force-refresh' },
        ts: new Date(),
      });
    } catch {}

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
  // Build raw balances/prices, then filter to only assets with USD value > 0
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
        }
      }
    } else if (hasCoinbaseCredentials()) {
      // Fallback to live fetch if no snapshot exists yet
      try {
        const client = getCoinbaseApiClient();
        balances = await client.getAllBalances();
        prices = await client.getSpotPrices(Object.keys(balances));
        // usdTotal will be recomputed after filtering below
      } catch {}
    }
    // Load collateral data to capture locked BTC/SOL/ETH
    const collateralDocs = await db?.collection('collateral').find({}).toArray() || [];
    const lockedAmounts: Record<string, number> = {};
    for (const c of collateralDocs) {
      const sym = (c.currency || '').toUpperCase();
      lockedAmounts[sym] = (lockedAmounts[sym] || 0) + (c.locked || 0);
    }
    
    // Fetch BTC from cached Coinbase balances (includes available + locked/hold)
    try {
      const { getLatestBtcSnapshot } = await import('./services/btcWatcher');
      const btcSnap = getLatestBtcSnapshot();
      if (btcSnap) {
        // Use total BTC (available + locked) for portfolio display
        balances.BTC = btcSnap.balance.total;
        // Track locked amount separately for collateral display
        lockedAmounts.BTC = btcSnap.balance.locked;
      }
    } catch (err: any) {
      console.warn('[BTC Watcher] Failed to get cached balances:', err.message);
    }
    
    // Load baselines first to determine which assets you've invested in
    const baselineDoc = await db?.collection('baselines').findOne({ key: 'owner' });
    let baselines = baselineDoc?.value || { BTC: { baseline: balances.BTC || 0 }, XRP: { baseline: Math.max(10, balances.XRP || 0) } };
    if (!baselineDoc && db) {
      await db.collection('baselines').insertOne({ key: 'owner', value: baselines, createdAt: new Date() });
    }
    
    // Filter to show all holdings: qty > 0 OR has locked collateral OR has baseline
    const filteredBalances: Record<string, number> = {};
    const filteredPrices: Record<string, number> = {};
    usdTotal = 0;
    for (const sym of Object.keys(balances)) {
      const qty = balances[sym] || 0;
      const locked = lockedAmounts[sym] || 0;
      const baseline = baselines[sym]?.baseline || 0;
      const px = prices[sym] || 0;
      const usd = qty * px;
      // Show if: holding free balance OR has locked collateral OR has investment baseline
      if (qty > 0 || locked > 0 || baseline > 0) {
        filteredBalances[sym] = qty;
        filteredPrices[sym] = px;
        usdTotal += usd;
      }
    }
    // Replace with filtered
    balances = filteredBalances;
    prices = filteredPrices;
    const ts = latest?.timestamp || null;
    const ageMs = ts ? Date.now() - new Date(ts).getTime() : null;

    // 24h price & portfolio change
    let totalChange24hPct: number | null = null;
    const priceChange24hPct: Record<string, number> = {};
    if (db && ts) {
      const since = new Date(new Date(ts as any).getTime() - 24*60*60*1000);
      const prev = await db.collection('snapshots').findOne({ timestamp: { $lte: since } }, { sort: { timestamp: -1 } });
      if (prev) {
        const prevPrices = (prev as any)._prices || {};
        for (const c of Object.keys(prices)) {
          const p0 = prevPrices[c];
          const p1 = prices[c];
          if (typeof p0 === 'number' && p0 > 0 && typeof p1 === 'number') {
            priceChange24hPct[c] = ((p1 - p0) / p0) * 100;
          }
        }
        let prevTotal = 0;
        for (const c of Object.keys(balances)) {
          const qty = balances[c] || 0;
          const p0 = prevPrices[c] || 0;
          prevTotal += qty * p0;
        }
        if (prevTotal > 0) totalChange24hPct = ((usdTotal - prevTotal) / prevTotal) * 100;
      }
    }

    // Collateral summary (worst-case LTV + locked BTC)
    let collateralSummary: any = null;
    try {
      const collDocs = await db?.collection('collateral').find({}).toArray();
      if (collDocs && collDocs.length) {
        const btc = collDocs.filter((c: any) => (c.currency || '').toUpperCase() === 'BTC');
        const btcLocked = btc.reduce((s: number, c: any) => s + (c.locked || 0), 0);
        const btcTotal = balances.BTC || 0;
        const btcFree = Math.max(0, btcTotal - btcLocked);
        const ltvs = collDocs.map((c: any) => typeof c.ltv === 'number' ? c.ltv : null).filter((x: any) => x !== null);
        const ltv = ltvs.length ? Math.max(...ltvs) : null;
        collateralSummary = { btcTotal, btcLocked, btcFree, ltv };
      }
    } catch {}

    res.json({
  balances,
  prices,
      totalValueUSD: Number(usdTotal.toFixed(2)),
      baselines,
      xrpAboveBaseline: balances.XRP && baselines.XRP?.baseline ? Math.max(0, balances.XRP - baselines.XRP.baseline) : 0,
      btcFree: collateralSummary?.btcFree ?? (balances.BTC || 0),
      totalChange24hPct,
      priceChange24hPct,
      collateral: collateralSummary,
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

// Recent executions listing
app.get('/executions/recent', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number((req.query.limit as string) || '25')));
    const items = await db?.collection('executions')
      .find({})
      .sort({ executedAt: -1 })
      .limit(limit)
      .toArray() || [];
    res.json({ count: items.length, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Profit-taking summary and recent profits (USDC-targeted)
app.get('/profits/recent', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number((req.query.limit as string) || '50')));
    const items = await db?.collection('executions')
      .find({ type: 'profit-taking' })
      .sort({ executedAt: -1 })
      .limit(limit)
      .toArray() || [];
    const totalNetUSD = items.reduce((s: number, e: any) => s + (e.estimatedNetUSD || 0), 0);
    const byAsset: Record<string, { count: number; netUSD: number }> = {};
    for (const e of items) {
      const k = (e.symbol || 'ASSET') as string;
      byAsset[k] = byAsset[k] || { count: 0, netUSD: 0 };
      byAsset[k].count += 1;
      byAsset[k].netUSD += e.estimatedNetUSD || 0;
    }
    // Include USDC yield accrual
    let yieldData: any = null;
    try {
      const { computeUSDCYield } = await import('./usdcYield');
      yieldData = db ? await computeUSDCYield(db) : null;
    } catch {}
    res.json({ count: items.length, totalNetUSD, byAsset, items, usdcYield: yieldData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Macro sentiment (Fear & Greed) latest value
app.get('/macro/sentiment', async (_req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const latest = await latestFearGreed(db);
    res.json({ ok: true, latest });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Knowledge Store endpoints
app.post('/knowledge/ingest', ownerAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const { ingestKnowledge } = await import('./knowledgeStore');
    const id = await ingestKnowledge(db, req.body);
    res.json({ ok: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/knowledge/query', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const { queryKnowledge } = await import('./knowledgeStore');
    const { type, tags, minConfidence, minRelevance, limit, sortBy } = req.query as any;
    const docs = await queryKnowledge(db, {
      type,
      tags: tags ? tags.split(',') : undefined,
      minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
      minRelevance: minRelevance ? parseFloat(minRelevance) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      sortBy,
    });
    res.json({ count: docs.length, items: docs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/knowledge/context', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const { getAIChatContext } = await import('./knowledgeStore');
    const tags = (req.query.tags as string)?.split(',') || [];
    const context = await getAIChatContext(db, tags);
    res.json({ context });
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

// Price analytics: SMA(7/30), 24h return, 7d volatility for selected coins
app.get('/analysis/prices', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const coins = ((req.query.coins as string) || 'BTC,XRP,USDC').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    const limitDays = Math.max(7, Math.min(60, Number((req.query.days as string) || '60')));
    const since = new Date(Date.now() - limitDays * 24 * 60 * 60 * 1000);
    const snaps = await db.collection('snapshots')
      .find({ timestamp: { $gte: since } })
      .project({ _prices: 1, timestamp: 1 })
      .sort({ timestamp: 1 })
      .limit(limitDays * 500) // guard
      .toArray();
    const series: Record<string, Array<{ t: Date; p: number }>> = {};
    for (const c of coins) series[c] = [];
    for (const s of snaps) {
      const prices = (s as any)._prices || {};
      for (const c of coins) {
        const p = prices[c];
        if (typeof p === 'number' && p > 0) series[c].push({ t: new Date((s as any).timestamp), p });
      }
    }
    function sma(arr: number[], w: number) {
      if (arr.length < w) return null;
      const tail = arr.slice(-w);
      return tail.reduce((a,b)=>a+b,0)/tail.length;
    }
    function volatility(arr: number[], days: number) {
      if (arr.length < days+1) return null;
      const tail = arr.slice(-days-1);
      const rets: number[] = [];
      for (let i=1;i<tail.length;i++) rets.push((tail[i]-tail[i-1])/tail[i-1]);
      if (!rets.length) return null;
      const mean = rets.reduce((a,b)=>a+b,0)/rets.length;
      const variance = rets.reduce((a,b)=>a+Math.pow(b-mean,2),0)/(rets.length-1 || 1);
      return Math.sqrt(variance);
    }
    const out: any = { generatedAt: new Date().toISOString(), coins: {} };
    for (const c of coins) {
      const pts = series[c];
      if (!pts.length) continue;
      const pricesOnly = pts.map(x=>x.p);
      const pNow = pricesOnly[pricesOnly.length-1];
      let p24h: number | null = null;
      // Find price closest to 24h ago
      const target = Date.now() - 24*60*60*1000;
      for (let i=pricesOnly.length-1;i>=0;i--) {
        const t = pts[i].t.getTime();
        if (t <= target) { p24h = pts[i].p; break; }
      }
      const ret24hPct = (p24h && p24h > 0) ? ((pNow - p24h) / p24h) * 100 : null;
      out.coins[c] = {
        last: pNow,
        sma7: sma(pricesOnly,7),
        sma30: sma(pricesOnly,30),
        return24hPct: ret24hPct,
        volatility7d: volatility(pricesOnly,7),
        points: pts.length,
      };
    }
    res.json(out);
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

// Profit-taking opportunities scanner (Requirement 15)
app.get('/analysis/profit-taking', async (_req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const { scanProfitOpportunities } = await import('./profitTaking');
    const opportunities = await scanProfitOpportunities(db);
    res.json({ count: opportunities.length, opportunities });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Run profit-taking scanner and create approvals
app.post('/analysis/profit-taking/scan', ownerAuth, async (_req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const { runProfitTakingScan } = await import('./profitTaking');
    const created = await runProfitTakingScan(db);
    liveEvents.emit('alert', {
      type: 'profit_taking',
      severity: 'info',
      message: `Profit-taking scan complete: ${created} approvals created`,
      timestamp: new Date().toISOString(),
    });
    res.json({ ok: true, approvalsCreated: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ML Price Predictions (Requirement 12)
app.get('/analysis/predictions', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const symbol = (req.query.symbol as string) || 'BTC';
    
    // Get latest price data from snapshots
    const latest = await db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
    const prices = (latest as any)?._prices || {};
    const currentPrice = prices[symbol];
    
    if (!currentPrice) {
      return res.status(404).json({ error: `No price data for ${symbol}` });
    }
    
    // Get historical prices (last 30 snapshots for EMA calculation)
    const historicalSnaps = await db.collection('snapshots')
      .find({})
      .sort({ timestamp: -1 })
      .limit(30)
      .toArray();
    
    const historicalPrices = historicalSnaps
      .map((s: any) => s._prices?.[symbol])
      .filter((p: any) => typeof p === 'number')
      .reverse();
    
    // TODO: Generate predictions using ML models (LSTM/ARIMA)
    // For now, return simple moving average projection
    const recentAvg = historicalPrices.length > 0
      ? historicalPrices.slice(-5).reduce((a: number, b: number) => a + b, 0) / Math.min(5, historicalPrices.length)
      : currentPrice;
    const predictions = {
      '1h': recentAvg * 1.001,
      '4h': recentAvg * 1.002,
      '1d': recentAvg * 1.005,
      '3d': recentAvg * 1.01,
      '1w': recentAvg * 1.02,
      confidence: 0.5,
      method: 'simple_moving_average',
      note: 'Full LSTM/ARIMA models pending implementation',
    };
    
    res.json({
      symbol,
      currentPrice,
      predictions,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Daily Learning Summary (Requirement 4)
app.get('/reports/daily-learning', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    
  const learning = await generateDailyLearning(db);
    
    res.json(learning);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// MFA Endpoints (Requirement 16)
app.post('/mfa/request', ownerAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const { tradeId, type, asset, quantity, estimatedValueUSD } = req.body;
    
    const mfaData = await requestMFA(db, {
      tradeId,
      userId: 'owner',
      type,
      asset,
      quantity,
      estimatedValueUSD,
    });
    
    res.json({
      ok: true,
      expiresAt: mfaData.expiresAt,
      message: 'Check terminal for verification code',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/mfa/verify', ownerAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const { tradeId, code } = req.body;
    
    const verification = await verifyMFA(db, tradeId, code);
    
    if (verification.valid) {
      res.json({ ok: true, message: 'MFA verified' });
    } else {
      res.status(403).json({ error: verification.reason });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/mfa/pending', ownerAuth, async (_req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const pending = await getPendingMFA(db, 'owner');
    res.json({ count: pending.length, items: pending });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Chat Log (for AI widget)
app.post('/chat/log', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const { message } = req.body;
    
    await db.collection('chatLogs').insertOne({
      ...message,
      timestamp: new Date(message.timestamp),
      createdAt: new Date(),
    });
    
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/chat/history', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const limit = Math.min(100, Math.max(1, Number((req.query.limit as string) || '50')));
    
    const messages = await db.collection('chatLogs')
      .find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    
    res.json({ count: messages.length, messages: messages.reverse() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Collateral Status (BTC protection)
app.get('/collateral/status', async (_req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });

    // Get BTC balances from cached Coinbase data
    let btcFree = 0;
    let btcLocked = 0;
    let btcTotal = 0;
    let health: any = null;
    let lastUpdate: number | null = null;

    try {
      const { getLatestBtcSnapshot } = await import('./services/btcWatcher');
      const btcSnap = getLatestBtcSnapshot();
      if (btcSnap) {
        btcFree = btcSnap.balance.available;
        btcLocked = btcSnap.balance.locked;
        btcTotal = btcSnap.balance.total;
        health = btcSnap.health;
        lastUpdate = btcSnap.ts;
      }
    } catch (err: any) {
      console.warn('[BTC Watcher] Failed to get collateral status:', err.message);
    }

    const latest = await db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
    const prices = (latest as any)?._prices || {};
    const btcPrice = prices.BTC || 0;

    const lockedPct = btcTotal > 0 ? btcLocked / btcTotal : 0;
    const btcExposureUSD = btcTotal * btcPrice;
    const btcLockedUSD = btcLocked * btcPrice;
    const btcFreeUSD = btcFree * btcPrice;

    res.json({
      btcTotal,
      btcLocked,
      btcFree,
      btcExposureUSD: Number(btcExposureUSD.toFixed(2)),
      btcLockedUSD: Number(btcLockedUSD.toFixed(2)),
      btcFreeUSD: Number(btcFreeUSD.toFixed(2)),
      lockedPct: Number((lockedPct * 100).toFixed(2)),
      healthBadge: health ? health.label : 'Unknown',
      healthTone: health ? health.tone : 'neutral',
      healthTooltip: health ? health.tooltip : 'BTC watcher not initialized',
      collateralSource: btcLocked > 0 ? 'Coinbase' : 'None',
      collateralFlag: btcLocked > 0 ? `BTC locked as collateral (${Number((lockedPct * 100).toFixed(1))}%)` : 'No BTC collateral lock',
      warning: health && health.tone === 'critical' ? 'High utilization detected - consider adding BTC' : null,
      updatedAt: lastUpdate ? new Date(lastUpdate).toISOString() : latest?.timestamp || null,
      hasCollateral: btcLocked > 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Recent backtests (inspection)
app.get('/backtests/recent', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number((req.query.limit as string) || '25')));
    const items = await db?.collection('backtests')
      .find({})
      .sort({ ranAt: -1 })
      .limit(limit)
      .toArray() || [];
    res.json({ count: items.length, items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Backtests aggregate summary per rule
app.get('/backtests/summary', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const windowDays = Math.max(1, Number((req.query.windowDays as string) || '90'));
    const maxRules = Math.max(1, Math.min(200, Number((req.query.maxRules as string) || '50')));
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const docs = await db.collection('backtests')
      .find({ ranAt: { $gte: since } })
      .sort({ ranAt: -1 })
      .limit(5000)
      .toArray();
    const byRule: Record<string, any> = {};
    for (const d of docs) {
      const id = (d as any).ruleId || 'unknown';
      const name = (d as any).ruleName || 'rule';
      const s = (d as any).summary || {};
      const entry = byRule[id] || { ruleId: id, ruleName: name, runs: 0, totalReturnPct: 0, sharpe: 0, maxDrawdown: 0, trades: 0, lastRanAt: null };
      entry.runs += 1;
      if (typeof s.totalReturnPct === 'number') entry.totalReturnPct += s.totalReturnPct;
      if (typeof s.sharpe === 'number') entry.sharpe += s.sharpe;
      if (typeof s.maxDrawdown === 'number') entry.maxDrawdown += s.maxDrawdown;
      entry.trades += s.trades || 0;
      const r = (d as any).ranAt ? new Date((d as any).ranAt) : null;
      if (r && (!entry.lastRanAt || r > entry.lastRanAt)) entry.lastRanAt = r;
      byRule[id] = entry;
    }
    let rows = Object.values(byRule).map((e: any) => ({
      ruleId: e.ruleId,
      ruleName: e.ruleName,
      runs: e.runs,
      avgReturnPct: e.runs ? e.totalReturnPct / e.runs : 0,
      avgSharpe: e.runs ? e.sharpe / e.runs : 0,
      avgMaxDrawdown: e.runs ? e.maxDrawdown / e.runs : 0,
      totalTrades: e.trades,
      lastRanAt: e.lastRanAt,
    }));
    // Sort by avgReturnPct desc then avgSharpe desc
    rows.sort((a: any, b: any) => (b.avgReturnPct - a.avgReturnPct) || (b.avgSharpe - a.avgSharpe));
    rows = rows.slice(0, maxRules);
    res.json({ windowDays, count: rows.length, items: rows });
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

// List all rotation policies
app.get('/rotation/policies', async (_req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const docs = await db.collection('rotation_policies').find({}).sort({ service: 1 }).toArray();
    res.json({ count: docs.length, policies: docs });
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

// Update rotation policy
app.post('/rotation/policy/:service', ownerAuth, async (req, res) => {
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

// ML Events endpoint
app.get('/ml/events', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: 'Database not connected' });
    const { getRecentMLEvents } = await import('./mlEvents');
    const limit = Math.min(100, Math.max(1, Number((req.query.limit as string) || '50')));
    const events = await getRecentMLEvents(db, limit);
    res.json({ count: events.length, items: events });
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
    // Map legacy/new snapshot events to portfolio:updated for UI compatibility
    'portfolio:snapshot': (data: any) => res.write(`data: ${JSON.stringify({ type: 'portfolio:updated', data })}\n\n`),
    'alert': (data: any) => res.write(`data: ${JSON.stringify({ type: 'alert', data })}\n\n`),
    // Trade events
    'trade:submitted': (data: any) => res.write(`data: ${JSON.stringify({ type: 'trade:submitted', data })}\n\n`),
    'trade:result': (data: any) => res.write(`data: ${JSON.stringify({ type: 'trade:result', data })}\n\n`),
  } as Record<string, (d: any) => void>;

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
  let riskInterval: NodeJS.Timeout | null = null;
  let riskBreachSince: Date | null = null;
  let recoveryStart: Date | null = null;
  let volatilityInterval: NodeJS.Timeout | null = null;
  let snapshotIntervalMinutesCurrent = Number(process.env.SNAPSHOT_INTERVAL_MINUTES || '60');
  let anomalyInterval: NodeJS.Timeout | null = null;
  let mongoWatchInterval: NodeJS.Timeout | null = null;
  let learningInterval: NodeJS.Timeout | null = null;
  let mongoReconnectBackoffMs = 15_000; // starts 15s, exponential backoff
  const mongoReconnectMaxMs = 15 * 60 * 1000; // cap at 15 minutes
  let mongoReconnecting = false;
  let backtestInterval: NodeJS.Timeout | null = null;

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
    // Downgraded to warn classification; not a fatal error, just informational
    getLogger({ svc: 'api' }).warn('MongoDB connection taking longer than expected (>6s). Continuing startup while retrying.');
    resolve(false);
  }, 6000)); // Wait 6s then proceed; watchdog handles reconnects
  
  await Promise.race([connectPromise, timeoutPromise]);
  
  // Start listening regardless of MongoDB status
  // ---- Robust port binding with automatic retry (EADDRINUSE) ----
  let server: any = null;
  async function bindPort(basePort: number, maxAttempts: number = 5): Promise<number> {
    let attempt = 0;
    while (attempt < maxAttempts) {
      const candidate = basePort + attempt;
      try {
        await new Promise<void>((resolve, reject) => {
          const srv = app.listen(candidate, '0.0.0.0', () => {
            ACTIVE_PORT = candidate;
            server = srv;
            resolve();
          });
          srv.on('error', (err: any) => {
            if (err && err.code === 'EADDRINUSE') {
              srv.close?.();
              reject(err);
            } else {
              reject(err);
            }
          });
        });
        return candidate; // success
      } catch (err: any) {
        if (err.code === 'EADDRINUSE') {
          getLogger({ svc: 'api' }).warn(`Port ${candidate} in use, retrying with ${candidate + 1}...`);
          attempt += 1;
          continue;
        }
        throw err; // non-address error
      }
    }
    throw new Error(`Unable to bind any port in range ${basePort}-${basePort + maxAttempts - 1}`);
  }

  const boundPort = await bindPort(port, 5);
  const log = getLogger({ svc: 'api' });
  log.info(`API listening on 0.0.0.0:${boundPort} (LIGHT_MODE=${LIGHT_MODE}, via=${portVia}, attempts<=5)`);
  log.info(`Health: http://localhost:${boundPort}/health`);
  log.info(`Full Health: http://localhost:${boundPort}/health/full`);
  log.info(`Mongo status at listen: ${db ? 'connected' : 'not-connected'}`);
  log.info(`CORS origins: ${ORIGINS.join(', ')}`);
    
    if (!db) {
  const log = getLogger({ svc: 'api' });
  log.warn('MongoDB not connected - many features will be unavailable');
  log.warn('Troubleshooting: https://www.mongodb.com/docs/atlas/troubleshoot-connection/');
    }
    
    // Start BTC watcher to poll Coinbase balances
    try {
      const { startBtcWatcher } = await import('./services/btcWatcher');
      startBtcWatcher();
      log.info('BTC watcher started - polling Coinbase balances every 90s');
    } catch (err: any) {
      log.warn(`Failed to start BTC watcher: ${err.message}`);
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

    // Data ingestion scheduler (Requirement 1 & 5)
    let dataScheduler: DataScheduler | null = null;
    if (!LIGHT_MODE && db) {
      try {
        dataScheduler = new DataScheduler(db, liveEvents, {
          portfolioIntervalMs: 5 * 60 * 1000, // 5 minutes
          priceIntervalMs: 60 * 1000, // 60 seconds
          rulesIntervalMs: 10 * 60 * 1000, // 10 minutes
        });
        dataScheduler.start();
        getLogger({ svc: 'api' }).info('Data scheduler started (portfolio: 5min, prices: 60s, rules: 10min)');
        
        // Start daily learning scheduler
  scheduleDailyLearning(db, liveEvents);
        getLogger({ svc: 'api' }).info('Daily learning scheduler started (runs at midnight)');
        
        // MFA cleanup (every 10 minutes)
        setInterval(() => {
          if (db) cleanupExpiredMFA(db).catch(() => {});
        }, 10 * 60 * 1000);
        
        // LTV monitoring (every 5 minutes)
        setInterval(() => {
          if (db) monitorLTV(db, liveEvents).catch((err) => {
            liveEvents.emit('alert', {
              type: 'ltv_monitor',
              severity: 'info',
              message: `LTV monitor: ${err.message}`,
              timestamp: new Date().toISOString(),
            });
          });
        }, 5 * 60 * 1000);

        // Macro sentiment fetch (Fear & Greed) every hour
        setInterval(async () => {
          if (!db) return;
          try {
            const fg = await fetchFearGreedIndex();
            await storeFearGreed(db, fg);
            liveEvents.emit('alert', {
              type: 'macro_feargreed',
              severity: 'info',
              message: `Fear & Greed Index: ${fg.value !== null ? fg.value : 'n/a'}`,
              data: fg,
              timestamp: new Date().toISOString(),
            });
          } catch (e: any) {
            liveEvents.emit('alert', {
              type: 'macro_feargreed',
              severity: 'warning',
              message: `Fear & Greed fetch failed: ${e?.message}`,
              timestamp: new Date().toISOString(),
            });
          }
        }, 60 * 60 * 1000);
        
        // Automatic profit-taking (every hour if enabled)
        const AUTO_PROFIT_ENABLED = process.env.AUTO_EXECUTE_PROFIT_TAKING === 'true';
        if (AUTO_PROFIT_ENABLED) {
          setInterval(async () => {
              if (!db) return;
            try {
              const { executeAutomaticProfitTaking } = await import('./profitTaking');
              const executed = await executeAutomaticProfitTaking(db);
              if (executed > 0) {
                liveEvents.emit('alert', {
                  type: 'profit_taking_auto',
                  severity: 'info',
                  message: `🎯 Automatic profit-taking: ${executed} trades executed`,
                  timestamp: new Date().toISOString(),
                });
              }
            } catch (err: any) {
              getLogger({ svc: 'api' }).error({ err: err?.message }, 'Auto profit-taking failed');
            }
          }, 60 * 60 * 1000); // Every hour
          getLogger({ svc: 'api' }).info('Automatic profit-taking enabled (hourly checks)');
        }
        
      } catch (err: any) {
        getLogger({ svc: 'api' }).warn({ err: err?.message }, 'Data scheduler failed to start');
      }
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
        const createdApprovalIds: Array<{ _id: any; intent: any }> = [];
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
          const ins = await db.collection('approvals').insertOne(approval as any);
          createdApprovalIds.push({ _id: ins.insertedId, intent });
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

        // Optional autonomous execution: approve and record a limited number of intents automatically
        const autoEnabled = process.env.AUTO_EXECUTE_ENABLED === 'true';
        const maxPerTick = Number(process.env.AUTO_EXECUTE_MAX_PER_TICK || '1');
        const riskMaxTradesHr = Number(process.env.AUTO_EXECUTE_RISK_MAX_TRADES_HOUR || '4');
        const dailyLossLimit = Number(process.env.AUTO_EXECUTE_DAILY_LOSS_LIMIT || '-1000');
        if (autoEnabled && !isDryRun()) {
          try {
            const risk = getRiskState();
            // Basic risk gating: skip auto-execution if system looks hot or losses exceed limit
            if (risk.tradesLastHour >= riskMaxTradesHr || (typeof risk.dailyLoss === 'number' && risk.dailyLoss <= dailyLossLimit)) {
              getLogger({ svc: 'api' }).warn('Auto-exec gated by risk: skipping this tick');
            } else {
              // Choose first N intents that look like concrete actions (enter/exit)
              const candidates = createdApprovalIds
                .filter(x => ['enter','exit'].includes((x.intent?.action?.type || '').toString()))
                .slice(0, Math.max(0, maxPerTick));
              for (const cand of candidates) {
                // Mark approval as approved by system
                await db.collection('approvals').updateOne(
                  { _id: cand._id },
                  { $set: { status: 'approved', actedBy: 'system:auto', actedAt: new Date() } }
                );
                // Record execution (simulated, platform trade execution is out of scope here)
                // Translate intent to trade (market for now)
                const intentAction = cand.intent.action;
                const symbol = (intentAction.symbol || 'BTC').toUpperCase();
                const side: 'buy' | 'sell' = intentAction.type === 'enter' ? 'buy' : intentAction.type === 'exit' ? 'sell' : 'buy';
                let balances: Record<string, number> = {};
                if (hasCoinbaseCredentials()) {
                  try { balances = await getCoinbaseApiClient().getAllBalances(); } catch {}
                }
                const baseBalance = balances[symbol] || 0;
                const allocationPct = Number(intentAction.allocationPct || 0.01);
                const amount = side === 'buy'
                  ? Number((baseBalance * allocationPct).toFixed(6)) || 0.001
                  : Math.min(Number((baseBalance * allocationPct).toFixed(6)), baseBalance);
                const risk = getRiskState();
                const tradeRes = await executeTrade({
                  side,
                  symbol,
                  amount,
                  mode: 'market',
                  reason: `auto-exec:${cand._id}`,
                  risk: {
                    tradesLastHour: (risk as any)?.tradesLastHour,
                    dailyLoss: (risk as any)?.dailyLoss,
                    killSwitch: false,
                    maxTradesHour: Number(process.env.AUTO_EXECUTE_RISK_MAX_TRADES_HOUR || '0'),
                    dailyLossLimit: Number(process.env.AUTO_EXECUTE_DAILY_LOSS_LIMIT || 'NaN'),
                  },
                });
                const execDoc = {
                  ruleId: cand.intent.ruleId,
                  action: cand.intent.action,
                  approvedId: cand._id,
                  executedAt: new Date(),
                  mode: 'auto',
                  dryRun: isDryRun(),
                  orderId: tradeRes.orderId,
                  status: tradeRes.status,
                  amount,
                  side,
                  symbol,
                };
                await db.collection('executions').insertOne(execDoc as any);
                try {
                  liveEvents.emit('trade:submitted', { mode: 'auto', side, symbol, amount, ruleId: cand.intent.ruleId, ts: new Date().toISOString() });
                  liveEvents.emit('trade:result', { mode: 'auto', ok: tradeRes.ok, orderId: tradeRes.orderId, status: tradeRes.status, ruleId: cand.intent.ruleId, ts: new Date().toISOString() });
                } catch {}
                liveEvents.emit('alert', {
                  type: 'execution',
                  severity: tradeRes.ok ? 'info' : 'high',
                  message: tradeRes.ok ? `Auto ${side} ${symbol} ${amount}` : `Auto trade failed ${side} ${symbol}`,
                  data: { exec: execDoc, trade: tradeRes },
                  timestamp: new Date().toISOString(),
                });
              }
            }
          } catch (e: any) {
            getLogger({ svc: 'api' }).warn({ err: e?.message }, 'Auto-execution step failed');
          }
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
    
  getLogger({ svc: 'api' }).info(`API fully initialized and ready for requests (activePort=${ACTIVE_PORT})`);

    // ---- Scheduled Backtests & Auto-tuning ----
    if (!LIGHT_MODE) {
      const backtestEnabled = (process.env.BACKTEST_SCHED_ENABLED || 'true') === 'true';
      if (backtestEnabled) {
        const everyHours = Math.max(1, Number(process.env.BACKTEST_SCHED_HOURS || '24'));
        const lookbackDays = Math.max(7, Number(process.env.BACKTEST_LOOKBACK_DAYS || '30'));
        const maxRules = Math.max(1, Number(process.env.BACKTEST_MAX_RULES || '20'));
        const autotune = (process.env.BACKTEST_AUTOTUNE_ENABLED || 'true') === 'true';
        getLogger({ svc: 'api' }).info(`Backtest scheduler enabled (every ${everyHours}h, lookback=${lookbackDays}d, maxRules=${maxRules}, autotune=${autotune})`);
        backtestInterval = setInterval(async () => {
          if (!db) return;
          try {
            const log = getLogger({ svc: 'api' });
            log.info('Running scheduled backtests...');
            const rules = await db.collection('rules').find({ enabled: true }).limit(maxRules).toArray();
            if (!rules.length) return;
            const latest = await db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
            const prices = (latest as any)?._prices || { BTC: 69000, USDC: 1 };
            const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
            const endDate = new Date();
            let tested = 0;
            for (const rule of rules) {
              try {
                const config: BacktestConfig = {
                  startDate,
                  endDate,
                  initialBalance: { BTC: 1, USDC: 50000 },
                  initialPrices: { BTC: prices.BTC || 69000, USDC: prices.USDC || 1 },
                };
                const result = await backtestRule(db, rule as any, config);
                await db.collection('backtests').insertOne({
                  ruleId: (rule as any)._id?.toString?.() || 'unknown',
                  ruleName: (rule as any).name || 'rule',
                  ranAt: new Date(),
                  lookbackDays,
                  config,
                  summary: {
                    totalReturnPct: (result as any)?.totalReturnPct,
                    sharpe: (result as any)?.sharpe,
                    maxDrawdown: (result as any)?.maxDrawdown,
                    trades: (result as any)?.trades?.length || 0,
                  },
                });
                tested += 1;
              } catch (e: any) {
                log.warn({ err: e?.message }, `Backtest failed for rule ${(rule as any).name || (rule as any)._id}`);
              }
            }
            liveEvents.emit('alert', {
              type: 'backtest',
              severity: 'info',
              message: `Scheduled backtests completed for ${tested}/${rules.length} rules`,
              data: { tested, total: rules.length, lookbackDays },
              timestamp: new Date().toISOString(),
            });
            if (autotune) {
              try {
                const results = await runOptimizationCycle(db, {});
                if (results.length > 0) {
                  liveEvents.emit('alert', {
                    type: 'optimization',
                    severity: 'medium',
                    message: `Auto-tuning: ${results.length} candidate improvements found`,
                    data: { top: results.slice(0, 3) },
                    timestamp: new Date().toISOString(),
                  });
                  for (const result of results.slice(0, 3)) {
                    const approval: Approval = {
                      type: 'stake-suggestion',
                      coin: 'RULE_UPDATE',
                      amount: 0,
                      title: `Auto-Tune: ${result.candidateRule.name}`,
                      summary: result.reasoning,
                      status: 'pending',
                      createdAt: new Date(),
                      metadata: { optimization: result, source: 'scheduled-backtest' },
                    };
                    await db.collection('approvals').insertOne(approval as any);
                    liveEvents.emit('approval:created', approval);
                  }
                }
              } catch (e: any) {
                log.warn({ err: e?.message }, 'Auto-tuning step failed');
              }
            }
          } catch (e: any) {
            getLogger({ svc: 'api' }).warn({ err: e?.message }, 'Scheduled backtests failed');
          }
        }, everyHours * 60 * 60 * 1000);
      } else {
        getLogger({ svc: 'api' }).info('Backtest scheduler disabled by env');
      }
    } else {
      getLogger({ svc: 'api' }).info('LIGHT_MODE enabled: backtest scheduler disabled');
    }

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
        // Helper to (re)schedule snapshot interval on demand
        const scheduleSnapshot = (minutes: number) => {
          try { if (snapshotInterval) clearInterval(snapshotInterval); } catch {}
          if (minutes > 0) {
            snapshotInterval = setInterval(() => {
              createLiveSnapshot('scheduled-interval').catch(() => {});
            }, minutes * 60 * 1000);
            snapshotIntervalMinutesCurrent = minutes;
            getLogger({ svc: 'api' }).info(`Scheduled automatic snapshots every ${minutes}m`);
          } else {
            snapshotInterval = null;
            getLogger({ svc: 'api' }).info('Automatic snapshot scheduler disabled (interval <= 0)');
          }
        };
        // Initial schedule from env (runs regardless of credentials; createLiveSnapshot is guarded internally)
        scheduleSnapshot(snapshotIntervalMinutesCurrent);

        // Volatility-aware cadence adjuster (optional, defaults provided)
        const volEnabled = (process.env.VOL_DYNAMIC_SNAPSHOT_ENABLED || 'true') === 'true';
        if (volEnabled) {
          const checkEveryMin = Number(process.env.VOL_CHECK_MINUTES || '5');
          const highStdPct = Number(process.env.VOL_HIGH_STDDEV_PCT || '3'); // e.g., 3% std dev over 24h returns
          const lowStdPct  = Number(process.env.VOL_LOW_STDDEV_PCT  || '1'); // e.g., below 1% -> slow cadence
          const fastMin    = Number(process.env.VOL_SNAPSHOT_FAST_MINUTES || '15');
          const slowMin    = Number(process.env.VOL_SNAPSHOT_SLOW_MINUTES || String(snapshotIntervalMinutesCurrent || 60));
          getLogger({ svc: 'api' }).info(`Volatility cadence enabled (check=${checkEveryMin}m, fast=${fastMin}m, slow=${slowMin}m, highStd=${highStdPct}%, lowStd=${lowStdPct}%)`);
          volatilityInterval = setInterval(async () => {
            try {
              if (!db) return;
              const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
              // Get last 24h snapshots with prices, sorted ascending
              const snaps = await db.collection('snapshots')
                .find({ timestamp: { $gte: since } })
                .project({ _prices: 1, timestamp: 1 })
                .sort({ timestamp: 1 })
                .limit(500)
                .toArray();
              if (snaps.length < 6) return; // not enough points
              // Use BTC price as a proxy; fallback to XRP if missing
              const prices: number[] = [];
              for (const s of snaps) {
                const p = (s as any)._prices || {};
                const val = typeof p.BTC === 'number' ? p.BTC : (typeof p.XRP === 'number' ? p.XRP : undefined);
                if (typeof val === 'number' && isFinite(val) && val > 0) prices.push(val);
              }
              if (prices.length < 6) return;
              const returnsPct: number[] = [];
              for (let i = 1; i < prices.length; i++) {
                const r = (prices[i] - prices[i-1]) / prices[i-1] * 100;
                if (isFinite(r)) returnsPct.push(r);
              }
              if (returnsPct.length < 5) return;
              const mean = returnsPct.reduce((a,b)=>a+b,0) / returnsPct.length;
              const variance = returnsPct.reduce((a,b)=>a + Math.pow(b-mean,2), 0) / (returnsPct.length - 1);
              const stdPct = Math.sqrt(variance);
              // Decide target interval with hysteresis-like bands
              let target = snapshotIntervalMinutesCurrent;
              if (stdPct >= highStdPct) target = fastMin;
              else if (stdPct <= lowStdPct) target = slowMin;
              if (target !== snapshotIntervalMinutesCurrent) {
                scheduleSnapshot(target);
                liveEvents.emit('alert', {
                  type: 'cadence',
                  severity: 'info',
                  message: `Snapshot cadence adjusted to ${target}m (std=${stdPct.toFixed(2)}%)`,
                  data: { stdPct, target },
                  timestamp: new Date().toISOString(),
                });
              }
            } catch {}
          }, Math.max(1, checkEveryMin) * 60 * 1000);
        }
      } catch (e: any) {
        getLogger({ svc: 'api' }).warn({ err: e?.message }, 'Failed to initialize automatic snapshot system');
      }
    } else {
      getLogger({ svc: 'api' }).info('LIGHT_MODE enabled: automatic snapshots disabled');
    }

    // ---- Dynamic Risk Throttles (auto kill-switch) ----
    if (!LIGHT_MODE) {
      const riskEnabled = (process.env.RISK_KILLSWITCH_ENABLED || 'true') === 'true';
      if (riskEnabled) {
        const maxTradesHr = Number(process.env.RISK_MAX_TRADES_HOUR || '8');
        const dailyLossLimit = Number(process.env.RISK_DAILY_LOSS_LIMIT || '-2000');
        const minCollateralHealth = Number(process.env.RISK_COLLATERAL_MIN_HEALTH || '0.5');
        const recoveryGraceMin = Number(process.env.RISK_RECOVERY_GRACE_MIN || '10');
        getLogger({ svc: 'api' }).info(`Risk throttles active (maxTradesHr=${maxTradesHr}, dailyLossLimit=${dailyLossLimit}, minHealth=${minCollateralHealth}, recoveryGraceMin=${recoveryGraceMin})`);
        riskInterval = setInterval(async () => {
          try {
            const risk = getRiskState();
            // Collateral health check
            let minHealth = 1;
            if (db) {
              const coll = await db.collection('collateral').find({}).project({ health: 1 }).toArray();
              if (coll.length > 0) minHealth = Math.min(...coll.map(c => typeof c.health === 'number' ? c.health : 1));
            }
            const tradeHot = typeof risk.tradesLastHour === 'number' && risk.tradesLastHour >= maxTradesHr;
            const lossBreach = typeof risk.dailyLoss === 'number' && risk.dailyLoss <= dailyLossLimit;
            const healthBreach = minHealth < minCollateralHealth;
            const breach = tradeHot || lossBreach || healthBreach;
            const now = new Date();
            if (breach) {
              riskBreachSince = riskBreachSince || now;
              recoveryStart = null; // reset recovery
              if (db) {
                const ks = await db.collection('kill_switch').findOne({});
                if (!ks?.enabled) {
                  const doc: KillSwitch = {
                    enabled: true,
                    reason: `auto-risk: ${[
                      tradeHot ? `trades/hr=${risk.tradesLastHour}` : null,
                      lossBreach ? `dailyLoss=${risk.dailyLoss}` : null,
                      healthBreach ? `minHealth=${minHealth.toFixed(2)}` : null,
                    ].filter(Boolean).join(', ')}`,
                    timestamp: now,
                    setBy: 'system:risk',
                  } as any;
                  await db.collection('kill_switch').replaceOne({}, doc, { upsert: true });
                  liveEvents.emit('killswitch:changed', doc);
                  getLogger({ svc: 'api' }).warn({ doc }, 'Kill-switch enabled by risk throttles');
                }
              }
            } else {
              // Consider recovery if kill-switch is currently enabled
              if (db) {
                const ks = await db.collection('kill_switch').findOne({});
                if (ks?.enabled) {
                  recoveryStart = recoveryStart || now;
                  const elapsedMin = (now.getTime() - recoveryStart.getTime()) / (60 * 1000);
                  if (elapsedMin >= recoveryGraceMin) {
                    const doc: KillSwitch = { enabled: false, reason: 'auto-recovery', timestamp: now, setBy: 'system:risk' } as any;
                    await db.collection('kill_switch').replaceOne({}, doc, { upsert: true });
                    liveEvents.emit('killswitch:changed', doc);
                    getLogger({ svc: 'api' }).info('Kill-switch disabled after recovery grace period');
                    riskBreachSince = null;
                    recoveryStart = null;
                  }
                } else {
                  // Not enabled, clear timers
                  riskBreachSince = null;
                  recoveryStart = null;
                }
              }
            }
          } catch (e: any) {
            // keep silent, interval continues
          }
        }, 60_000);
      } else {
        getLogger({ svc: 'api' }).info('Risk throttles disabled by env');
      }
    } else {
      getLogger({ svc: 'api' }).info('LIGHT_MODE enabled: risk throttles disabled');
    }

    // ---- Anomaly Detection & Alerting ----
    if (!LIGHT_MODE) {
      const anomalyEnabled = (process.env.ANOMALY_DETECT_ENABLED || 'true') === 'true';
      if (anomalyEnabled) {
        const checkMin = Number(process.env.ANOMALY_CHECK_MINUTES || '5');
        const zThresh = Number(process.env.ANOMALY_Z_THRESHOLD || '3');
        const singleStepPct = Number(process.env.ANOMALY_SINGLE_STEP_PCT || '2');
        anomalyInterval = setInterval(async () => {
          try {
            if (!db) return;
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const snaps = await db.collection('snapshots')
              .find({ timestamp: { $gte: since } })
              .sort({ timestamp: 1 })
              .limit(500)
              .toArray();
            if (snaps.length < 6) return;
            const totals: number[] = [];
            const times: Date[] = [];
            for (const s of snaps) {
              const prices = (s as any)._prices || {};
              let total = 0;
              for (const k of Object.keys(s)) {
                if (['_id','_prices','timestamp','reason'].includes(k)) continue;
                const qty = (s as any)[k];
                if (typeof qty === 'number') total += qty * (prices[k] || 0);
              }
              if (total > 0 && Number.isFinite(total)) {
                totals.push(total);
                times.push(new Date((s as any).timestamp));
              }
            }
            if (totals.length < 6) return;
            // Single-step percentage change check
            const last = totals[totals.length - 1];
            const prev = totals[totals.length - 2];
            const stepPct = ((last - prev) / prev) * 100;
            if (Math.abs(stepPct) >= singleStepPct) {
              liveEvents.emit('alert', {
                type: 'anomaly',
                severity: Math.abs(stepPct) >= singleStepPct * 2 ? 'high' : 'medium',
                message: `Portfolio total moved ${stepPct.toFixed(2)}% in one step`,
                data: { stepPct, last, prev, at: times[totals.length - 1] },
                timestamp: new Date().toISOString(),
              });
            }
            // Z-score of last value vs series
            const mean = totals.reduce((a,b)=>a+b,0) / totals.length;
            const variance = totals.reduce((a,b)=> a + Math.pow(b - mean, 2), 0) / (totals.length - 1);
            const std = Math.sqrt(Math.max(variance, 1e-9));
            const z = (last - mean) / std;
            if (Math.abs(z) >= zThresh) {
              liveEvents.emit('alert', {
                type: 'anomaly',
                severity: Math.abs(z) >= zThresh * 1.5 ? 'high' : 'medium',
                message: `Portfolio anomaly detected (z=${z.toFixed(2)})`,
                data: { z, last, mean, std },
                timestamp: new Date().toISOString(),
              });
            }
          } catch {}
        }, Math.max(1, checkMin) * 60 * 1000);
      }
    }

    // ---- Self-healing Mongo Watchdog ----
    if (!LIGHT_MODE) {
      mongoWatchInterval = setInterval(async () => {
        if (!MONGODB_URI) return;
        try {
          if (!db) throw new Error('db-not-connected');
          await db.command({ ping: 1 });
          // healthy; reset backoff
          mongoReconnectBackoffMs = 15_000;
        } catch (e: any) {
          if (mongoReconnecting) return;
          mongoReconnecting = true;
          liveEvents.emit('alert', {
            type: 'system',
            severity: 'high',
            message: `MongoDB disconnected, attempting reconnect in ${Math.round(mongoReconnectBackoffMs/1000)}s`,
            data: { backoffMs: mongoReconnectBackoffMs },
            timestamp: new Date().toISOString(),
          });
          setTimeout(async () => {
            try {
              await connectMongoDB();
              if (db) {
                liveEvents.emit('system:health', { component: 'mongodb', status: 'reconnected' });
                getLogger({ svc: 'api' }).info('MongoDB reconnected (watchdog)');
                mongoReconnectBackoffMs = 15_000;
              } else {
                mongoReconnectBackoffMs = Math.min(mongoReconnectBackoffMs * 2, mongoReconnectMaxMs);
              }
            } finally {
              mongoReconnecting = false;
            }
          }, mongoReconnectBackoffMs);
        }
      }, 120_000);
    }

    // ---- Autonomous Learning Loop ----
    if (!LIGHT_MODE) {
      const learningEnabled = (process.env.LEARNING_LOOP_ENABLED || 'true') === 'true';
      if (learningEnabled) {
        const everyMin = Number(process.env.LEARNING_RECOMPUTE_MINUTES || '60');
        learningInterval = setInterval(async () => {
          try {
            if (!db) return;
            const { calculateUserPreferences } = await import('@coinruler/shared');
            const decisions = await db.collection('trade_decisions').find({}).limit(5000).toArray();
            const prefs = calculateUserPreferences(decisions as any);
            await db.collection('ml_state').updateOne(
              { key: 'preferences' },
              { $set: { key: 'preferences', value: prefs, updatedAt: new Date(), count: decisions.length } },
              { upsert: true }
            );
            liveEvents.emit('alert', {
              type: 'learning',
              severity: 'info',
              message: `Preferences recomputed from ${decisions.length} decisions`,
              data: { confidenceScore: (prefs as any)?.confidenceScore },
              timestamp: new Date().toISOString(),
            });
          } catch {}
        }, Math.max(5, everyMin) * 60 * 1000);
      }
    }
  

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
    try { clearInterval(riskInterval as any); } catch {}
    try { clearInterval(volatilityInterval as any); } catch {}
    try { clearInterval(anomalyInterval as any); } catch {}
    try { clearInterval(mongoWatchInterval as any); } catch {}
    try { clearInterval(learningInterval as any); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Start the server
startServer().catch((err) => {
  // Soft-fail: log and keep process alive for diagnostics instead of exiting
  try {
    getLogger({ svc: 'api' }).error({ err: err?.message || String(err) }, 'Fatal startup error');
  } catch {}
});

// Safety: prevent process exit on unexpected errors
process.on('uncaughtException', (err) => {
  getLogger({ svc: 'api' }).error({ err }, 'Uncaught exception');
});
process.on('unhandledRejection', (reason) => {
  getLogger({ svc: 'api' }).error({ reason }, 'Unhandled rejection');
});
