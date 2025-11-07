import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from './auth';

// Public routes that should never be gated by auth
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/auth/callback',
  '/api/auth',
  '/api/test-env',
  '/favicon.ico',
  '/_next',
];

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public paths
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // If NEXTAUTH_SECRET is not set, fail-open so the site is viewable
  if (!process.env.NEXTAUTH_SECRET) {
    return NextResponse.next();
  }

  // Otherwise, enforce auth using NextAuth middleware wrapper
  return auth((r) => {
    const isLoggedIn = !!r.auth;
    const isOnLoginPage = r.nextUrl.pathname.startsWith('/login');

    if (!isLoggedIn && !isOnLoginPage) {
      return NextResponse.redirect(new URL('/login', r.nextUrl));
    }
    if (isLoggedIn && isOnLoginPage) {
      return NextResponse.redirect(new URL('/', r.nextUrl));
    }
    return NextResponse.next();
  })(req as any);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
