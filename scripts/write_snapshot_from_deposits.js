// Build a portfolio from deposits and save as a portfolioSnapshot in DB
require('dotenv').config();
const { MongoClient } = require('mongodb');

(async function(){
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set in .env or environment.');
    process.exit(1);
  }
  const dbName = process.env.DATABASE_NAME || 'cryptoAdvisorUltimate';
  const client = await MongoClient.connect(uri);
  const db = client.db(dbName);
  try {
    const rows = await db.collection('deposits').find().toArray();
    const portfolio = {};
    for (const r of rows) {
      const c = (r.coin || '').toUpperCase();
      const amt = Number(r.amount) || 0;
      if (!c) continue;
      portfolio[c] = (portfolio[c] || 0) + amt;
    }
    await db.collection('portfolioSnapshots').insertOne({ timestamp: new Date(), portfolio });
    console.log('Wrote portfolioSnapshot:', portfolio);
  } catch (e) {
    console.error('Error writing snapshot from deposits:', e && e.stack ? e.stack : e);
  } finally {
    await client.close();
  }
})();
