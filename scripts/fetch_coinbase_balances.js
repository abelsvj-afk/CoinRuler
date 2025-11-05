// Fetch live account balances from Coinbase (requires COINBASE_API_KEY and COINBASE_API_SECRET in env)
require('dotenv').config();
const { Client } = require('coinbase');
const { MongoClient } = require('mongodb');

async function main() {
  const apiKey = process.env.COINBASE_API_KEY;
  const apiSecret = process.env.COINBASE_API_SECRET;
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DATABASE_NAME || 'cryptoAdvisorUltimate';

  if (!apiKey || !apiSecret) {
    console.error('COINBASE_API_KEY / COINBASE_API_SECRET not set in environment. Cannot fetch live balances.');
    process.exit(2);
  }
  if (!uri) {
    console.error('MONGODB_URI not set. Please set it to persist snapshots.');
  }

  const client = new Client({ apiKey, apiSecret });

  client.getAccounts({}, async (err, accounts) => {
    if (err) {
      console.error('Coinbase API error:', err && err.message ? err.message : err);
      process.exit(1);
    }

    const portfolio = {};
    const prices = {};

    for (const a of accounts) {
      try {
        const balance = a.balance && a.balance.amount ? Number(a.balance.amount) : 0;
        const currency = (a.balance && a.balance.currency) || a.currency || a.currency_code || null;
        // Coinbase returns native_balance for USD equivalents sometimes
        const native = a.native_balance && a.native_balance.amount ? Number(a.native_balance.amount) : null;

        if (!currency) continue;

        // Treat USD as USD, otherwise store coin amounts
        if (currency === 'USD' || currency === 'USDC') {
          // keep as stablecoin / USD numeric under USDC or USD
          portfolio[currency] = (portfolio[currency] || 0) + balance;
        } else {
          portfolio[currency] = (portfolio[currency] || 0) + balance;
          // If native USD value available, record an approximate price
          if (native && balance > 0) prices[currency] = native / balance;
        }
      } catch (e) {
        console.warn('Failed to process account', a && a.id ? a.id : a, e && e.message ? e.message : e);
      }
    }

    console.log('Live portfolio from Coinbase accounts:', portfolio);
    if (Object.keys(prices).length) console.log('Derived native USD prices (approx):', prices);

    if (uri) {
      try {
        const clientDb = await MongoClient.connect(uri);
        const db = clientDb.db(dbName);
        await db.collection('portfolioSnapshots').insertOne({ timestamp: new Date(), portfolio, _prices: prices });
        console.log('Inserted portfolioSnapshot into DB.');
        await clientDb.close();
      } catch (e) {
        console.error('Failed to write snapshot to DB:', e && e.message ? e.message : e);
      }
    } else {
      console.log('No MONGODB_URI set — not persisted. Set MONGODB_URI to persist snapshots.');
    }

    process.exit(0);
  });
}

main().catch(e => { console.error('Unexpected error:', e && e.stack ? e.stack : e); process.exit(1); });
