"use client";
import { useEffect, useState } from 'react';
import { getApiBase } from '../lib/api';
import { BackBar } from '../components/BackBar';

type Approval = { _id: string; title: string; coin?: string; amount?: number };

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const api = getApiBase();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${api}/approvals`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load approvals');
      const data = await res.json();
      setItems(data || []);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function act(id: string, status: 'approved' | 'declined') {
    try {
      const res = await fetch(`${api}/approvals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actedBy: 'web-dashboard' }),
      });
      if (!res.ok) throw new Error('Action failed');
      await load();
    } catch (e: any) {
      alert(e.message || 'Action error');
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <BackBar title="Approvals" />
      <button className="underline" onClick={load} disabled={loading}>Refresh</button>
      {loading && <div>Loading…</div>}
      {error && <div className="text-red-600">{error}</div>}
      {!loading && items.length === 0 && <div>No pending approvals.</div>}
      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a._id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">[{a._id}] {a.title}</div>
              <div className="text-sm text-gray-600">{a.coin} {a.amount}</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={() => act(a._id, 'approved')}>Approve</button>
              <button className="px-3 py-1 rounded bg-red-600 text-white" onClick={() => act(a._id, 'declined')}>Decline</button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
