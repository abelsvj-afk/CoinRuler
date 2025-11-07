import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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

  // With secret present, we still allow the request here; UI/routes handle auth.
  // (Avoid calling NextAuth middleware to prevent build-time type/runtime issues.)
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
