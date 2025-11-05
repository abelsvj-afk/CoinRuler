"use client";
import { useEffect, useState, useCallback } from 'react';
import { getApiBase } from '../lib/api';
import { useSSE, type SSEEvent } from '../lib/useSSE';

interface Alert {
  id: string;
  type: 'whale' | 'volatility' | 'fraud' | 'sentiment' | 'economic';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  data?: any;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<'all' | 'whale' | 'volatility' | 'fraud'>('all');
  const api = getApiBase();

  // Handle SSE events
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (event.type === 'alert') {
      const alert: Alert = {
        id: `alert-${Date.now()}`,
        type: event.data.type,
        severity: event.data.severity || 'info',
        title: event.data.title || event.data.type,
        message: event.data.message,
        timestamp: event.data.timestamp || new Date().toISOString(),
        data: event.data,
      };
      
      setAlerts(prev => [alert, ...prev].slice(0, 50)); // Keep last 50 alerts

      // Play sound for critical alerts
      if (alert.severity === 'critical' && typeof Audio !== 'undefined') {
        new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUKnn77RgGwU7k9n0y3kpBSl+zPLaizsKElyx6+ypWBUIQ5zg8r1qIAU1hdDy24k5CBxrv/Hom0sMElCr6O+0YhoFOJPa88t6KAUrfczy2og7ChJcsevsqVgVCEOb4PK+aiAFNYXQ8tuJOQcca7/x6JtLDBJQq+jvtGIaBTiT2vPLeSgFK3zM8tqIOwsRW7Hs7KhYFQhDnODyvm0gBTWE0PLbiTkHHWy/8eibSwwSUKvo77RhGgU4ktrzyn0oBSt8zPLaiDoLEFqw7OyoVxYJQ53g8r5tIQU1hdDy2og6Bxttv/Hom0wMElCr5+60YhoGPJPa88p9KQUqfM3y2oo6ChBbr+zrqFYXCEKb3/K+bSIFNYXQ8dmJOgcdbb/x6ZxMDBFPque/tGEaBj2T2vPKfSgGKXzN8tqKOgoQW6/s66hWFwhCm+DyvmwhBTSE0fHZijkIHWy/8eidTAwRUKvnv7RiGQY9k9n0yn0pBSl9zfLbijkKD1uw7OuoVRcIQpzg8r1sIQU0hNDy2Yo5CB1sv/LonUsMEVCq6L60YhkGPZPZ88p+KQUpfc3y24o5Cg9bsOzrqFUXCEKc4PK9bCAFNIPR8dmKOQgdbL/y6J1LDBFQO').play().catch(() => {});
      }
    }
  }, []);

  useSSE(`${api}/live`, handleSSEEvent);

  const filteredAlerts = filter === 'all' 
    ? alerts 
    : alerts.filter(a => a.type === filter);

  const severityColors = {
    info: 'border-blue-500 bg-blue-50',
    warning: 'border-yellow-500 bg-yellow-50',
    critical: 'border-red-500 bg-red-50',
  };

  const typeIcons = {
    whale: '🐋',
    volatility: '📊',
    fraud: '⚠️',
    sentiment: '💬',
    economic: '📈',
  };

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Live Alerts Feed</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('whale')}
            className={`px-3 py-1 rounded ${filter === 'whale' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            Whale
          </button>
          <button
            onClick={() => setFilter('volatility')}
            className={`px-3 py-1 rounded ${filter === 'volatility' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            Volatility
          </button>
          <button
            onClick={() => setFilter('fraud')}
            className={`px-3 py-1 rounded ${filter === 'fraud' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            Fraud
          </button>
        </div>
      </div>

      <div className="text-sm text-gray-600">
        Total alerts: {alerts.length} | Showing: {filteredAlerts.length}
      </div>

      {filteredAlerts.length === 0 && (
        <div className="border rounded p-8 text-center text-gray-500">
          No alerts yet. Live updates will appear here automatically.
        </div>
      )}

      <div className="space-y-3">
        {filteredAlerts.map(alert => (
          <div
            key={alert.id}
            className={`border-l-4 rounded p-4 ${severityColors[alert.severity]} transition-all hover:shadow-lg`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{typeIcons[alert.type]}</span>
                <div>
                  <div className="font-semibold">{alert.title}</div>
                  <div className="text-sm mt-1">{alert.message}</div>
                  {alert.data && (
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-gray-600">View details</summary>
                      <pre className="mt-2 p-2 bg-white rounded overflow-x-auto">
                        {JSON.stringify(alert.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
              <div className="text-xs text-gray-500 whitespace-nowrap ml-4">
                {new Date(alert.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
