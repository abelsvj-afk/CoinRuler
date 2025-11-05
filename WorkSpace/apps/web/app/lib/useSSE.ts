import { useEffect, useRef, useState } from 'react';

export interface SSEEvent {
  type: 'connected' | 'approval:created' | 'approval:updated' | 'killswitch:changed' | 'portfolio:updated' | 'alert';
  data?: any;
  ts?: string;
}

export function useSSE(url: string, onEvent: (event: SSEEvent) => void) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
      console.log('[SSE] Connected to', url);
    };

    es.onerror = (err) => {
      setConnected(false);
      setError('SSE connection failed');
      console.error('[SSE] Error:', err);
    };

    es.onmessage = (e) => {
      try {
        const event: SSEEvent = JSON.parse(e.data);
        onEvent(event);
      } catch (err) {
        console.error('[SSE] Failed to parse event:', e.data);
      }
    };

    return () => {
      es.close();
      console.log('[SSE] Disconnected');
    };
  }, [url, onEvent]);

  return { connected, error };
}
