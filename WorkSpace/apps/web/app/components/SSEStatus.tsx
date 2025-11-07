"use client";

import { useEffect, useState } from 'react';
import { getApiBase } from '../lib/api';

export function SSEStatus() {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiBase = getApiBase();

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      try {
        es = new EventSource(`${apiBase}/live`);
        
        es.onopen = () => {
          setConnected(true);
          setError(null);
          console.log('[SSEStatus] Connected to live updates');
        };

        es.onerror = (err) => {
          console.error('[SSEStatus] Connection error:', err);
          setConnected(false);
          setError('Connection lost');
          
          // Auto-reconnect after 5 seconds
          reconnectTimeout = setTimeout(() => {
            console.log('[SSEStatus] Attempting to reconnect...');
            connect();
          }, 5000);
        };

        es.onmessage = (e) => {
          try {
            const event = JSON.parse(e.data);
            if (event.type === 'connected') {
              setConnected(true);
              setError(null);
            }
          } catch (err) {
            console.error('[SSEStatus] Failed to parse event:', e.data);
          }
        };
      } catch (err: any) {
        console.error('[SSEStatus] Failed to create EventSource:', err);
        setError(err.message);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (es) {
        es.close();
        console.log('[SSEStatus] Disconnected from live updates');
      }
    };
  }, [apiBase]);

  return (
    <div className="glass rounded-lg px-3 py-2 flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : error ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'}`} />
      <span className="text-sm">
        Live: {connected ? '✅ Connected' : error ? '❌ Disconnected' : '⏳ Connecting...'}
      </span>
    </div>
  );
}
