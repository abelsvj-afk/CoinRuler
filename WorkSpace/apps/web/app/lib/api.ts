export function getApiBase() {
  // Prefer server-side env var; fallback to public or local dev
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem('override_api_base');
    if (override && override.startsWith('http')) {
      return override.replace(/\/$/, '');
    }
  }
  const base = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3001';
  return base.replace(/\/$/, '');
}

export async function apiGet(path: string, init?: RequestInit) {
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, { ...init, cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPost(path: string, body?: any, init?: RequestInit) {
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

export async function apiPatch(path: string, body?: any, init?: RequestInit) {
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return res.json();
}
