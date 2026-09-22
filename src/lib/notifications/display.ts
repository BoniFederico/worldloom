import type { NotificationContext, NotificationRow } from './load';

export type NotificationDisplay = {
  href: string | null;
  key: 'reveal' | 'revealItem' | 'session' | 'mention' | 'inviteReceived' | 'inviteAccepted';
  params: Record<string, string | number>;
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Testo e link di una notifica: torna solo dati, la pagina li passa a `t()` per la traduzione. */
export function describeNotification(
  row: NotificationRow,
  ctx: NotificationContext,
): NotificationDisplay {
  switch (row.kind) {
    case 'reveal': {
      const itemKind = str(row.data.itemKind);
      const level = str(row.data.toLevel);
      const itemId = str(row.data.itemId);
      if (itemKind === 'snippet' || itemKind === 'field') {
        const snippet = ctx.snippets.get(itemId);
        const worldId = snippet?.world_id ?? row.world_id;
        return {
          href: worldId && itemId ? `/worlds/${worldId}/snippets/${itemId}` : null,
          key: 'reveal',
          params: { title: snippet?.title ?? '', level },
        };
      }
      return {
        href: row.world_id ? `/worlds/${row.world_id}` : null,
        key: 'revealItem',
        params: { kind: itemKind, level },
      };
    }
    case 'session': {
      const sessionId = str(row.data.sessionId);
      const session = ctx.sessions.get(sessionId);
      return {
        href: row.campaign_id ? `/campaigns/${row.campaign_id}/sessions/${sessionId}` : null,
        key: 'session',
        params: { number: session?.number ?? Number(row.data.number ?? 0) },
      };
    }
    case 'mention': {
      const sourceId = str(row.data.sourceSnippetId);
      const source = ctx.snippets.get(sourceId);
      return {
        href: source ? `/worlds/${source.world_id}/snippets/${sourceId}` : null,
        key: 'mention',
        params: { title: source?.title ?? '' },
      };
    }
    case 'invite_received': {
      const role = str(row.data.role);
      // Chi riceve l'invito non è ancora membro: la sua RLS non gli farebbe leggere il nome dalla tabella delle
      // campagne, quindi la notifica lo porta già con sé (scritto da una funzione `security definer`).
      const name =
        (row.campaign_id ? ctx.campaigns.get(row.campaign_id) : undefined) ??
        str(row.data.campaignName);
      return {
        href: row.campaign_id ? `/campaigns/${row.campaign_id}` : null,
        key: 'inviteReceived',
        params: { name, role },
      };
    }
    case 'invite_accepted': {
      const role = str(row.data.role);
      const userId = str(row.data.userId);
      const name = row.campaign_id ? (ctx.campaigns.get(row.campaign_id) ?? '') : '';
      const who = ctx.profiles.get(userId) ?? '';
      return {
        href: row.campaign_id ? `/campaigns/${row.campaign_id}` : null,
        key: 'inviteAccepted',
        params: { name, who, role },
      };
    }
  }
}
