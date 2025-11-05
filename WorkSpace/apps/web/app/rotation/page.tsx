"use client";
import { useEffect, useState } from 'react';
import { getApiBase } from '../lib/api';

type RotationItem = { service: string; enabled: boolean; lastRotation?: string; isDue?: boolean };

export default function RotationPage() {
  const [items, setItems] = useState<RotationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const api = getApiBase();

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${api}/rotation/status`, { cache: 'no-store' });
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  async function rotate(service: string) {
    setMessage(null);
    const res = await fetch(`${api}/rotation/rotate/${service}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setMessage(`Rotated ${service}. New Key: ${data.newKeyId}`);
    } else {
      setMessage(`Rotation failed for ${service}: ${data.error || 'Unknown error'}`);
    }
    await load();
  }

  async function check() {
    setMessage(null);
    await fetch(`${api}/rotation/scheduler/check`, { method: 'POST' });
    setMessage('Rotation check triggered.');
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Credential Rotation</h1>
      <div className="flex items-center gap-3">
        <button className="underline" onClick={load} disabled={loading}>Refresh</button>
        <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={check}>Run Rotation Check</button>
      </div>
      {message && <div className="text-sm text-gray-700">{message}</div>}
      {loading && <div>Loading…</div>}
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.service} className="border rounded p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{it.service}</div>
              <div className="text-sm text-gray-600">
                {it.enabled ? 'Enabled' : 'Disabled'} · Last: {it.lastRotation ? new Date(it.lastRotation).toLocaleString() : 'Never'} · Due: {it.isDue ? 'YES' : 'No'}
              </div>
            </div>
            <div>
              <button className="px-3 py-1 rounded bg-green-600 text-white" onClick={() => rotate(it.service)}>Rotate</button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
