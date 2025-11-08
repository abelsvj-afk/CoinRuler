"use client";

import { useEffect, useState } from 'react';
import { getApiBase } from '../lib/api';
import { Button } from '@/components/ui/Button';

interface CheckResult {
  path: string;
  ok: boolean;
  status: number | null;
  timeMs: number | null;
  error?: string;
  sample?: any;
}

const ENDPOINTS = [
  '/health',
  '/dashboard',
  '/portfolio/current',
  '/approvals/pending',
  '/version'
];

export default function DebugPage() {
  const [apiBase, setApiBase] = useState<string>(() => getApiBase());
  const [overrideInput, setOverrideInput] = useState('');
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [sseStatus, setSseStatus] = useState<'idle' | 'open' | 'error' | 'message'>('idle');
  const [sseMessages, setSseMessages] = useState<number>(0);

  // Run tests
  const runChecks = async () => {
    setRunning(true);
    const out: CheckResult[] = [];
    for (const path of ENDPOINTS) {
      const start = performance.now();
      try {
        const res = await fetch(apiBase + path, { cache: 'no-store' });
        const timeMs = performance.now() - start;
        let sample: any = null;
        try { sample = await res.json(); } catch {}
        out.push({ path, ok: res.ok, status: res.status, timeMs: Math.round(timeMs), sample });
      } catch (e: any) {
        const timeMs = performance.now() - start;
        out.push({ path, ok: false, status: null, timeMs: Math.round(timeMs), error: e.message });
      }
    }
    setResults(out);
    setRunning(false);
  };

  // SSE test
  const testSSE = () => {
    setSseStatus('idle');
    setSseMessages(0);
    try {
      const es = new EventSource(apiBase + '/live');
      es.onopen = () => setSseStatus('open');
      es.onmessage = () => {
        setSseStatus('message');
        setSseMessages(m => m + 1);
      };
      es.onerror = () => {
        setSseStatus('error');
        es.close();
      };
      setTimeout(() => es.close(), 15000); // auto close after 15s
    } catch {
      setSseStatus('error');
    }
  };

  useEffect(() => { runChecks(); }, [apiBase]);

  const applyOverride = () => {
    if (!overrideInput.startsWith('http')) return;
    const cleaned = overrideInput.replace(/\/$/, '');
    localStorage.setItem('override_api_base', cleaned);
    setApiBase(cleaned);
    runChecks();
  };

  const clearOverride = () => {
    localStorage.removeItem('override_api_base');
    window.location.reload();
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'server';

  return (
    <div className="min-h-screen p-8 space-y-8">
      <h1 className="text-3xl font-bold mb-2">API Diagnostics</h1>
      <p className="text-white/60 text-sm">Live connectivity checks to help debug production issues (CORS, env, network). This page does no mutations.</p>

      <div className="glass-strong rounded-xl p-4 space-y-3">
        <div className="text-xs text-white/40">Resolved API Base</div>
        <code className="text-sm bg-black/40 px-2 py-1 rounded inline-block break-all">{apiBase}</code>
        <div className="text-xs text-white/40">Web Origin</div>
        <code className="text-xs bg-black/30 px-2 py-1 rounded inline-block">{origin}</code>
        <div className="flex gap-2 mt-2 flex-wrap">
          <input
            placeholder="https://your-api-url"
            value={overrideInput}
            onChange={e => setOverrideInput(e.target.value)}
            className="rounded px-3 py-2 text-sm bg-black/30 border border-white/10 focus:outline-none focus:border-[#FFB800] flex-1"
          />
          <Button variant="primary" onClick={applyOverride} disabled={!overrideInput.startsWith('http')}>Override</Button>
          {typeof window !== 'undefined' && localStorage.getItem('override_api_base') && (
            <Button variant="ghost" onClick={clearOverride}>Clear Override</Button>
          )}
          <Button variant="secondary" onClick={runChecks} disabled={running}>{running ? 'Testing...' : 'Retest'}</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-4">
          <h2 className="font-semibold mb-3">Endpoint Checks</h2>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {results.map(r => (
              <div key={r.path} className={`rounded border px-3 py-2 text-xs space-y-1 ${r.ok ? 'border-green-600 bg-green-900/20' : 'border-red-600 bg-red-900/20'}`}> 
                <div className="flex justify-between">
                  <span>{r.path}</span>
                  <span>{r.ok ? 'OK' : 'FAIL'}{r.status ? ` (${r.status})` : ''}</span>
                </div>
                <div className="flex justify-between text-white/50">
                  <span>{r.timeMs !== null ? r.timeMs + 'ms' : ''}</span>
                  {!r.ok && r.error && <span className="text-red-300 truncate max-w-[160px]" title={r.error}>{r.error}</span>}
                </div>
                {r.ok && r.sample && r.path === '/health' && (
                  <div className="text-white/40">DB: {r.sample.db} DryRun: {String(r.sample.dryRun)}</div>
                )}
              </div>
            ))}
            {results.length === 0 && <div className="text-white/40 text-xs">No results yet</div>}
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <h2 className="font-semibold mb-3">SSE /live Test</h2>
          <div className="text-sm mb-2">Status: <span className={
            sseStatus === 'open' ? 'text-green-400' : sseStatus === 'message' ? 'text-[#FFB800]' : sseStatus === 'error' ? 'text-red-400' : 'text-white/50'
          }>{sseStatus}</span></div>
          <div className="text-xs text-white/40 mb-3">Messages received: {sseMessages}</div>
          <Button variant="secondary" onClick={testSSE}>Start SSE Probe (15s)</Button>
          <p className="text-[10px] text-white/30 mt-3">If this fails with CORS, ensure your API has WEB_ORIGIN including this Vercel domain and wildcard <code>https://*.vercel.app</code>.</p>
        </div>
      </div>

      <div className="glass rounded-xl p-4 text-xs text-white/50 space-y-2">
        <div className="font-semibold text-white">Troubleshooting Hints</div>
        <ul className="list-disc ml-4 space-y-1">
          <li><b>CORS blocked</b>: Add exact Vercel URL & wildcard to API `WEB_ORIGIN` env.</li>
          <li><b>All endpoints FAIL</b>: Wrong base URL or API not deployed.</li>
          <li><b>/health ok, others fail</b>: Partial deploy or DB dependency not ready.</li>
          <li><b>SSE fails but endpoints work</b>: Proxy/web middleware interfering; check Vercel headers.</li>
        </ul>
      </div>
    </div>
  );
}
