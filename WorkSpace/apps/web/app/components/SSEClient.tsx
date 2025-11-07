"use client";
import { useEffect, useRef, useState } from 'react';
import { showToast } from './Toast';
import { getApiBase } from '../lib/api';

export function SSEClient() {
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const base = getApiBase();
    const url = `${base}/live`;
    const es = new EventSource(url, { withCredentials: false });
    esRef.current = es;

    const onMessage = (ev: MessageEvent) => {
      try {
        const evt = JSON.parse(ev.data);
        if (evt?.type === 'connected') {
          setConnected(true);
          showToast('success', 'Live updates connected', 'You will receive real-time alerts and approvals here.');
        } else if (evt?.type === 'approval:created') {
          const a = evt.data;
          showToast('info', 'New approval', `${a.title} • ${a.coin} ${a.amount}`);
        } else if (evt?.type === 'approval:updated') {
          const a = evt.data;
          showToast('success', 'Approval updated', `${a.id} → ${a.status}`);
        } else if (evt?.type === 'killswitch:changed') {
          const ks = evt.data;
          if (ks.enabled) {
            showToast('warning', 'Kill-switch enabled', ks.reason || 'Trading paused');
          } else {
            showToast('success', 'Kill-switch disabled', 'Trading may resume');
          }
        } else if (evt?.type === 'alert') {
          const al = evt.data;
          const severity = (al.severity || 'info') as 'info'|'success'|'warning'|'error';
          showToast(severity, `Alert: ${al.type}`, al.message || '');
        }
      } catch {}
    };

    es.addEventListener('message', onMessage);
    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.removeEventListener('message', onMessage);
      es.close();
      esRef.current = null;
    };
  }, []);

  return (
    <div className="fixed bottom-4 left-4 z-40 select-none">
      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${connected ? 'bg-green-600/20 text-green-300' : 'bg-red-600/20 text-red-300'}`}>
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
        Live updates {connected ? 'connected' : 'disconnected'}
      </span>
    </div>
  );
}
