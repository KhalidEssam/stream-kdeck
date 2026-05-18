import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './lib/auth/cookies';
import { verifyAccessToken } from './lib/auth/jwt';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return redirectToLogin(request);
  }

  try {
    const session = await verifyAccessToken(token);

    if (pathname.startsWith('/admin/platform') && session.role !== 'owner') {
      return NextResponse.redirect(new URL('/forbidden', request.url));
    }

    if (pathname.startsWith('/admin') && session.role !== 'admin' && session.role !== 'owner') {
      return NextResponse.redirect(new URL('/forbidden', request.url));
    }

    return NextResponse.next();
  } catch {
    const response = redirectToLogin(request);
    response.cookies.set(ACCESS_TOKEN_COOKIE, '', { path: '/', maxAge: 0 });
    response.cookies.set(REFRESH_TOKEN_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  }
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*'],
};

function redirectToLogin(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const loginPath = pathname.startsWith('/admin') ? '/admin/login' : '/login';
  const url = new URL(loginPath, request.url);
  url.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(url);
}
