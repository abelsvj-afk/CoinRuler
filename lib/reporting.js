/**
 * Reporting helpers: generate a daily report document and persist to DB.
 */
async function generateDailyReport(db, portfolio, options = {}) {
  const report = {
    createdAt: new Date(),
    portfolioSnapshot: portfolio || {},
    summary: options.summary || 'Automated daily report (placeholder)',
    monteCarloMean: options.monteCarloMean || null,
    sentiment: options.sentiment || null,
  };
  if (db) {
    await db.collection('reports').insertOne(report);
  }
  return report;
}

module.exports = { generateDailyReport };
