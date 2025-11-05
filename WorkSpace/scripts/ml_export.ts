import { MongoClient } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.DATABASE_NAME || 'coinruler';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  // Assumes collections: trades, snapshots (adjust as needed)
  const trades = await db.collection('trades').find({}).limit(10000).toArray();
  const snapshots = await db.collection('snapshots').find({}).limit(10000).toArray();

  const payload = { exportedAt: new Date().toISOString(), trades, snapshots };
  console.log(JSON.stringify(payload));

  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
