// Export historical trades and snapshots for ML training

const { MongoClient } = require('mongodb');
const fs = require('fs');

async function exportTrainingData() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.DATABASE_NAME || 'cryptoAdvisorUltimate');
  const trades = await db.collection('memory').find({ type: 'trade' }).toArray();
  const snapshots = await db.collection('portfolioSnapshots').find({}).toArray();
  fs.writeFileSync('exported_trades.json', JSON.stringify(trades, null, 2));
  fs.writeFileSync('exported_snapshots.json', JSON.stringify(snapshots, null, 2));
  console.log(`Exported ${trades.length} trades and ${snapshots.length} snapshots.`);
  await client.close();
}

if (require.main === module) {
  exportTrainingData().catch(e => { console.error(e); process.exit(1); });
}
