// Load .env
try { require('dotenv').config(); } catch (e) {}
const http = require('http');
const { MongoClient } = require('mongodb');

async function checkHealth() {
  return new Promise((resolve) => {
    http.get('http://localhost:3000/health', (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { resolve({ error: 'invalid-json', body }); }
      });
    }).on('error', (e) => resolve({ error: e.message }));
  });
}

async function evaluateRulesOnce() {
  try {
    const apiPort = process.env.API_PORT || process.env.PORT || 3001;
    const url = `http://localhost:${apiPort}/rules/evaluate`;
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.OWNER_ID) headers['X-Owner-Id'] = process.env.OWNER_ID;
    const res = await fetch(url, { method: 'POST', headers });
    if (res.ok) {
      const data = await res.json();
      console.log('Rules evaluation result:', data);
    } else {
      console.log('Rules evaluation endpoint returned status', res.status);
    }
  } catch (e) {
    console.log('Rule evaluation trigger failed (non-critical):', e?.message || e);
  }
}

async function smoke() {
  console.log('Checking http://localhost:3000/health ...');
  const health = await checkHealth();
  console.log('Health:', health);

  if (health && health.db && process.env.MONGODB_URI) {
    console.log('Testing MongoDB connection...');
    try {
      const client = await MongoClient.connect(process.env.MONGODB_URI, { useUnifiedTopology: true });
      const db = client.db(process.env.DATABASE_NAME || 'cryptoAdvisorUltimate');
      const col = db.collection('smoke_test');
      const r = await col.insertOne({ ts: new Date(), note: 'smoke' });
      console.log('Inserted smoke doc id:', r.insertedId);
      const doc = await col.findOne({ _id: r.insertedId });
      console.log('Read back smoke doc:', doc ? 'ok' : 'not-found');
      await col.deleteOne({ _id: r.insertedId });
      // Also show latest deposit and baseline documents
      try {
        const lastDeposit = await db.collection('deposits').find().sort({ timestamp: -1 }).limit(1).toArray();
        console.log('Latest deposit:', lastDeposit[0] || null);
      } catch (e) {
        console.log('Could not read deposits collection:', e && e.message ? e.message : e);
      }
      try {
        const baselines = await db.collection('baselines').find().toArray();
        console.log('Baselines:', baselines.length ? baselines : 'none');
      } catch (e) {
        console.log('Could not read baselines collection:', e && e.message ? e.message : e);
      }
      // Trigger one rules evaluation (dry-run) after smoke DB check
      await evaluateRulesOnce();
      await client.close();
    } catch (err) {
      console.error('Mongo smoke test failed:', err && err.message ? err.message : err);
    }
  } else {
    console.log('Skipping Mongo test (db not enabled or MONGODB_URI not set).');
  }
}

smoke();
