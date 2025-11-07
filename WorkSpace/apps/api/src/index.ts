import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { Approval, KillSwitch, PortfolioSnapshot, monteCarloSimulation } from '@coinruler/shared';
// Lazy import of rules package (monorepo build order safety)
import { parseRule, createRule as createRuleDoc, listRules as listRuleDocs, setRuleEnabled, evaluateRulesTick, type EvalContext, type RuleSpec } from '@coinruler/rules';
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

// Real-time event emitter for SSE
const liveEvents = new EventEmitter();
liveEvents.setMaxListeners(100); // Support many concurrent SSE clients

const app = express();
app.use(helmet({
  contentSecurityPolicy: false, // Allow SSE
}));
// CORS to allow the web app to call the API from a different port
const WEB_ORIGIN = process.env.WEB_ORIGIN || process.env.NEXT_PUBLIC_WEB_ORIGIN || 'http://localhost:3000';
app.use(cors({
  origin: WEB_ORIGIN,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));
app.options('*', cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60_000, max: 60 }));

let db: Db | null = null;
let lastRuleExecutions: Record<string, Date> = {};

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'coinruler';

// Connection options to fix SSL/TLS issues
// Note: tlsAllowInvalidCertificates set to true temporarily for MongoDB Atlas compatibility
const mongoOptions = {
  tls: true,
  tlsAllowInvalidCertificates: true, // Temporary fix for Atlas TLS mismatch
  tlsAllowInvalidHostnames: false,
  serverSelectionTimeoutMS: 10000,
  retryWrites: true,
  w: 'majority' as const,
  maxPoolSize: 10,
};

async function connectMongoDB() {
  try {
    console.log(`🔄 Attempting MongoDB connection to ${MONGODB_URI.replace(/\/\/.*@/, '//<credentials>@')}...`);
    const client = await MongoClient.connect(MONGODB_URI, mongoOptions);
    db = client.db(DATABASE_NAME);
    console.log('✅ MongoDB connected successfully');
    liveEvents.emit('system:health', { component: 'mongodb', status: 'connected' });
    return true;
  } catch (err: any) {
    console.error('❌ MongoDB connection error:', err.message);
    console.warn('⚠️  API will start in degraded mode. Retrying connection in background...');
    // Retry in background without blocking startup
    setTimeout(async () => {
      console.log('🔄 Retrying MongoDB connection...');
      try {
        const client = await MongoClient.connect(MONGODB_URI, mongoOptions);
        db = client.db(DATABASE_NAME);
        console.log('✅ MongoDB reconnected successfully');
        liveEvents.emit('system:health', { component: 'mongodb', status: 'reconnected' });
      } catch (retryErr: any) {
        console.error('❌ MongoDB retry failed:', retryErr.message);
      }
    }, 10000);
    return false;
  }
}

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, db: db ? 'connected' : 'disconnected' }));

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
app.patch('/approvals/:id', async (req, res) => {
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

app.post('/kill-switch', async (req, res) => {
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
app.post('/portfolio/snapshot', async (req, res) => {
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

app.put('/rotation/policy/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const policy = { service: service as CredentialService, ...req.body };
    await updateRotationPolicy(db, policy);
    res.json({ ok: true, policy });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/rotation/rotate/:service', async (req, res) => {
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

app.post('/rotation/scheduler/check', async (_req, res) => {
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

// SSE endpoint for live updates
app.get('/live', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  res.flushHeaders();

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
  });
});

const port = Number(process.env.API_PORT || process.env.PORT || 3001);

async function startServer() {
  console.log('🚀 Starting CoinRuler API server...');
  
  // Connect MongoDB first (non-blocking with timeout)
  const connectPromise = connectMongoDB();
  const timeoutPromise = new Promise((resolve) => setTimeout(() => {
    console.warn('⏱️  MongoDB connection taking longer than expected, continuing startup...');
    resolve(false);
  }, 8000));
  
  await Promise.race([connectPromise, timeoutPromise]);
  
  // Start listening regardless of MongoDB status
  app.listen(port, async () => {
    console.log(`✅ API listening on :${port}`);
    console.log(`📡 Health: http://localhost:${port}/health`);
    console.log(`🌐 CORS origin: ${WEB_ORIGIN}`);
    
    // Start credential rotation scheduler if DB is ready
    if (db) {
      try {
        await startRotationScheduler(db, {
          checkIntervalHours: 24,
          enabled: process.env.ROTATION_SCHEDULER_ENABLED !== 'false',
          notifyOnRotation: true,
          notifyOnFailure: true,
        });
        console.log('✅ Rotation scheduler started');
      } catch (err: any) {
        console.warn('⚠️  Rotation scheduler failed to start:', err?.message || err);
      }
    } else {
      console.warn('⚠️  Rotation scheduler skipped (MongoDB not connected)');
    }

    // Rules evaluator scheduler (lightweight, minute cadence)
    console.log('⏰ Starting rules evaluator (60s interval)...');
    setInterval(async () => {
      if (!db) return;
      try {
        const objectivesDoc = await db.collection('objectives').findOne({ key: 'owner' });
        // Minimal portfolio snapshot
        const latest = await db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
        const balances = { ...(latest || {}) } as any;
        const prices = (latest?._prices as Record<string, number>) || {};
        // Remove non-balance keys
        delete balances._prices;
        delete balances._id;
        delete balances.timestamp;

        const ctx: EvalContext = {
          now: new Date(),
          portfolio: { balances, prices },
          objectives: objectivesDoc?.value || {},
          lastExecutions: lastRuleExecutions,
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
        }
      } catch (err) {
        // Silent fail for rule evaluation (non-critical)
      }
    }, 60_000);
    
    console.log('✅ API fully initialized and ready for requests');
  });
}

// Start the server
startServer().catch((err) => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});

// Safety: prevent process exit on unexpected errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
