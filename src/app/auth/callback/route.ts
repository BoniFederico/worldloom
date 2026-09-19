import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/auth/redirect';
import { resolveSiteUrl } from '@/lib/site-url';
import { createClient } from '@/lib/supabase/server';

/** Scambia il codice PKCE dei link email (verifica, reset) con una sessione. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = resolveSiteUrl();
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
