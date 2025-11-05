/**
 * Safe migration tool to detect deposits saved in USD (for coins like BTC)
 * and propose or apply a conversion to coin amounts using current spot prices.
 *
 * Usage:
 *  node scripts/migrate_normalize_deposits.js --coin BTC [--apply]
 *
 * By default this prints proposed changes. Pass --apply to update documents.
 */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');

async function fetchSpot(symbol) {
  try {
    const r = await axios.get(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`);
    return parseFloat(r.data.data.amount);
  } catch (e) {
    throw new Error('Price fetch failed: ' + (e && e.message ? e.message : e));
  }
}

(async function(){
  const args = process.argv.slice(2);
  const coinIndex = args.indexOf('--coin');
  if (coinIndex === -1 || !args[coinIndex+1]) {
    console.error('Usage: node scripts/migrate_normalize_deposits.js --coin BTC [--apply]');
    process.exit(2);
  }
  const COIN = args[coinIndex+1].toUpperCase();
  const APPLY = args.includes('--apply');
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }

  const client = await MongoClient.connect(uri);
  const db = client.db(process.env.DATABASE_NAME || 'cryptoAdvisorUltimate');

  try {
    // Heuristic: deposits with coin === COIN where amount > 1 are likely USD (for BTC)
    // We'll present these and convert using spot price.
    const rows = await db.collection('deposits').find({ coin: COIN }).toArray();
    if (!rows.length) {
      console.log('No deposits with coin', COIN);
      return;
    }

    const spot = await fetchSpot(COIN);
    console.log('Current spot for', COIN, 'is', spot);

    const proposals = [];
    for (const r of rows) {
      const amt = Number(r.amount) || 0;
      // If amount seems USD-ish (greater than 1 and greater than 0.1 * spot), propose conversion
      if (amt > 1 && amt > (0.1 * spot)) {
        const coinAmount = amt / spot;
        proposals.push({ _id: r._id, oldAmount: amt, newAmount: coinAmount });
      }
    }

    if (!proposals.length) {
      console.log('No candidate USD-stored deposits found for', COIN);
      return;
    }

    console.log('Proposed conversions (showing up to 100):');
    console.table(proposals.slice(0,100));

    if (!APPLY) {
      console.log('\nRun again with --apply to update these documents.');
      return;
    }

    // Apply updates: set amount to newAmount and add metadata
    for (const p of proposals) {
      const id = (() => { try { return new ObjectId(p._id); } catch(e){ return p._id; } })();
      await db.collection('deposits').updateOne({ _id: id }, { $set: { amount: p.newAmount }, $push: { history: { migratedFromUsd: p.oldAmount, spotAtMigration: spot, timestamp: new Date() } } });
      console.log('Updated', p._id);
    }
    console.log('Migration applied.');
  } catch (e) {
    console.error('Migration failed:', e && e.stack ? e.stack : e);
  } finally {
    await client.close();
  }
})();
