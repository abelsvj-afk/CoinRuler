'use client';
import { useEffect, useState } from 'react';

interface DashboardData {
  portfolio: any;
  approvals: any[];
  killSwitch: { enabled: boolean; reason: string };
  reports: any[];
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${apiUrl}/dashboard`);
        const json = await response.json();
        setData(json);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [apiUrl]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
        <p className="text-xl">Loading...</p>
      </div>
    );
  }

  const portfolio = data?.portfolio || {};
  const approvals = data?.approvals || [];
  const killSwitch = data?.killSwitch || { enabled: false, reason: '' };
  const reports = data?.reports || [];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-4xl font-bold">CoinRuler Dashboard</h1>
        {killSwitch.enabled && (
          <div className="bg-red-600 px-4 py-2 rounded-lg animate-pulse">
            🚨 KILL SWITCH ACTIVE
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Portfolio */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Portfolio</h2>
          {portfolio.BTC !== undefined ? (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">BTC:</span>
                <span className="font-mono">{portfolio.BTC?.toFixed(8) || '0.00000000'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">XRP:</span>
                <span className="font-mono">{portfolio.XRP?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">USDC:</span>
                <span className="font-mono">${portfolio.USDC?.toFixed(2) || '0.00'}</span>
              </div>
              {portfolio._prices && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <div className="text-sm text-gray-500">Prices (USD)</div>
                  <div className="text-xs text-gray-600 space-y-1 mt-2">
                    {Object.entries(portfolio._prices).map(([coin, price]: [string, any]) => (
                      <div key={coin} className="flex justify-between">
                        <span>{coin}:</span>
                        <span>${price?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400">No portfolio data available</p>
          )}
        </div>

        {/* Approvals */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Pending Approvals</h2>
          {approvals.length > 0 ? (
            <div className="space-y-3">
              {approvals.map((approval: any) => (
                <div key={approval._id} className="bg-gray-700 p-3 rounded">
                  <div className="font-semibold text-sm">{approval.title}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {approval.coin} {approval.amount} - {approval.type}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">No pending approvals</p>
          )}
        </div>

        {/* Monte Carlo */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Monte Carlo Simulation</h2>
          {reports.length > 0 && reports[0].monteCarloMean ? (
            <div className="space-y-2">
              <div className="text-3xl font-bold text-green-400">
                ${reports[0].monteCarloMean.toFixed(2)}
              </div>
              <div className="text-sm text-gray-400">Projected mean value (30 days)</div>
            </div>
          ) : (
            <p className="text-gray-400">Run Monte Carlo simulation for projections</p>
          )}
        </div>

        {/* ML Insights */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">ML Insights</h2>
          <p className="text-gray-400">ML predictions will appear here</p>
        </div>

        {/* Alerts */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Alerts</h2>
          {killSwitch.enabled ? (
            <div className="bg-red-900/30 border border-red-500 p-3 rounded">
              <div className="font-semibold text-red-400">Kill Switch Active</div>
              <div className="text-sm text-gray-300 mt-1">{killSwitch.reason}</div>
            </div>
          ) : (
            <p className="text-gray-400">No active alerts</p>
          )}
        </div>

        {/* Recent Reports */}
        <div className="bg-gray-800 p-6 rounded-lg col-span-full">
          <h2 className="text-xl font-semibold mb-4">Recent Reports</h2>
          {reports.length > 0 ? (
            <div className="space-y-2">
              {reports.slice(0, 5).map((report: any, i: number) => (
                <div key={i} className="bg-gray-700 p-3 rounded flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-sm">{report.summary}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(report.createdAt).toLocaleString()}
                    </div>
                  </div>
                  {report.monteCarloMean && (
                    <div className="text-green-400 font-mono">
                      ${report.monteCarloMean.toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">No reports yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
