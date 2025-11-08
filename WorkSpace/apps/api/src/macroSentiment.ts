import { Db } from 'mongodb';

/**
 * Fetch Fear & Greed index from feargreedmeter.com.
 * Site doesn't expose formal API; we parse HTML for a number (0-100).
 * Fallback: returns null if parse fails.
 */
export async function fetchFearGreedIndex(): Promise<{ value: number | null; raw: string }> {
  try {
    const resp = await fetch('https://feargreedmeter.com/');
    const html = await resp.text();
    // Common patterns: "Fear & Greed Index" followed by number or data-index="NN"
    let match = html.match(/Fear\s*&\s*Greed\s*Index[^0-9]{0,20}(\d{1,3})/i);
    if (!match) match = html.match(/data-index="(\d{1,3})"/i);
    const value = match ? Math.min(100, Math.max(0, Number(match[1]))) : null;
    return { value: Number.isFinite(value as number) ? value : null, raw: match ? match[0] : 'no-match' };
  } catch (e: any) {
    return { value: null, raw: e?.message || 'error' };
  }
}

export async function storeFearGreed(db: Db, data: { value: number | null; raw: string }) {
  try {
    await db.collection('macroSentiment').insertOne({
      source: 'feargreedmeter',
      value: data.value,
      raw: data.raw,
      fetchedAt: new Date(),
    });
  } catch {}
}

export async function latestFearGreed(db: Db) {
  const doc = await db.collection('macroSentiment').findOne({ source: 'feargreedmeter' }, { sort: { fetchedAt: -1 } });
  return doc || null;
}
