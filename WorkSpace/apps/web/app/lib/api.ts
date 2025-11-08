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
  // Support multiple legacy / variant variable names (some examples in .env.local.example)
  const envBase =
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_BASE ||
    process.env.API_BASE_URL;
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
  const directUrl = `${getApiBase()}${path}`;
  try {
    const res = await fetch(directUrl, { ...init, cache: 'no-store' });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
  } catch (err) {
    // Fallback to server-side proxy on direct fetch failure (CORS/network)
    console.warn(`Direct fetch failed for ${path}, trying proxy...`, err);
    const proxyUrl = `/api/ruler${path}`;
    const proxyRes = await fetch(proxyUrl, { ...init, cache: 'no-store' });
    if (!proxyRes.ok) throw new Error(`Proxy GET ${path} failed: ${proxyRes.status}`);
    return proxyRes.json();
  }
}

export async function apiPost(path: string, body?: any, init?: RequestInit) {
  const directUrl = `${getApiBase()}${path}`;
  try {
    const res = await fetch(directUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return res.json();
  } catch (err) {
    console.warn(`Direct POST failed for ${path}, trying proxy...`, err);
    const proxyUrl = `/api/ruler${path}`;
    const proxyRes = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!proxyRes.ok) throw new Error(`Proxy POST ${path} failed: ${proxyRes.status}`);
    return proxyRes.json();
  }
}

export async function apiPatch(path: string, body?: any, init?: RequestInit) {
  const directUrl = `${getApiBase()}${path}`;
  try {
    const res = await fetch(directUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
    return res.json();
  } catch (err) {
    console.warn(`Direct PATCH failed for ${path}, trying proxy...`, err);
    const proxyUrl = `/api/ruler${path}`;
    const proxyRes = await fetch(proxyUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!proxyRes.ok) throw new Error(`Proxy PATCH ${path} failed: ${proxyRes.status}`);
    return proxyRes.json();
  }
}
