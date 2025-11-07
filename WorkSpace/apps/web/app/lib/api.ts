let cachedBase: string | null = null;
export function getApiBase() {
  if (cachedBase) return cachedBase;
  // Runtime detection order:
  // 1. Explicit override in localStorage (interactive recovery)
  // 2. NEXT_PUBLIC_API_BASE injected at build/deploy
  // 3. Vercel system env for same-project API (if using rewrites)
  // 4. Fallback guess: production Railway URL heuristic (coinruler-production) or localhost
  try {
    if (typeof window !== 'undefined') {
      const override = localStorage.getItem('override_api_base');
      if (override && /^https?:\/\//i.test(override)) {
        cachedBase = override.replace(/\/$/, '');
        return cachedBase;
      }
    }
  } catch {}
  const envBase = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || process.env.API_BASE_URL;
  if (envBase) {
    cachedBase = envBase.replace(/\/$/, '');
    return cachedBase;
  }
  // If running on mycoinruler.xyz and no env provided, derive probable API
  if (typeof window !== 'undefined' && window.location.hostname.endsWith('mycoinruler.xyz')) {
    // Prefer explicit subdomain api. if future custom domain
    cachedBase = 'https://coinruler-production.up.railway.app';
    return cachedBase;
  }
  cachedBase = 'http://localhost:3001';
  return cachedBase;
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
