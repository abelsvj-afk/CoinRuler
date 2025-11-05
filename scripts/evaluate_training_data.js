// Evaluate exported training data for ML pipeline
require('dotenv').config();
const fs = require('fs');
const path = require('path');

function evaluateTrainingData() {
  const tmpDir = path.join(__dirname, '..', 'tmp');
  
  // Find the most recent training data file
  const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('training_data_') && f.endsWith('.json'));
  
  if (files.length === 0) {
    console.log('No training data files found. Run export_training_data.js first.');
    return;
  }
  
  // Get most recent file
  const latestFile = files.sort().reverse()[0];
  const dataPath = path.join(tmpDir, latestFile);
  
  console.log(`Evaluating training data from: ${latestFile}\n`);
  
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  // Compute metrics
  console.log('=== Training Data Metrics ===');
  console.log(`Exported at: ${data.metadata.exportedAt}`);
  console.log(`Total records: ${data.metadata.totalRecords}`);
  console.log(`Memory entries: ${data.metadata.collections.memory}`);
  console.log(`Snapshots: ${data.metadata.collections.snapshots}`);
  console.log(`Approvals: ${data.metadata.collections.approvals}\n`);
  
  // Analyze memory entries
  const memoryByType = {};
  for (const entry of data.memory || []) {
    memoryByType[entry.type] = (memoryByType[entry.type] || 0) + 1;
  }
  
  console.log('=== Memory Breakdown ===');
  for (const [type, count] of Object.entries(memoryByType)) {
    console.log(`${type}: ${count}`);
  }
  console.log();
  
  // Analyze approvals
  const approvalsByStatus = {};
  for (const approval of data.approvals || []) {
    approvalsByStatus[approval.status] = (approvalsByStatus[approval.status] || 0) + 1;
  }
  
  console.log('=== Approval Status ===');
  for (const [status, count] of Object.entries(approvalsByStatus)) {
    console.log(`${status}: ${count}`);
  }
  console.log();
  
  // Calculate approval rate
  const approved = approvalsByStatus.approved || 0;
  const declined = approvalsByStatus.declined || 0;
  const total = approved + declined;
  
  if (total > 0) {
    const approvalRate = (approved / total) * 100;
    console.log(`=== Approval Rate ===`);
    console.log(`Approval rate: ${approvalRate.toFixed(2)}%`);
    console.log(`Precision (approved / total): ${(approved / (data.metadata.collections.approvals || 1) * 100).toFixed(2)}%\n`);
  }
  
  // Analyze Monte Carlo predictions
  const monteCarloValues = data.memory
    .filter(e => e.type === 'analysis' && e.monteCarloMean)
    .map(e => e.monteCarloMean);
  
  if (monteCarloValues.length > 0) {
    const avgMC = monteCarloValues.reduce((a, b) => a + b, 0) / monteCarloValues.length;
    const minMC = Math.min(...monteCarloValues);
    const maxMC = Math.max(...monteCarloValues);
    
    console.log('=== Monte Carlo Statistics ===');
    console.log(`Average MC mean: $${avgMC.toFixed(2)}`);
    console.log(`Min MC mean: $${minMC.toFixed(2)}`);
    console.log(`Max MC mean: $${maxMC.toFixed(2)}\n`);
  }
  
  // Recommendations for ML training
  console.log('=== Recommendations ===');
  if (data.metadata.totalRecords < 100) {
    console.log('⚠️  Low data volume - collect more data for better ML training');
  } else if (data.metadata.totalRecords < 500) {
    console.log('✓ Moderate data volume - sufficient for initial ML training');
  } else {
    console.log('✓✓ Good data volume - ready for comprehensive ML training');
  }
  
  if (total < 20) {
    console.log('⚠️  Few approvals - may need more user interaction data');
  }
  
  console.log('\n=== Next Steps ===');
  console.log('1. Use this data to train reinforcement learning models');
  console.log('2. Implement prediction accuracy tracking');
  console.log('3. Set up periodic retraining (daily/weekly)');
  console.log('4. Monitor model performance and drift');
}

if (require.main === module) {
  evaluateTrainingData();
}

module.exports = { evaluateTrainingData };
