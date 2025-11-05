"use client";
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function CallbackContent() {
  const [status, setStatus] = useState('Verifying...');
  const [error, setError] = useState('');
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError('Authorization failed. Please try again.');
      setStatus('Error');
      return;
    }

    if (!code) {
      setError('No authorization code received.');
      setStatus('Error');
      return;
    }

    // Exchange code for token and verify owner
    fetch('/api/auth/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStatus('Success! Redirecting...');
          setTimeout(() => router.push('/dashboard'), 1000);
        } else {
          setError(data.error || 'Access denied. You are not the authorized owner.');
          setStatus('Error');
        }
      })
      .catch(err => {
        setError('Failed to verify authorization: ' + err.message);
        setStatus('Error');
      });
  }, [searchParams, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full text-center">
        <h1 className="text-2xl font-bold mb-4">{status}</h1>
        
        {status === 'Verifying...' && (
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        )}

        {status === 'Success! Redirecting...' && (
          <div className="text-green-600 text-4xl mb-2">✓</div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
            <div className="mt-3">
              <a href="/login" className="underline">Try again</a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">Loading...</h1>
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        </div>
      </main>
    }>
      <CallbackContent />
    </Suspense>
  );
}
