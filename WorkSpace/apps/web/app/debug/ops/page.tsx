"use client";
import { useEffect, useState } from 'react';
import { getApiBase } from '../../lib/api';
import { Button } from '@/components/ui/Button';

interface CoinbaseStatus { status: string; hasCredentials: boolean; keyLength: number; balancesSample?: Record<string, number>; error?: string; balanceError?: string; }
interface RotationStatus { enabled?: boolean; lastCheckAt?: string; nextCheckAt?: string; lastRotations?: any[]; }
interface BacktestSummaryItem { ruleId: string; ruleName: string; runs: number; avgReturnPct: number; avgSharpe: number; avgMaxDrawdown: number; totalTrades: number; lastRanAt?: string; }

export default function OpsPage() {
  const [apiBase] = useState(() => getApiBase());
  const [coinbase, setCoinbase] = useState<CoinbaseStatus | null>(null);
  const [rotation, setRotation] = useState<RotationStatus | null>(null);
  const [policies, setPolicies] = useState<any[]>([]);
  const [backtests, setBacktests] = useState<BacktestSummaryItem[]>([]);
  const [envFlags, setEnvFlags] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  async function fetchAll() {
    setLoading(true);
    try {
      const [c, r, p, b, e] = await Promise.all([
        fetch(apiBase + '/coinbase/status').then(r => r.json()).catch(() => null),
        fetch(apiBase + '/rotation/status').then(r => r.json()).catch(() => null),
        fetch(apiBase + '/rotation/policies').then(r => r.json()).catch(() => ({ policies: [] })),
        fetch(apiBase + '/backtests/summary').then(r => r.json()).catch(() => ({ items: [] })),
        fetch(apiBase + '/env').then(r => r.json()).catch(() => null),
      ]);
      setCoinbase(c);
      setRotation(r);
      setPolicies(p?.policies || []);
      setBacktests(b?.items || []);
      setEnvFlags(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">Operational Status</h1>
      <p className="text-white/50 text-sm">Real-time inspection of credentials, schedulers, and performance summaries.</p>
      <div className="flex gap-3 flex-wrap">
        <Button variant="secondary" disabled={loading} onClick={fetchAll}>{loading ? 'Refreshing...' : 'Refresh'}</Button>
      </div>

      <section className="glass rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">Coinbase Connectivity</h2>
        {!coinbase && <div className="text-xs text-white/40">Loading...</div>}
        {coinbase && (
          <div className="text-xs space-y-1">
            <div>Status: <span className={coinbase.status === 'connected' ? 'text-green-400' : coinbase.status === 'failed' ? 'text-red-400' : 'text-white/60'}>{coinbase.status}</span></div>
            <div>Credentials: {coinbase.hasCredentials ? 'present' : 'missing'} (key length {coinbase.keyLength})</div>
            {coinbase.error && <div className="text-red-300">Error: {coinbase.error}</div>}
            {coinbase.balanceError && <div className="text-red-300">Balances Error: {coinbase.balanceError}</div>}
            {coinbase.hasCredentials && (
              <div className="mt-2">
                <Button
                  variant="secondary"
                  disabled={snapshotBusy}
                  onClick={async () => {
                    setSnapshotBusy(true);
                    try {
                      const res = await fetch(apiBase + '/portfolio/snapshot/force', { method: 'POST' });
                      if (res.ok) {
                        await fetchAll();
                      }
                    } finally {
                      setSnapshotBusy(false);
                    }
                  }}
                >{snapshotBusy ? 'Creating Snapshot...' : 'Create Live Snapshot'}</Button>
              </div>
            )}
            {coinbase.balancesSample && (
              <div className="mt-2"><div className="text-white/40">Sample Balances:</div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {Object.entries(coinbase.balancesSample).map(([k,v]) => (
                    <div key={k} className="text-[11px] bg-black/30 rounded px-2 py-1 flex justify-between"><span>{k}</span><span>{v}</span></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="glass rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">Rotation Scheduler</h2>
        {!rotation && <div className="text-xs text-white/40">Loading...</div>}
        {rotation && (
          <div className="text-xs space-y-1">
            <div>Enabled: {String(envFlags?.rotationSchedulerEnabled)}</div>
            <div>Last Check: {rotation.lastCheckAt || 'n/a'}</div>
            <div>Next Check: {rotation.nextCheckAt || 'n/a'}</div>
            <div className="mt-2 font-semibold">Policies ({policies.length}):</div>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {policies.map(p => (
                <div key={p.service} className="text-[11px] bg-black/30 rounded px-2 py-1">
                  <div className="flex justify-between"><span>{p.service}</span><span>{p.intervalDays ? p.intervalDays + 'd' : ''}</span></div>
                  {p.preRotateNotifyDays && <div className="text-white/30">Notify {p.preRotateNotifyDays}d prior</div>}
                </div>
              ))}
              {policies.length === 0 && <div className="text-white/40 text-[11px]">No policies stored</div>}
            </div>
          </div>
        )}
      </section>

      <section className="glass rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">Backtest Performance</h2>
        <div className="text-xs text-white/40">Window: default 90d • Scheduler Enabled: {String(envFlags?.backtestSchedulerEnabled)} • Interval (h): {envFlags?.backtestEveryHours}</div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {backtests.map(bt => (
            <div key={bt.ruleId} className="rounded bg-black/30 border border-white/10 p-2 text-[11px] space-y-1">
              <div className="font-semibold truncate" title={bt.ruleName}>{bt.ruleName}</div>
              <div>Runs: {bt.runs}</div>
              <div>Avg Return: {bt.avgReturnPct.toFixed(2)}%</div>
              <div>Avg Sharpe: {bt.avgSharpe.toFixed(2)}</div>
              <div>Avg MaxDD: {bt.avgMaxDrawdown.toFixed(2)}%</div>
              <div>Trades: {bt.totalTrades}</div>
              <div className="text-white/40">Last: {bt.lastRanAt ? new Date(bt.lastRanAt).toLocaleString() : 'n/a'}</div>
            </div>
          ))}
          {backtests.length === 0 && <div className="text-white/40 text-xs">No backtest data yet</div>}
        </div>
      </section>

      <section className="glass rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">Environment Flags</h2>
        {envFlags ? (
          <div className="grid md:grid-cols-3 gap-2 text-[11px]">
            {Object.entries(envFlags).map(([k,v]) => (
              <div key={k} className="bg-black/30 rounded px-2 py-1 flex justify-between"><span>{k}</span><span className="text-white/60 truncate max-w-[80px]">{String(v)}</span></div>
            ))}
          </div>
        ) : <div className="text-white/40 text-xs">Loading...</div>}
      </section>
    </div>
  );
}
