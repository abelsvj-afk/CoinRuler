// Set a manual portfolio snapshot. Usage:
// node scripts/set_snapshot_manual.js '{"BTC":99.97,"XRP":12.14}' --from-usd
// If --from-usd is provided, numbers are treated as USD and converted to coin amounts
require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');

async function fetchPrice(symbol) {
  try {
    const res = await axios.get(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`);
    return parseFloat(res.data.data.amount);
  } catch (e) {
    throw new Error('Price fetch failed for ' + symbol + ': ' + (e && e.message ? e.message : e));
  }
}

(async function(){
  const raw = process.argv[2];
  if (!raw) {
    console.error('Usage: node scripts/set_snapshot_manual.js "{\"BTC\":99.97,\"XRP\":12.14}" OR node scripts/set_snapshot_manual.js ./snapshot.json [--from-usd]');
    process.exit(1);
  }
  const fs = require('fs');
  let obj;
  try {
    if (fs.existsSync(raw)) {
      const content = fs.readFileSync(raw, 'utf8');
      obj = JSON.parse(content);
    } else {
      obj = JSON.parse(raw);
    }
  } catch (e) { console.error('Invalid JSON or unable to read file:', e.message); process.exit(1); }

  const fromUsd = process.argv.includes('--from-usd');
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
  const dbName = process.env.DATABASE_NAME || 'cryptoAdvisorUltimate';
  const client = await MongoClient.connect(uri);
  const db = client.db(dbName);

  try {
    const portfolio = {};
    for (const k of Object.keys(obj)) {
      const val = Number(obj[k]);
      if (Number.isNaN(val)) continue;
      if (fromUsd && k !== 'USDC' && k !== 'USD') {
        const price = await fetchPrice(k);
        portfolio[k] = val / price; // convert USD -> coin amount
      } else {
        // treat as coin amount
        portfolio[k] = val;
      }
    }

    await db.collection('portfolioSnapshots').insertOne({ timestamp: new Date(), portfolio });
    console.log('Inserted manual portfolioSnapshot:', portfolio);
  } catch (e) {
    console.error('Failed to write manual snapshot:', e && e.stack ? e.stack : e);
  } finally {
    await client.close();
  }
})();
