// Export historical trades and snapshots for ML training
require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function exportTrainingData() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.DATABASE_NAME || 'cryptoAdvisorUltimate');
  
  console.log('Exporting training data...');
  
  // Export memory (trades, analysis, actions)
  const memory = await db.collection('memory').find({}).sort({ timestamp: 1 }).toArray();
  console.log(`Found ${memory.length} memory entries`);
  
  // Export snapshots
  const snapshots = await db.collection('portfolioSnapshots').find({}).sort({ timestamp: 1 }).toArray();
  console.log(`Found ${snapshots.length} snapshots`);
  
  // Export approvals
  const approvals = await db.collection('approvals').find({}).sort({ createdAt: 1 }).toArray();
  console.log(`Found ${approvals.length} approvals`);
  
  // Create training data structure
  const trainingData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      totalRecords: memory.length + snapshots.length + approvals.length,
      collections: {
        memory: memory.length,
        snapshots: snapshots.length,
        approvals: approvals.length,
      },
    },
    memory,
    snapshots,
    approvals,
  };
  
  // Export to JSON
  const outputDir = path.join(__dirname, '..', 'tmp');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const timestamp = Date.now();
  const jsonPath = path.join(outputDir, `training_data_${timestamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(trainingData, null, 2));
  console.log(`Training data exported to: ${jsonPath}`);
  
  // Export to CSV for easier analysis
  const csvPath = path.join(outputDir, `training_data_${timestamp}.csv`);
  const csvLines = ['timestamp,type,btc_price,xrp_price,monte_carlo_mean,action'];
  
  for (const entry of memory) {
    if (entry.type === 'analysis') {
      csvLines.push([
        entry.timestamp || '',
        entry.type || '',
        entry.btcPrice || '',
        entry.xrpPrice || '',
        entry.monteCarloMean || '',
        entry.recommendedAction || '',
      ].join(','));
    }
  }
  
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`CSV data exported to: ${csvPath}`);
  
  await client.close();
  console.log('Export complete!');
}

if (require.main === module) {
  exportTrainingData().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { exportTrainingData };
