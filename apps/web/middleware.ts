import { errors, jwtVerify, JWTPayload } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

const ACCESS_TOKEN_COOKIE  = 'sb-access-token';
const REFRESH_TOKEN_COOKIE = 'sb-refresh-token';

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const accessToken  = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  // Fully unauthenticated — redirect before rendering anything
  if (!accessToken && !refreshToken) {
    const dest = pathname.startsWith('/admin') ? '/admin/login' : '/login';
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Admin routes need a role claim — verify JWT when we have one
  if (pathname.startsWith('/admin') && accessToken) {
    try {
      const secret  = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET ?? '');
      const { payload } = await jwtVerify(accessToken, secret, { algorithms: ['HS256'] });
      const role = readStaffRole(payload);

      if (!role) {
        return NextResponse.redirect(new URL('/forbidden', request.url));
      }
      if (pathname.startsWith('/admin/platform') && role !== 'owner') {
        return NextResponse.redirect(new URL('/forbidden', request.url));
      }
    } catch (err) {
      if (err instanceof errors.JWTExpired && refreshToken) {
        // Expired but refresh token present — layout will silently refresh
        return NextResponse.next();
      }
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  return NextResponse.next();
}

function readStaffRole(payload: JWTPayload): 'admin' | 'owner' | null {
  const staffRole = payload.staff_role;
  if (staffRole === 'admin' || staffRole === 'owner') return staffRole;

  const meta = payload.app_metadata;
  if (typeof meta === 'object' && meta !== null) {
    const role = (meta as Record<string, unknown>).role;
    if (role === 'admin' || role === 'owner') return role;
  }

  return null;
}
