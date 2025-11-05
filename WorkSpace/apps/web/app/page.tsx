"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, AlertTriangle, DollarSign, Activity, Shield, Zap } from "lucide-react";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { getApiBase } from "./lib/api";

type DashboardResponse = {
  portfolio: any;
  approvals: any[];
  killSwitch: { enabled: boolean; reason: string };
  reports: any[];
};

export default function HomePage() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const apiBase = getApiBase();

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const res = await fetch(`${apiBase}/dashboard`, { cache: "no-store" });
        const json: DashboardResponse = await res.json();
        if (isMounted) setData(json);
      } catch (e) {
        console.error("Failed to load dashboard:", e);
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

  const portfolio = data?.portfolio || {};
  const approvals = data?.approvals || [];
  const killSwitch = data?.killSwitch || { enabled: false, reason: "" };
  const reports = data?.reports || [];

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
            <Button variant="ghost" size="sm">
              <Activity className="w-4 h-4" />
              Live
            </Button>
            <Button variant="secondary" size="sm">
              <Shield className="w-4 h-4" />
              Protected
            </Button>
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

      {/* Stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Value" value={`$${(((portfolio.BTC || 0) * (portfolio._prices?.BTC || 0)) + (portfolio.USDC || 0)).toFixed(2)}`} change={5.2} trend="up" icon={<DollarSign className="w-5 h-5 text-[#FFB800]" />} />
        <StatCard label="BTC Holdings" value={(portfolio.BTC || 0).toFixed(8)} change={2.1} trend="up" icon={<TrendingUp className="w-5 h-5 text-[#FFB800]" />} />
        <StatCard label="Active Trades" value={approvals.length} icon={<Activity className="w-5 h-5 text-[#FFB800]" />} />
        <StatCard label="System Status" value={killSwitch.enabled ? "Halted" : "Active"} icon={<Shield className="w-5 h-5 text-[#FFB800]" />} />
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

            {portfolio && (portfolio.BTC || portfolio.XRP || portfolio.USDC) ? (
              <div className="space-y-4">
                <div className="glass rounded-lg p-4">
                  <div className="flex justify-between items-center"><span className="text-white/60">BTC</span><span className="font-mono font-bold text-lg">{portfolio.BTC?.toFixed(8) || "0.00000000"}</span></div>
                  {portfolio._prices?.BTC && (<div className="text-sm text-white/40 mt-1">${(portfolio.BTC * portfolio._prices.BTC).toFixed(2)} USD</div>)}
                </div>

                <div className="glass rounded-lg p-4">
                  <div className="flex justify-between items-center"><span className="text-white/60">XRP</span><span className="font-mono font-bold text-lg">{portfolio.XRP?.toFixed(2) || "0.00"}</span></div>
                  {portfolio._prices?.XRP && (<div className="text-sm text-white/40 mt-1">${(portfolio.XRP * portfolio._prices.XRP).toFixed(2)} USD</div>)}
                </div>

                <div className="glass rounded-lg p-4">
                  <div className="flex justify-between items-center"><span className="text-white/60">USDC</span><span className="font-mono font-bold text-lg">${portfolio.USDC?.toFixed(2) || "0.00"}</span></div>
                </div>

                {portfolio._prices && (
                  <div className="glass rounded-lg p-4">
                    <div className="text-sm text-white/60 mb-2">Prices (USD)</div>
                    <div className="text-xs text-white/50 space-y-1">
                      {Object.entries(portfolio._prices).map(([coin, price]) => (
                        <div key={coin} className="flex justify-between"><span>{coin}:</span><span className="font-mono">${(price as number).toFixed?.(2) ?? price}</span></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Shield className="w-12 h-12 text-white/20 mx-auto mb-3" />
                <p className="text-white/40">No portfolio data available</p>
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
              <Button variant="primary"><TrendingUp className="w-4 h-4" />New Trade</Button>
              <Button variant="secondary"><Activity className="w-4 h-4" />View Analytics</Button>
              <Button variant="secondary"><Shield className="w-4 h-4" />Security Settings</Button>
              <Button variant="ghost"><Zap className="w-4 h-4" />Run Simulation</Button>
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
