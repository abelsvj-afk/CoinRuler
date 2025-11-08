"use client";
import { useEffect, useState } from 'react';
import { getApiBase } from '../lib/api';
import { Button } from '@/components/ui/Button';
import { BackBar } from '../components/BackBar';

interface PriceAnalyticsCoin {
  last: number;
  sma7: number | null;
  sma30: number | null;
  return24hPct: number | null;
  volatility7d: number | null;
  points: number;
}

interface PriceAnalyticsResponse {
  generatedAt: string;
  coins: Record<string, PriceAnalyticsCoin>;
}

export default function AnalysisPage() {
  const api = getApiBase();
  const [data, setData] = useState<PriceAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [coinsInput, setCoinsInput] = useState('BTC,XRP,USDC');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${api}/analysis/prices?coins=${encodeURIComponent(coinsInput)}&days=60`, { cache: 'no-store' });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.warn('Failed to load analytics', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-8 space-y-8">
      <BackBar title="Price Analytics" />
      <p className="text-white/60 text-sm">SMA(7/30), 24h returns, and 7d volatility for core assets derived from historical snapshots.</p>

      <div className="glass rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <input
          value={coinsInput}
          onChange={e => setCoinsInput(e.target.value)}
          className="px-3 py-2 rounded bg-black/30 border border-white/10 text-sm focus:outline-none focus:border-[#FFB800]"
          placeholder="Coins comma separated"
        />
        <Button variant="secondary" disabled={loading} onClick={load}>{loading ? 'Loading...' : 'Reload'}</Button>
        {data && <div className="text-xs text-white/40">Generated {new Date(data.generatedAt).toLocaleTimeString()}</div>}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data && Object.entries(data.coins).map(([coin, c]) => (
          <div key={coin} className="glass rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-lg">{coin}</div>
              <div className={`text-xs px-2 py-1 rounded-full ${((c.return24hPct||0) >= 0) ? 'bg-green-600/30 text-green-300' : 'bg-red-600/30 text-red-300'}`}>{c.return24hPct !== null ? c.return24hPct.toFixed(2)+'%' : 'n/a'}</div>
            </div>
            <div className="text-xs grid grid-cols-2 gap-1 text-white/60">
              <div>SMA7</div><div className="text-right">{c.sma7 !== null ? c.sma7.toFixed(2) : 'n/a'}</div>
              <div>SMA30</div><div className="text-right">{c.sma30 !== null ? c.sma30.toFixed(2) : 'n/a'}</div>
              <div>Volatility7d</div><div className="text-right">{c.volatility7d !== null ? (c.volatility7d*100).toFixed(2)+'%' : 'n/a'}</div>
              <div>Price</div><div className="text-right">${c.last.toFixed(2)}</div>
              <div>Points</div><div className="text-right">{c.points}</div>
            </div>
          </div>
        ))}
        {data && Object.keys(data.coins).length === 0 && (
          <div className="text-white/40 text-sm">No price data found for selected coins.</div>
        )}
        {!data && !loading && (
          <div className="text-white/40 text-sm">No data loaded.</div>
        )}
      </div>
    </div>
  );
}
