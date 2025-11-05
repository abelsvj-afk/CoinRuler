// Evaluate exported training data for ML pipeline
const fs = require('fs');

function evaluateTrainingData() {
  const trades = JSON.parse(fs.readFileSync('exported_trades.json', 'utf8'));
  const snapshots = JSON.parse(fs.readFileSync('exported_snapshots.json', 'utf8'));
  // Simple metrics: count, date range, missing fields
  const tradeDates = trades.map(t => new Date(t.timestamp || t.time || t.createdAt)).filter(Boolean);
  const snapshotDates = snapshots.map(s => new Date(s.timestamp || s.time || s.createdAt)).filter(Boolean);
  const tradeRange = tradeDates.length ? [new Date(Math.min(...tradeDates)), new Date(Math.max(...tradeDates))] : [];
  const snapshotRange = snapshotDates.length ? [new Date(Math.min(...snapshotDates)), new Date(Math.max(...snapshotDates))] : [];
  const missingTradeFields = trades.filter(t => !t.amount || !t.coin || !t.timestamp);
  const missingSnapshotFields = snapshots.filter(s => !s.balances || !s.timestamp);
  console.log('Trade count:', trades.length);
  console.log('Trade date range:', tradeRange);
  console.log('Trades missing fields:', missingTradeFields.length);
  console.log('Snapshot count:', snapshots.length);
  console.log('Snapshot date range:', snapshotRange);
  console.log('Snapshots missing fields:', missingSnapshotFields.length);
}

if (require.main === module) {
  evaluateTrainingData();
}
