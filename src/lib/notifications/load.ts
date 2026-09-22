import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

export type NotificationKind =
  'reveal' | 'session' | 'mention' | 'invite_received' | 'invite_accepted';

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  world_id: string | null;
  campaign_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

const LIMIT = 50;

/** Le notifiche di chi guarda, più recenti prima; la RLS le limita già alle proprie. */
export async function loadNotifications(supabase: Client): Promise<NotificationRow[]> {
  const { data } = await supabase
    .from('notifications')
    .select('id, kind, world_id, campaign_id, data, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  return (data ?? []) as NotificationRow[];
}

/** Numero di notifiche non lette, per il pallino accanto alla campanella nell'intestazione. */
export async function countUnreadNotifications(supabase: Client): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  return count ?? 0;
}

export type NotificationContext = {
  snippets: Map<string, { title: string; world_id: string }>;
  sessions: Map<string, { number: number; title: string }>;
  campaigns: Map<string, string>;
  profiles: Map<string, string>;
};

/**
 * Titoli e nomi da mostrare accanto a ogni notifica. La RLS decide da sola cosa torna: se chi guarda ha perso
 * l'accesso nel frattempo, l'elemento semplicemente non compare nella mappa (la pagina mostra un testo generico).
 */
export async function loadNotificationContext(
  supabase: Client,
  rows: readonly NotificationRow[],
): Promise<NotificationContext> {
  const snippetIds = new Set<string>();
  const sessionIds = new Set<string>();
  const campaignIds = new Set<string>();
  const profileIds = new Set<string>();
  for (const r of rows) {
    if (r.kind === 'reveal' && (r.data.itemKind === 'snippet' || r.data.itemKind === 'field')) {
      if (typeof r.data.itemId === 'string') snippetIds.add(r.data.itemId);
    }
    if (r.kind === 'mention' && typeof r.data.sourceSnippetId === 'string') {
      snippetIds.add(r.data.sourceSnippetId);
    }
    if (r.kind === 'session' && typeof r.data.sessionId === 'string')
      sessionIds.add(r.data.sessionId);
    if (r.campaign_id) campaignIds.add(r.campaign_id);
    if (r.kind === 'invite_accepted' && typeof r.data.userId === 'string')
      profileIds.add(r.data.userId);
  }

  const [{ data: snippets }, { data: sessions }, { data: campaigns }, { data: profiles }] =
    await Promise.all([
      snippetIds.size
        ? supabase
            .from('snippets')
            .select('id, title, world_id')
            .in('id', [...snippetIds])
        : Promise.resolve({ data: [] }),
      sessionIds.size
        ? supabase
            .from('campaign_sessions')
            .select('id, number, title')
            .in('id', [...sessionIds])
        : Promise.resolve({ data: [] }),
      campaignIds.size
        ? supabase
            .from('campaigns')
            .select('id, name')
            .in('id', [...campaignIds])
        : Promise.resolve({ data: [] }),
      profileIds.size
        ? supabase
            .from('profiles')
            .select('id, display_name')
            .in('id', [...profileIds])
        : Promise.resolve({ data: [] }),
    ]);

  return {
    snippets: new Map(
      (snippets ?? []).map((s) => [s.id, { title: s.title, world_id: s.world_id }]),
    ),
    sessions: new Map((sessions ?? []).map((s) => [s.id, { number: s.number, title: s.title }])),
    campaigns: new Map((campaigns ?? []).map((c) => [c.id, c.name])),
    profiles: new Map((profiles ?? []).map((p) => [p.id, p.display_name])),
  };
}
