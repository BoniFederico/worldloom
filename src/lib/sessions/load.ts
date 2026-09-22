import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

export type SessionRow = {
  id: string;
  number: number;
  title: string;
  played_on: string | null;
  summary: string;
  created_at: string;
  updated_at: string;
};

/** Sessioni della campagna, più recenti prima; la RLS decide chi le vede (ogni membro). */
export async function loadSessions(supabase: Client, campaignId: string): Promise<SessionRow[]> {
  const { data } = await supabase
    .from('campaign_sessions')
    .select('id, number, title, played_on, summary, created_at, updated_at')
    .eq('campaign_id', campaignId)
    .order('number', { ascending: false });
  return data ?? [];
}

export type PostRow = { id: string; author: string | null; body: string; created_at: string };

/** Voci del diario o della bacheca, più recenti prima; fino a 200 (paginazione non ancora prevista). */
export async function loadPosts(
  supabase: Client,
  campaignId: string,
  kind: 'chronicle' | 'message',
): Promise<PostRow[]> {
  const { data } = await supabase
    .from('campaign_posts')
    .select('id, author, body, created_at')
    .eq('campaign_id', campaignId)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(200);
  return data ?? [];
}

/** Nomi profilo di un elenco di utenti (chi non ha più accesso appare come «Un utente»). */
export async function loadNames(
  supabase: Client,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', [...new Set(ids)]);
  return new Map((data ?? []).map((p) => [p.id, p.display_name]));
}
