"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getApiBase } from '../lib/api';

export default function DashboardPage() {
  const [health, setHealth] = useState<any>({ ok: false, db: 'unknown' });
  const [status, setStatus] = useState<any>({ status: 'loading', ts: new Date().toISOString() });
  const [dashboard, setDashboard] = useState<any>({ killSwitch: { enabled: false, reason: '' }, approvals: [] });
  const [loading, setLoading] = useState(true);
  const api = getApiBase();

  async function load() {
    try {
      const [h, s, d] = await Promise.all([
        fetch(`${api}/health`).then(r => r.json()),
        fetch(`${api}/status`).then(r => r.json()),
        fetch(`${api}/dashboard`).then(r => r.json()),
      ]);
      setHealth(h);
      setStatus(s);
      setDashboard(d);
    } finally {
      setLoading(false);
    }
  }

  async function panic() {
    await fetch(`${api}/kill-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, reason: 'Panic from web', setBy: 'web-dashboard' }),
    });
    await load();
  }

  async function resume() {
    await fetch(`${api}/kill-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, reason: 'Resume from web', setBy: 'web-dashboard' }),
    });
    await load();
  }

  useEffect(() => { load(); }, []);

  const ks = dashboard.killSwitch || { enabled: false, reason: '' };
  const approvals = dashboard.approvals || [];

  if (loading) return <main className="max-w-3xl mx-auto p-6">Loading...</main>;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">CoinRuler Dashboard</h1>

      <section className="border rounded p-4">
        <h2 className="font-medium mb-2">System</h2>
        <div className="grid grid-cols-2 gap-2">
          <div>API</div>
          <div className={health.ok ? 'text-green-600' : 'text-red-600'}>{health.ok ? 'OK' : 'DOWN'}</div>
          <div>DB</div>
          <div>{health.db}</div>
          <div>Status</div>
          <div>{status.status} @ {new Date(status.ts).toLocaleString()}</div>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="font-medium mb-2">Kill Switch</h2>
        <div className="flex items-center gap-3">
          <span className={ks.enabled ? 'text-red-600 font-bold' : 'text-green-600'}>
            {ks.enabled ? '🚨 ENABLED' : '✅ DISABLED'}
          </span>
          {ks.reason && <span className="text-gray-500">({ks.reason})</span>}
        </div>
        <div className="mt-3 flex gap-2">
          <button className="px-3 py-1 rounded bg-red-600 text-white disabled:opacity-50" onClick={panic} disabled={ks.enabled}>
            Panic
          </button>
          <button className="px-3 py-1 rounded bg-green-600 text-white disabled:opacity-50" onClick={resume} disabled={!ks.enabled}>
            Resume
          </button>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="font-medium mb-2">Approvals</h2>
        <div>Pending: {approvals.length}</div>
        <ul className="list-disc ml-6 mt-2">
          {approvals.map((a: any) => (
            <li key={a._id}>[{a._id}] {a.title} - {a.coin} {a.amount}</li>
          ))}
        </ul>
        <div className="mt-3">
          <Link className="underline" href="/approvals">Go to Approvals →</Link>
        </div>
      </section>

      <section className="border rounded p-4">
        <h2 className="font-medium mb-2">Credential Rotation</h2>
        <div className="mt-1">
          <Link className="underline" href="/rotation">Rotation Status & Actions →</Link>
        </div>
      </section>
    </main>
  );
}
