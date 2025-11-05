/**
 * Minimal sentiment aggregator placeholder.
 * Exports analyzeText(text) -> { score, label }
 * and fetchNewsSentiment(keywords) -> { score, summary }
 * These are lightweight stubs so the rest of the system can call them.
 */
const axios = require('axios');

async function analyzeText(text) {
  // Very small heuristic: count positive/negative words
  const pos = ['good','great','bull','buy','surge','up','positive','beat'];
  const neg = ['bad','sell','bear','down','dump','negative','crash','drop'];
  const t = (text||'').toLowerCase();
  let score = 0;
  for (const p of pos) if (t.includes(p)) score += 1;
  for (const n of neg) if (t.includes(n)) score -= 1;
  const label = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  return { score, label };
}

async function fetchNewsSentiment(keywords = []) {
  // If NEWSAPI_KEY is present, call NewsAPI to fetch headlines and compute simple sentiment.
  const key = process.env.NEWSAPI_KEY || process.env.NEWS_API_KEY;
  if (!key) return { score: 0, summary: 'No NEWSAPI_KEY configured; returning neutral.' };

  try {
    const q = (keywords || []).slice(0,5).join(' OR ') || 'crypto OR bitcoin OR xrp';
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&pageSize=10&language=en&apiKey=${key}`;
    const res = await axios.get(url, { timeout: 8000 });
    const articles = (res.data && res.data.articles) || [];
    let agg = 0;
    for (const a of articles) {
      const text = `${a.title || ''} ${a.description || ''}`;
      const s = await analyzeText(text);
      agg += s.score;
    }
    const avg = articles.length ? agg / articles.length : 0;
    const summary = `Fetched ${articles.length} articles. avgSentiment=${avg.toFixed(2)}`;
    return { score: avg, summary };
  } catch (e) {
    return { score: 0, summary: 'NewsAPI fetch failed: ' + (e && e.message ? e.message : String(e)) };
  }
}

module.exports = { analyzeText, fetchNewsSentiment };
