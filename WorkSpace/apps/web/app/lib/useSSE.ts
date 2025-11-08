import { useEffect, useRef, useState } from 'react';

export interface SSEEvent {
  type: 'connected'
    | 'approval:created'
    | 'approval:updated'
    | 'killswitch:changed'
    | 'portfolio:updated'
    | 'alert'
    | 'trade:submitted'
    | 'trade:result';
  data?: any;
  ts?: string;
}

export function useSSE(url: string, onEvent: (event: SSEEvent) => void) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!url) return;

    let es: EventSource | null = null;

    const connect = () => {
      // Clear any existing connection
      if (es) {
        es.close();
      }

      es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
        setReconnectAttempt(0);
        console.log('[SSE] Connected to', url);
      };

      es.onerror = (err) => {
        setConnected(false);
        setError('SSE connection failed');
        console.error('[SSE] Error:', err);
        
        // Exponential backoff reconnect: 2s, 4s, 8s, 16s, max 30s
        const delay = Math.min(30000, 2000 * Math.pow(2, reconnectAttempt));
        console.log(`[SSE] Reconnecting in ${delay/1000}s...`);
        
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempt(prev => prev + 1);
          connect();
        }, delay);
      };

      es.onmessage = (e) => {
        try {
          const event: SSEEvent = JSON.parse(e.data);
          onEvent(event);
        } catch (err) {
          console.error('[SSE] Failed to parse event:', e.data);
        }
      };
    };

    connect();

    return () => {
      if (es) {
        es.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      console.log('[SSE] Disconnected');
    };
  }, [url, onEvent, reconnectAttempt]);

  return { connected, error };
}
