import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Auth middleware: supports both Basic Auth (temporary) and Discord OAuth (preferred)
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // TEMPORARY: Allow all routes for testing
  // TODO: Re-enable auth after testing
  return NextResponse.next();

  // Allow public routes (login, OAuth callback, API routes)
  if (pathname.startsWith('/login') || pathname.startsWith('/auth/callback') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // Check for Discord session cookie (preferred)
  const discordUserId = req.cookies.get('discord_user_id')?.value;
  const OWNER_ID = process.env.OWNER_ID || '';
  
  if (discordUserId && OWNER_ID && discordUserId === OWNER_ID) {
    // Authenticated via Discord OAuth
    return NextResponse.next();
  }

  // Fallback to Basic Auth (for backward compatibility)
  const username = process.env.WEB_USERNAME || '';
  const password = process.env.WEB_PASSWORD || '';

  if (username && password) {
    const authHeader = req.headers.get('authorization') ?? '';
    if (authHeader.startsWith('Basic ')) {
      try {
        const b64 = authHeader.split(' ')[1] || '';
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const [user, pass] = decoded.split(':');
        if (user === username && pass === password) {
          return NextResponse.next();
        }
      } catch (_) {
        // fall through to redirect
      }
    }
  }

  // Not authenticated: redirect to login
  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
