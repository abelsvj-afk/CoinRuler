/**
 * Sentiment analysis module - TypeScript migration
 * Analyzes text sentiment and fetches news sentiment
 */
import axios from 'axios';

export interface SentimentResult {
  score: number;
  label: 'positive' | 'negative' | 'neutral';
}

export interface NewsSentiment {
  score: number;
  summary: string;
  articles?: Array<{
    title: string;
    description?: string;
    sentiment: SentimentResult;
  }>;
}

export async function analyzeText(text: string): Promise<SentimentResult> {
  // Heuristic: count positive/negative words
  const pos = ['good', 'great', 'bull', 'buy', 'surge', 'up', 'positive', 'beat', 'rally', 'gain'];
  const neg = ['bad', 'sell', 'bear', 'down', 'dump', 'negative', 'crash', 'drop', 'fall', 'decline'];
  
  const t = (text || '').toLowerCase();
  let score = 0;
  
  for (const p of pos) {
    if (t.includes(p)) score += 1;
  }
  
  for (const n of neg) {
    if (t.includes(n)) score -= 1;
  }
  
  const label: 'positive' | 'negative' | 'neutral' = 
    score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
  
  return { score, label };
}

export async function fetchNewsSentiment(keywords: string[] = []): Promise<NewsSentiment> {
  // If NEWSAPI_KEY is present, call NewsAPI to fetch headlines and compute sentiment
  const key = process.env.NEWSAPI_KEY || process.env.NEWS_API_KEY;
  
  if (!key) {
    return { 
      score: 0, 
      summary: 'No NEWSAPI_KEY configured; returning neutral.' 
    };
  }

  try {
    const q = (keywords || []).slice(0, 5).join(' OR ') || 'crypto OR bitcoin OR xrp';
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&pageSize=10&language=en&apiKey=${key}`;
    
    const res = await axios.get(url, { timeout: 8000 });
    const articles = (res.data && res.data.articles) || [];
    
    let agg = 0;
    const analyzedArticles = [];
    
    for (const a of articles) {
      const text = `${a.title || ''} ${a.description || ''}`;
      const sentiment = await analyzeText(text);
      agg += sentiment.score;
      
      analyzedArticles.push({
        title: a.title,
        description: a.description,
        sentiment,
      });
    }
    
    const avg = articles.length ? agg / articles.length : 0;
    const summary = `Fetched ${articles.length} articles. avgSentiment=${avg.toFixed(2)}`;
    
    return { 
      score: avg, 
      summary,
      articles: analyzedArticles 
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { 
      score: 0, 
      summary: `NewsAPI fetch failed: ${errorMsg}` 
    };
  }
}
