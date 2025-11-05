import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { MongoClient, Db, ObjectId } from 'mongodb';
import { Approval, KillSwitch, PortfolioSnapshot, monteCarloSimulation } from '@coinruler/shared';
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

// Real-time event emitter for SSE
const liveEvents = new EventEmitter();
liveEvents.setMaxListeners(100); // Support many concurrent SSE clients

const app = express();
app.use(helmet({
  contentSecurityPolicy: false, // Allow SSE
}));
app.use(express.json());
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60_000, max: 60 }));

let db: Db | null = null;

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'coinruler';

MongoClient.connect(MONGODB_URI)
  .then((client) => {
    db = client.db(DATABASE_NAME);
    console.log('MongoDB connected');
  })
  .catch((err) => console.error('MongoDB connection error:', err));

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

const port = Number(process.env.PORT || 3001);
app.listen(port, async () => {
  console.log(`API listening on :${port}`);
  
  // Start credential rotation scheduler on startup
  if (db) {
    await startRotationScheduler(db, {
      checkIntervalHours: 24,
      enabled: process.env.ROTATION_SCHEDULER_ENABLED !== 'false',
      notifyOnRotation: true,
      notifyOnFailure: true,
    });
  }
});
