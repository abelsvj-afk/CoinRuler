"use client";
import { useEffect, useState, useCallback } from 'react';
import { getApiBase } from '../lib/api';
import { useSSE, type SSEEvent } from '../lib/useSSE';
import { showToast } from '../components/Toast';

interface PortfolioAsset {
  coin: string;
  balance: number;
  baselineBalance?: number;
  locked?: number;
  free?: number;
  price?: number;
  value?: number;
  change24h?: number;
}

interface PortfolioData {
  timestamp: string;
  balances: Record<string, number>;
  baselines?: Record<string, number>;
  prices?: Record<string, number>;
  totalValue?: number;
  totalChange24h?: number;
  collateralStatus?: {
    btcLocked?: number;
    btcFree?: number;
    ltv?: number;
  };
}

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const api = getApiBase();

  async function loadPortfolio() {
    try {
      const res = await fetch(`${api}/portfolio/current`, { cache: 'no-store' });
      const d = await res.json();
      const baselines: Record<string, number> = {};
      if (d?.baselines) {
        for (const [k, v] of Object.entries(d.baselines)) {
          const vv: any = v;
          if (vv && typeof vv.baseline === 'number') baselines[k] = vv.baseline;
        }
      }
      const mapped: PortfolioData = {
        timestamp: d?.updatedAt || new Date().toISOString(),
        balances: d?.balances || {},
        baselines,
        prices: d?.prices || {},
        totalValue: d?.totalValueUSD,
      };
      setPortfolio(mapped);
    } catch (err) {
      console.error('[Portfolio] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }

  // Handle SSE events
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (event.type === 'portfolio:updated') {
      console.log('[Portfolio] Live update:', event.data);
      setPortfolio(event.data);
      showToast('info', 'Portfolio Updated', 'Your balances have changed');
    }
  }, []);

  useSSE(`${api}/live`, handleSSEEvent);

  useEffect(() => {
    loadPortfolio();
  }, []);

  if (loading) {
    return <main className="max-w-5xl mx-auto p-6">Loading portfolio...</main>;
  }

  if (!portfolio || !portfolio.balances || Object.keys(portfolio.balances).length === 0) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Portfolio</h1>
        <div className="border rounded p-8 text-center text-gray-500 space-y-3">
          <div>No portfolio data available. Take a snapshot first.</div>
          <button
            className="px-4 py-2 rounded bg-[#FFB800] text-black font-semibold hover:opacity-90"
            onClick={async () => {
              try {
                const res = await fetch(`${api}/portfolio/snapshot/force`, { method: 'POST' });
                if (res.ok) {
                  showToast('success', 'Snapshot Created', 'Pulled live balances from Coinbase');
                  loadPortfolio();
                } else {
                  const err = await res.json().catch(() => ({}));
                  showToast('error', 'Snapshot Failed', err?.error || 'Unable to create snapshot');
                }
              } catch (e: any) {
                showToast('error', 'Snapshot Failed', e?.message || 'Network error');
              }
            }}
          >Create Live Snapshot</button>
        </div>
      </main>
    );
  }

  const assets: PortfolioAsset[] = Object.entries(portfolio.balances).map(([coin, balance]) => ({
    coin,
    balance,
    baselineBalance: portfolio.baselines?.[coin],
    price: portfolio.prices?.[coin],
    value: portfolio.prices?.[coin] ? portfolio.prices[coin] * balance : undefined,
  }));

  // Calculate total value if available
  const totalValue = assets.reduce((sum, a) => sum + (a.value || 0), 0);

  const collateral = portfolio.collateralStatus;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Live Portfolio</h1>

      <div className="text-sm text-gray-600">
        Last updated: {new Date(portfolio.timestamp).toLocaleString()}
      </div>

      {/* Total Value */}
      {totalValue > 0 && (
        <section className="border rounded p-6 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="text-sm text-gray-600">Total Portfolio Value</div>
          <div className="text-3xl font-bold">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          {portfolio.totalChange24h !== undefined && (
            <div className={`text-sm mt-1 ${portfolio.totalChange24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {portfolio.totalChange24h >= 0 ? '▲' : '▼'} {Math.abs(portfolio.totalChange24h).toFixed(2)}% (24h)
            </div>
          )}
        </section>
      )}

      {/* Collateral Status (for BTC) */}
      {collateral && (collateral.btcLocked || collateral.ltv) && (
        <section className="border border-yellow-500 rounded p-4 bg-yellow-50">
          <h2 className="font-medium mb-2">🔒 Collateral Status</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {collateral.btcLocked !== undefined && (
              <>
                <div>BTC Locked (Collateral)</div>
                <div className="font-mono">{collateral.btcLocked.toFixed(8)} BTC</div>
              </>
            )}
            {collateral.btcFree !== undefined && (
              <>
                <div>BTC Free (Available)</div>
                <div className="font-mono">{collateral.btcFree.toFixed(8)} BTC</div>
              </>
            )}
            {collateral.ltv !== undefined && (
              <>
                <div>Loan-to-Value (LTV)</div>
                <div className={collateral.ltv > 0.7 ? 'text-red-600 font-bold' : 'text-green-600'}>
                  {(collateral.ltv * 100).toFixed(1)}%
                </div>
              </>
            )}
          </div>
          {collateral.ltv && collateral.ltv > 0.7 && (
            <div className="mt-2 text-sm text-red-600 font-semibold">
              ⚠️ High LTV! Consider topping up or partial repayment.
            </div>
          )}
        </section>
      )}

      {/* Assets */}
      <section className="space-y-3">
        <h2 className="font-medium">Assets</h2>
        {assets.map(asset => {
          const aboveBaseline = asset.baselineBalance 
            ? asset.balance - asset.baselineBalance 
            : null;
          
          return (
            <div key={asset.coin} className="border rounded p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-lg">{asset.coin}</div>
                  <div className="font-mono text-sm text-gray-600">
                    {asset.balance.toLocaleString('en-US', { 
                      minimumFractionDigits: asset.coin === 'BTC' ? 8 : 2,
                      maximumFractionDigits: asset.coin === 'BTC' ? 8 : 2 
                    })}
                  </div>
                  {asset.baselineBalance !== undefined && (
                    <div className="text-xs text-gray-500 mt-1">
                      Baseline: {asset.baselineBalance.toLocaleString('en-US', { 
                        minimumFractionDigits: asset.coin === 'BTC' ? 8 : 2,
                        maximumFractionDigits: asset.coin === 'BTC' ? 8 : 2 
                      })}
                      {aboveBaseline !== null && (
                        <span className={aboveBaseline >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {' '}({aboveBaseline >= 0 ? '+' : ''}{aboveBaseline.toFixed(2)})
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {asset.price && asset.value && (
                  <div className="text-right">
                    <div className="text-sm text-gray-600">
                      ${asset.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="font-semibold">
                      ${asset.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                )}
              </div>

              {/* BTC protection notice */}
              {asset.coin === 'BTC' && asset.baselineBalance && (
                <div className="mt-2 text-xs text-blue-600 border-t pt-2">
                  🛡️ Protected: Baseline BTC will never be sold or staked
                </div>
              )}

              {/* XRP baseline notice */}
              {asset.coin === 'XRP' && asset.baselineBalance && (
                <div className="mt-2 text-xs text-blue-600 border-t pt-2">
                  🛡️ Protected: {asset.baselineBalance} XRP baseline (grows with deposits)
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Baselines Info */}
      {portfolio.baselines && Object.keys(portfolio.baselines).length > 0 && (
        <section className="border rounded p-4 bg-blue-50">
          <h2 className="font-medium mb-2">🛡️ Protected Baselines</h2>
          <div className="text-sm space-y-1">
            <p>
              <strong>BTC:</strong> Never sell or stake below baseline (digital gold / collateral)
            </p>
            <p>
              <strong>XRP:</strong> Never sell below baseline (minimum 10, grows with deposits)
            </p>
            <p className="text-gray-600 mt-2">
              These baselines protect your core holdings. Only profit above baselines can be traded.
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
