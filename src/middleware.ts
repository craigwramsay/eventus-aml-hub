/**
 * Auth Middleware
 *
 * - Protects all routes except public routes
 * - Enforces idle session timeout (30 minutes)
 * - Enforces MFA (AAL2) for authenticated users
 * - Unauthenticated users are redirected to /login
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/auth/callback', '/set-password', '/invite/accept'];

// Routes that need auth but not MFA (MFA flow itself)
const MFA_EXEMPT_ROUTES = ['/mfa/setup', '/mfa/verify'];

// Session idle timeout: 30 minutes (regulated environment)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const ACTIVITY_COOKIE = 'aml_last_activity';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Create response to pass cookies
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if needed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect to login if not authenticated
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Check idle session timeout
  const lastActivity = request.cookies.get(ACTIVITY_COOKIE)?.value;
  const now = Date.now();

  if (lastActivity) {
    const elapsed = now - parseInt(lastActivity, 10);
    if (elapsed > SESSION_TIMEOUT_MS) {
      // Session timed out — sign out and redirect
      await supabase.auth.signOut();
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('reason', 'timeout');
      const redirectResponse = NextResponse.redirect(loginUrl);
      redirectResponse.cookies.delete(ACTIVITY_COOKIE);
      return redirectResponse;
    }
  }

  // Update last activity timestamp
  response.cookies.set(ACTIVITY_COOKIE, now.toString(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TIMEOUT_MS / 1000,
  });

  // Check MFA assurance level (skip for MFA setup/verify routes)
  if (!MFA_EXEMPT_ROUTES.some((route) => pathname.startsWith(route))) {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    // If user has MFA enrolled but hasn't verified this session, redirect to verify
    if (aalData && aalData.currentLevel !== 'aal2') {
      // Check if user actually has MFA factors enrolled
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const totpFactors = factorsData?.all?.filter(
        (f) => f.factor_type === 'totp' && f.status === 'verified'
      );
      if (totpFactors && totpFactors.length > 0) {
        const mfaUrl = new URL('/mfa/verify', request.url);
        return NextResponse.redirect(mfaUrl);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
