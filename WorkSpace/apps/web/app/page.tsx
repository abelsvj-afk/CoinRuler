"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, AlertTriangle, DollarSign, Activity, Shield, Zap } from "lucide-react";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getApiBase } from "./lib/api";
import { useRouter } from "next/navigation";
import { SSEStatus } from "./components/SSEStatus";

type DashboardResponse = {
  portfolio: any;
  approvals: any[];
  killSwitch: { enabled: boolean; reason: string };
  reports: any[];
};

type HealthResponse = {
  ok: boolean;
  db: string;
};

export default function HomePage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const apiBase = getApiBase();
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        // Enhanced diagnostics wrapper to classify failures (CORS, Mixed Content, DNS, TLS)
        const safeFetch = async (path: string) => {
          const url = `${apiBase}${path}`;
          const started = performance.now();
          try {
            const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
            return { res, ms: Math.round(performance.now() - started), url };
          } catch (err: any) {
            return { res: null, ms: Math.round(performance.now() - started), url, err };
          }
        };

        const [healthWrap, dashWrap, portfolioWrap] = await Promise.all([
          safeFetch('/health'),
          safeFetch('/dashboard'),
          safeFetch('/portfolio/current')
        ]);

        if (!healthWrap.res || !dashWrap.res || !portfolioWrap.res) {
          // Build a rich diagnostic message
          const classify = (w: any) => {
            if (w.res) return `${w.url} -> ${w.res.status} in ${w.ms}ms`;
            const m = w.err?.message || 'fetch failed';
            if (m.includes('Failed to fetch')) {
              if (typeof window !== 'undefined' && window.location.protocol === 'https:' && w.url.startsWith('http:')) {
                return `${w.url} -> Mixed Content blocked (https page calling http api)`;
              }
              return `${w.url} -> Network/CORS failure (${m})`;
            }
            return `${w.url} -> ${m}`;
          };
          const detail = [classify(healthWrap), classify(dashWrap), classify(portfolioWrap)].join(' | ');
          throw new Error(detail);
        }

        if (!healthWrap.res.ok || !dashWrap.res.ok || !portfolioWrap.res.ok) {
          throw new Error(`API responded with status ${healthWrap.res.status}/${dashWrap.res.status}/${portfolioWrap.res.status}`);
        }

        const [healthJson, dashJson, portfolioJson] = await Promise.all([
          healthWrap.res.json(),
          dashWrap.res.json(),
          portfolioWrap.res.json()
        ]);

        if (isMounted) {
          setHealth(healthJson);
          setData(dashJson);
          setPortfolio(portfolioJson);
          setApiError(null);
        }
      } catch (e: any) {
        console.error("Failed to load dashboard:", e);
        if (isMounted) {
          setApiError(e.message || "Cannot connect to API");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [apiBase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass rounded-2xl p-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 border-4 border-[#FFB800] border-t-transparent rounded-full animate-spin" />
            <p className="text-xl font-semibold">Loading Dashboard...</p>
          </div>
        </motion.div>
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-strong rounded-2xl p-8 max-w-md">
          <div className="text-center">
            <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Cannot Connect to API</h2>
            <p className="text-white/60 mb-4">{apiError}</p>
            <div className="glass rounded-lg p-3 mb-4 text-left">
              <div className="text-xs text-white/40 mb-2">API Base URL:</div>
              <code className="text-sm text-[#FFB800]">{apiBase}</code>
            </div>
            <p className="text-xs text-white/40 mb-4">
              Make sure your API is running and NEXT_PUBLIC_API_BASE is set correctly.
            </p>
            <div className="space-y-2 mb-4">
              <input
                placeholder="Paste API URL (https://...)"
                className="w-full rounded px-3 py-2 text-sm bg-black/30 border border-white/10 focus:outline-none focus:border-[#FFB800]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val.startsWith('http')) {
                      localStorage.setItem('override_api_base', val.replace(/\/$/, ''));
                      window.location.reload();
                    }
                  }
                }}
              />
              <p className="text-[10px] text-white/40">Temporary override saved to localStorage. Press Enter to apply.</p>
              {typeof window !== 'undefined' && localStorage.getItem('override_api_base') && (
                <div className="text-[10px] text-white/50">Override active: {localStorage.getItem('override_api_base')}</div>
              )}
              {typeof window !== 'undefined' && localStorage.getItem('override_api_base') && (
                <Button variant="ghost" size="sm" onClick={() => { localStorage.removeItem('override_api_base'); window.location.reload(); }}>Clear Override</Button>
              )}
            </div>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Retry Connection
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  const legacyPortfolio = data?.portfolio || {};
  const approvals = data?.approvals || [];
  const killSwitch = data?.killSwitch || { enabled: false, reason: "" };
  const reports = data?.reports || [];
  
  // Use /portfolio/current for real balances
  const balances = portfolio?.balances || {};
  const prices = portfolio?.prices || {};
  const totalValueUSD = portfolio?.totalValueUSD || 0;
  const baselines = portfolio?.baselines || {};
  const xrpAboveBaseline = portfolio?.xrpAboveBaseline || 0;
  const btcFree = portfolio?.btcFree || 0;
  const hasData = portfolio?.hasData || false;
  const updatedAt = portfolio?.updatedAt;
  const ageMs = portfolio?.ageMs;
  
  // Data freshness indicator
  const isFresh = ageMs !== null && ageMs < 120000; // < 2 min
  const isStale = ageMs !== null && ageMs > 300000; // > 5 min
  const ageLabel = updatedAt 
    ? `Updated: ${new Date(updatedAt).toLocaleTimeString()} (${Math.floor((ageMs || 0) / 1000)}s ago)`
    : "No data yet";

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-white to-[#FFB800] bg-clip-text text-transparent">CoinRuler</h1>
            <p className="text-white/60 text-lg">Autonomous Crypto Trading Platform</p>
          </div>
          <div className="flex gap-3">
            <div className="glass rounded-lg px-3 py-2 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${health?.ok ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-sm">
                API: {health?.ok ? 'UP' : 'DOWN'}
              </span>
            </div>
            <div className="glass rounded-lg px-3 py-2 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${health?.db === 'connected' ? 'bg-green-400 animate-pulse' : health?.db === 'degraded' ? 'bg-yellow-400' : 'bg-red-400'}`} />
              <span className="text-sm">
                DB: {health?.db || 'unknown'}
              </span>
            </div>
            <SSEStatus />
          </div>
        </div>

        {killSwitch.enabled && (
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-strong rounded-xl p-4 border border-red-500 glow-error">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <div>
                <div className="font-bold text-red-400">KILL SWITCH ACTIVE</div>
                <div className="text-sm text-white/60">{killSwitch.reason || "Trading halted"}</div>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Data Freshness */}
      {hasData && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4">
          <div className={`glass rounded-lg px-4 py-2 inline-flex items-center gap-2 text-sm ${isFresh ? 'text-green-400' : isStale ? 'text-red-400' : 'text-yellow-400'}`}>
            <div className={`w-2 h-2 rounded-full ${isFresh ? 'bg-green-400 animate-pulse' : isStale ? 'bg-red-400' : 'bg-yellow-400'}`} />
            {ageLabel}
          </div>
        </motion.div>
      )}

      {/* Stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Value" value={`$${totalValueUSD.toFixed(2)}`} change={5.2} trend="up" icon={<DollarSign className="w-5 h-5 text-[#FFB800]" />} />
        <StatCard label="BTC Holdings" value={`${btcFree.toFixed(8)}`} change={2.1} trend="up" icon={<TrendingUp className="w-5 h-5 text-[#FFB800]" />} />
        <StatCard label="Active Trades" value={approvals.length} icon={<Activity className="w-5 h-5 text-[#FFB800]" />} />
        <StatCard label="System Status" value={killSwitch.enabled ? "Halted" : hasData ? "Active" : "No Data"} icon={<Shield className="w-5 h-5 text-[#FFB800]" />} />
      </motion.div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Portfolio */}
        <Card hover gradient>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Portfolio</h2>
              <div className="w-10 h-10 rounded-xl bg-[#FFB800]/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-[#FFB800]" />
              </div>
            </div>

            {hasData ? (
              <div className="space-y-4">
                {balances.BTC !== undefined && (
                  <div className="glass rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60">BTC</span>
                      <span className="font-mono font-bold text-lg">{balances.BTC.toFixed(8)}</span>
                    </div>
                    {prices.BTC && <div className="text-sm text-white/40 mt-1">${(balances.BTC * prices.BTC).toFixed(2)} USD</div>}
                    {baselines.BTC?.baseline !== undefined && (
                      <div className="text-xs text-white/30 mt-1">Baseline: {baselines.BTC.baseline.toFixed(8)} BTC</div>
                    )}
                  </div>
                )}

                {balances.XRP !== undefined && (
                  <div className="glass rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60">XRP</span>
                      <span className="font-mono font-bold text-lg">{balances.XRP.toFixed(2)}</span>
                    </div>
                    {prices.XRP && <div className="text-sm text-white/40 mt-1">${(balances.XRP * prices.XRP).toFixed(2)} USD</div>}
                    {baselines.XRP?.baseline !== undefined && (
                      <div className="text-xs text-white/30 mt-1">
                        Baseline: {baselines.XRP.baseline.toFixed(2)} XRP 
                        {xrpAboveBaseline > 0 && <span className="text-green-400 ml-2">+{xrpAboveBaseline.toFixed(2)} above</span>}
                      </div>
                    )}
                  </div>
                )}

                {balances.USDC !== undefined && (
                  <div className="glass rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60">USDC</span>
                      <span className="font-mono font-bold text-lg">${balances.USDC.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {Object.keys(balances).filter(c => !['BTC','XRP','USDC'].includes(c)).map(coin => (
                  <div key={coin} className="glass rounded-lg p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60">{coin}</span>
                      <span className="font-mono font-bold text-lg">{balances[coin].toFixed(4)}</span>
                    </div>
                    {prices[coin] && <div className="text-sm text-white/40 mt-1">${(balances[coin] * prices[coin]).toFixed(2)} USD</div>}
                  </div>
                ))}

                {Object.keys(prices).length > 0 && (
                  <div className="glass rounded-lg p-4">
                    <div className="text-sm text-white/60 mb-2">Prices (USD)</div>
                    <div className="text-xs text-white/50 space-y-1">
                      {Object.entries(prices).map(([coin, price]) => (
                        <div key={coin} className="flex justify-between"><span>{coin}:</span><span className="font-mono">${(price as number).toFixed(2)}</span></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Shield className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/40 mb-2">No portfolio data available</p>
                <p className="text-[10px] text-white/30">Set Coinbase credentials on Railway or create a snapshot</p>
              </div>
            )}
          </div>
        </Card>

        {/* Approvals */}
        <Card hover gradient>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Pending Approvals</h2>
              <div className="w-10 h-10 rounded-xl bg-[#FFB800]/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-[#FFB800]" />
              </div>
            </div>

            {approvals.length > 0 ? (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {approvals.map((approval: any) => (
                  <motion.div key={approval._id || approval.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="glass rounded-lg p-3 hover:bg-white/10 transition-colors">
                    <div className="font-semibold text-sm">{approval.title || approval.type || "Trade"}</div>
                    <div className="text-xs text-white/60 mt-1">{approval.reason || approval.details || "Awaiting review"}</div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Shield className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">No pending approvals</p>
              </div>
            )}
          </div>
        </Card>

        {/* Projections placeholder */}
        <Card hover glow gradient>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Projections</h2>
              <div className="w-10 h-10 rounded-xl bg-[#FFB800]/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-[#FFB800]" />
              </div>
            </div>
            <div className="text-center py-8">
              <Activity className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 mb-4">No projections available</p>
              <Button variant="secondary" size="sm">Run Simulation</Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <div className="p-6">
            <h3 className="text-xl font-bold mb-4">Quick Actions</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={() => router.push('/approvals')}>
                <TrendingUp className="w-4 h-4" />
                View Approvals
              </Button>
              <Button variant="secondary" onClick={() => router.push('/dashboard')}>
                <Activity className="w-4 h-4" />
                Full Dashboard
              </Button>
              <Button variant="secondary" onClick={() => router.push('/alerts')}>
                <Shield className="w-4 h-4" />
                View Alerts
              </Button>
              <Button variant="ghost" onClick={() => router.push('/commands')}>
                <Zap className="w-4 h-4" />
                Commands
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Recent Reports */}
      <div className="glass rounded-2xl p-6 mt-8">
        <h2 className="text-xl font-bold mb-4">Recent Reports</h2>
        {reports.length > 0 ? (
          <div className="space-y-2">
            {reports.slice(0, 5).map((report: any, i: number) => (
              <div key={i} className="glass rounded-lg p-3 flex justify-between items-center">
                <div>
                  <div className="font-semibold text-sm">{report.summary || report.title || "Summary"}</div>
                  <div className="text-xs text-white/60">{report.createdAt ? new Date(report.createdAt).toLocaleString() : ""}</div>
                </div>
                {report.monteCarloMean && (
                  <div className="text-[#10B981] font-mono">${Number(report.monteCarloMean).toFixed(2)}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-white/40">No reports yet</p>
        )}
      </div>
    </div>
  );
}
