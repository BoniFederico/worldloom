import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Esportazione dei dati personali (#44, GDPR): non il contenuto dei mondi (già coperto dall'export del
 * singolo mondo), ma i dati legati all'account stesso — profilo, appartenenze e note private di sessione.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  // Il prefisso /account è protetto da src/proxy.ts: un anonimo non arriva qui; se ci arriva (sessione scaduta
  // proprio ora), niente redirect fantasioso — solo 404, come le altre rotte che servono dati privati.
  if (!auth.user) return new NextResponse('Not found', { status: 404 });

  const userId = auth.user.id;
  const [{ data: profile }, { data: worlds }, { data: campaigns }, { data: notes }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('display_name, privacy_accepted_at, created_at')
        .eq('id', userId)
        .maybeSingle(),
      supabase.from('world_members').select('role, worlds(name)').eq('user_id', userId),
      supabase.from('campaign_members').select('role, campaigns(name)').eq('user_id', userId),
      supabase
        .from('session_player_notes')
        .select('notes, updated_at, campaign_sessions(number, campaign_id)')
        .eq('user_id', userId),
    ]);

  const data = {
    exportedAt: new Date().toISOString(),
    account: { email: auth.user.email, createdAt: auth.user.created_at },
    profile: {
      displayName: profile?.display_name ?? '',
      privacyAcceptedAt: profile?.privacy_accepted_at ?? null,
      createdAt: profile?.created_at ?? null,
    },
    worldMemberships: (worlds ?? []).map((w) => ({ world: w.worlds?.name ?? null, role: w.role })),
    campaignMemberships: (campaigns ?? []).map((c) => ({
      campaign: c.campaigns?.name ?? null,
      role: c.role,
    })),
    privateSessionNotes: (notes ?? []).map((n) => ({
      sessionNumber: n.campaign_sessions?.number ?? null,
      notes: n.notes,
      updatedAt: n.updated_at,
    })),
  };

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="worldloom-dati-personali.json"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
