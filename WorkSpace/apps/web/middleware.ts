import { auth } from './auth';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnLoginPage = req.nextUrl.pathname.startsWith('/login');
  const isAuthCallback = req.nextUrl.pathname.startsWith('/auth/callback');
  const isApiRoute = req.nextUrl.pathname.startsWith('/api/auth');

  // Allow auth routes
  if (isAuthCallback || isApiRoute) {
    return;
  }

  // Redirect to login if not authenticated
  if (!isLoggedIn && !isOnLoginPage) {
    return Response.redirect(new URL('/login', req.nextUrl));
  }

  // Redirect to home if already logged in and on login page
  if (isLoggedIn && isOnLoginPage) {
    return Response.redirect(new URL('/', req.nextUrl));
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
