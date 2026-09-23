import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from '@/lib/security/csp';
import { getSupabaseEnv } from '@/lib/supabase/env';

const PROTECTED = ['/account', '/worlds', '/campaigns', '/invite', '/notifications'];

/** Rinnova la sessione Supabase a ogni richiesta, protegge le pagine riservate e imposta la CSP (#46). */
export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const { url, anonKey } = getSupabaseEnv();
  const csp = buildCsp(nonce, url);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const withCsp = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp);
    return res;
  };
  let response = withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(items) {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (!data?.claims && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = `?next=${encodeURIComponent(path)}`;
    return withCsp(NextResponse.redirect(login));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
};
