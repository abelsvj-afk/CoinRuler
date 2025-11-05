import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Basic Auth middleware to protect the entire app
// Configure WEB_USERNAME and WEB_PASSWORD in environment variables
export function middleware(req: NextRequest) {
  const username = process.env.WEB_USERNAME || '';
  const password = process.env.WEB_PASSWORD || '';

  // If not configured, allow access (dev convenience)
  if (!username || !password) {
    return NextResponse.next();
  }

  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const b64 = auth.split(' ')[1] || '';
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      const [user, pass] = decoded.split(':');
      if (user === username && pass === password) {
        return NextResponse.next();
      }
    } catch (_) {
      // fall through to challenge
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="CoinRuler"' },
  });
}

export const config = {
  matcher: '/:path*',
};
