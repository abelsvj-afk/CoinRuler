import { NextRequest } from 'next/server';

// Server-side proxy to Railway API to bypass CORS in the browser.
// Usage from client: fetch('/api/ruler/health') => forwards to `${API_BASE}/health`.
// API base resolution (server): prefers process.env.API_BASE or NEXT_PUBLIC_API_BASE.
function getApiBase(): string {
  const base = process.env.API_BASE || process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE_URL;
  if (!base) {
    // As a last resort, try Vercel env var style
    throw new Error('API base URL is not configured (set API_BASE or NEXT_PUBLIC_API_BASE)');
  }
  return base.replace(/\/$/, '');
}

async function forward(req: NextRequest, params: Promise<{ path: string[] }>) {
  const apiBase = getApiBase();
  const resolvedParams = await params;
  const path = resolvedParams.path?.join('/') || '';
  const targetUrl = `${apiBase}/${path}`;

  // Build init
  const init: RequestInit = {
    method: req.method,
    // Pass through body for non-GET/HEAD
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text(),
    // Copy headers except host and connection specific
    headers: new Headers(
      Array.from(req.headers.entries()).filter(([k]) => !['host', 'connection', 'content-length'].includes(k.toLowerCase()))
    ),
    // Enable streaming if the target uses SSE
    // (Response is returned with the original body stream below)
  };

  const res = await fetch(targetUrl, init);

  // Relay response headers, including for SSE
  const headers = new Headers(res.headers);
  // Ensure CORS back to our own origin is allowed for this proxy path
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export const GET = async (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => forward(req, params);
export const POST = async (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => forward(req, params);
export const PUT = async (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => forward(req, params);
export const PATCH = async (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => forward(req, params);
export const DELETE = async (req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => forward(req, params);
