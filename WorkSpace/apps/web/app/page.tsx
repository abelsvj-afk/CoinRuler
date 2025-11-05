'use client';
import { useEffect, useState } from 'react';

export default function Home() {
  const [status, setStatus] = useState<any>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    fetch(`${apiUrl}/status`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(console.error);
  }, [apiUrl]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-4xl font-bold mb-6">CoinRuler Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">API Status</h2>
          {status ? (
            <pre className="text-sm">{JSON.stringify(status, null, 2)}</pre>
          ) : (
            <p>Loading...</p>
          )}
        </div>
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Portfolio</h2>
          <p className="text-gray-400">Coming soon: live portfolio view</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Approvals</h2>
          <p className="text-gray-400">Coming soon: pending approvals</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Monte Carlo</h2>
          <p className="text-gray-400">Coming soon: risk projections</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">ML Insights</h2>
          <p className="text-gray-400">Coming soon: ML predictions</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Alerts</h2>
          <p className="text-gray-400">Coming soon: active alerts</p>
        </div>
      </div>
    </div>
  );
}
