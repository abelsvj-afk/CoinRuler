import Link from 'next/link';
import { apiGet } from '../lib/api';

export const dynamic = 'force-dynamic';

async function getData() {
  const [health, status, dashboard] = await Promise.all([
    apiGet('/health'),
    apiGet('/status'),
    apiGet('/dashboard'),
  ]);
  return { health, status, dashboard };
}

export default async function DashboardPage() {
  const { health, status, dashboard } = await getData();
  const ks = dashboard.killSwitch || { enabled: false, reason: '' };
  const approvals = dashboard.approvals || [];

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
        <div className="flex items-center gap-2">
          <span className={ks.enabled ? 'text-red-600' : 'text-green-600'}>
            {ks.enabled ? 'ENABLED' : 'DISABLED'}
          </span>
          {ks.reason && <span className="text-gray-500">({ks.reason})</span>}
        </div>
        <div className="mt-2 text-sm text-gray-600">Use actions on Approvals/Rotation pages to change state.</div>
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
