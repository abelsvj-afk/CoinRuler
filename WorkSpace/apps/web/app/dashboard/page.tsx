"use client";
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { getApiBase } from '../lib/api';
import { useSSE, type SSEEvent } from '../lib/useSSE';
import { showToast } from '../components/Toast';
import { 
  requestNotificationPermission, 
  notifyApprovalCreated, 
  notifyCriticalAlert, 
  notifyKillSwitchChanged,
  getNotificationPermissionStatus 
} from '../lib/notifications';

export default function DashboardPage() {
  const [health, setHealth] = useState<any>({ ok: false, db: 'unknown' });
  const [status, setStatus] = useState<any>({ status: 'loading', ts: new Date().toISOString() });
  const [dashboard, setDashboard] = useState<any>({ killSwitch: { enabled: false, reason: '' }, approvals: [] });
  const [loading, setLoading] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
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
    // SSE will update the UI automatically
  }

  async function resume() {
    await fetch(`${api}/kill-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, reason: 'Resume from web', setBy: 'web-dashboard' }),
    });
    // SSE will update the UI automatically
  }

  // Handle SSE events
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    console.log('[Dashboard] SSE Event:', event);

    switch (event.type) {
      case 'connected':
        setSseConnected(true);
        showToast('success', 'Live Updates', 'Connected to real-time feed');
        break;

      case 'approval:created':
        showToast('warning', 'New Approval', `Trade requires your approval: ${event.data.title}`);
        // Play sound for critical approval
        if (typeof Audio !== 'undefined') {
          new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUKnn77RgGwU7k9n0y3kpBSl+zPLaizsKElyx6+ypWBUIQ5zg8r1qIAU1hdDy24k5CBxrv/Hom0sMElCr6O+0YhoFOJPa88t6KAUrfczy2og7ChJcsevsqVgVCEOb4PK+aiAFNYXQ8tuJOQcca7/x6JtLDBJQq+jvtGIaBTiT2vPLeSgFK3zM8tqIOwsRW7Hs7KhYFQhDnODyvm0gBTWE0PLbiTkHHWy/8eibSwwSUKvo77RhGgU4ktrzyn0oBSt8zPLaiDoLEFqw7OyoVxYJQ53g8r5tIQU1hdDy2og6Bxttv/Hom0wMElCr5+60YhoGPJPa88p9KQUqfM3y2oo6ChBbr+zrqFYXCEKb3/K+bSIFNYXQ8dmJOgcdbb/x6ZxMDBFPque/tGEaBj2T2vPKfSgGKXzN8tqKOgoQW6/s66hWFwhCm+DyvmwhBTSE0fHZijkIHWy/8eidTAwRUKvnv7RiGQY9k9n0yn0pBSl9zfLbijkKD1uw7OuoVRcIQpzg8r1sIQU0hNDy2Yo5CB1sv/LonUsMEVCq6L60YhkGPZPZ88p+KQUpfc3y24o5Cg9bsOzrqFUXCEKc4PK9bCAFNIPR8dmKOQgdbL/y6J1LDBFQO'); // Beep sound
        }
        load(); // Refresh approvals list
        break;

      case 'approval:updated':
        showToast('info', 'Approval Updated', `Trade ${event.data.status}: ${event.data.id}`);
        load(); // Refresh approvals list
        break;

      case 'killswitch:changed':
        const ks = event.data;
        setDashboard((prev: any) => ({ ...prev, killSwitch: ks }));
        showToast(
          ks.enabled ? 'error' : 'success',
          ks.enabled ? '🚨 Kill Switch Activated' : '✅ Trading Resumed',
          ks.reason || ''
        );
        notifyKillSwitchChanged(ks.enabled, ks.reason);
        break;

      case 'portfolio:updated':
        showToast('info', 'Portfolio Updated', 'Your balances have changed');
        load(); // Refresh portfolio data
        break;

      case 'alert':
        const alertType = event.data.severity === 'critical' ? 'error' : 'warning';
        showToast(alertType, `🔔 ${event.data.type} Alert`, event.data.message);
        if (event.data.severity === 'critical') {
          notifyCriticalAlert(event.data);
          // Play sound for critical alerts
          if (typeof Audio !== 'undefined') {
            new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUKnn77RgGwU7k9n0y3kpBSl+zPLaizsKElyx6+ypWBUIQ5zg8r1qIAU1hdDy24k5CBxrv/Hom0sMElCr6O+0YhoFOJPa88t6KAUrfszy2og7ChJcsevsqVgVCEOb4PK+aiAFNYXQ8tuJOQcca7/x6JtLDBJQq+jvtGIaBTiT2vPLeSgFK3zM8tqIOwsRW7Hs7KhYFQhDnODyvm0gBTWE0PLbiTkHHWy/8eibSwwSUKvo77RhGgU4ktrzyn0oBSt8zPLaiDoLEFqw7OyoVxYJQ53g8r5tIQU1hdDy2og6Bxttv/Hom0wMElCr5+60YhoGPJPa88p9KQUqfM3y2oo6ChBbr+zrqFYXCEKb3/K+bSIFNYXQ8dmJOgcdbb/x6ZxMDBFPque/tGEaBj2T2vPKfSgGKXzN8tqKOgoQW6/s66hWFwhCm+DyvmwhBTSE0fHZijkIHWy/8eidTAwRUKvnv7RiGQY9k9n0yn0pBSl9zfLbijkKD1uw7OuoVRcIQpzg8r1sIQU0hNDy2Yo5CB1sv/LonUsMEVCq6L60YhkGPZPZ88p+KQUpfc3y24o5Cg9bsOzrqFUXCEKc4PK9bCAFNIPR8dmKOQgdbL/y6J1LDBFQO').play().catch(() => {});
          }
        }
        break;
    }
  }, [api]);

  // Connect to SSE
  const { connected, error } = useSSE(`${api}/live`, handleSSEEvent);

  async function enableNotifications() {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    if (granted) {
      showToast('success', 'Notifications Enabled', 'You will receive desktop alerts for important events');
    } else {
      showToast('error', 'Notifications Blocked', 'Please enable notifications in your browser settings');
    }
  }

  useEffect(() => { 
    load();
    // Check notification permission on mount
    setNotificationsEnabled(getNotificationPermissionStatus() === 'granted');
  }, []);

  const ks = dashboard.killSwitch || { enabled: false, reason: '' };
  const approvals = dashboard.approvals || [];

  if (loading) return <main className="max-w-3xl mx-auto p-6">Loading...</main>;

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CoinRuler Dashboard</h1>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
          <span className="text-sm text-gray-600">
            {connected ? 'Live' : error || 'Connecting...'}
          </span>
        </div>
      </div>

      <section className="border rounded p-4">
        <h2 className="font-medium mb-2">System</h2>
        <div className="grid grid-cols-2 gap-2">
          <div>API</div>
          <div className={health.ok ? 'text-green-600' : 'text-red-600'}>{health.ok ? 'OK' : 'DOWN'}</div>
          <div>DB</div>
          <div>{health.db}</div>
          <div>Status</div>
          <div>{status.status} @ {new Date(status.ts).toLocaleString()}</div>
          <div>Live Updates</div>
          <div className={connected ? 'text-green-600' : 'text-yellow-600'}>
            {connected ? '✅ Connected' : '⏳ Connecting...'}
          </div>
          <div>Desktop Notifications</div>
          <div className="flex items-center gap-2">
            {notificationsEnabled ? (
              <span className="text-green-600">✅ Enabled</span>
            ) : (
              <button
                onClick={enableNotifications}
                className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Enable Notifications
              </button>
            )}
          </div>
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
