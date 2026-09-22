'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Viewer = { id: string; name: string };

/**
 * Chi altro sta guardando questo snippet ora: un canale di presenza effimero (nessuna riga nel database), aggiornato
 * finché la scheda resta aperta. Non mostra mai sé stessi nell'elenco.
 */
export function PresenceBar({
  snippetId,
  userId,
  displayName,
}: {
  snippetId: string;
  userId: string;
  displayName: string;
}) {
  const t = useTranslations('Presence');
  const [others, setOthers] = useState<Viewer[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`snippet-presence:${snippetId}`, {
      config: { presence: { key: userId } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<Viewer>();
        const viewers: Viewer[] = [];
        for (const [key, entries] of Object.entries(state)) {
          const entry = entries[0];
          if (key !== userId && entry) viewers.push({ id: entry.id, name: entry.name });
        }
        setOthers(viewers);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ id: userId, name: displayName } satisfies Viewer);
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [snippetId, userId, displayName]);

  if (others.length === 0) return null;
  return (
    <p className="presence-bar" aria-live="polite">
      {t('alsoHere', { names: others.map((v) => v.name).join(', ') })}
    </p>
  );
}
