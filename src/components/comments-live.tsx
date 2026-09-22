'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Si iscrive ai nuovi commenti di questo snippet (Postgres Changes) e ricarica i dati della pagina quando ne arriva
 * uno: niente rendering duplicato lato client, la RLS del proprio elenco resta quella del server component.
 */
export function CommentsLive({ snippetId }: { snippetId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    // La RLS della sottoscrizione usa il token della sessione: va aspettato, altrimenti il socket si apre come
    // anonimo (nessun token ancora impostato) e non riceve nulla su uno snippet non pubblico.
    void supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`snippet-comments:${snippetId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'snippet_comments',
            filter: `snippet_id=eq.${snippetId}`,
          },
          () => router.refresh(),
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [snippetId, router]);

  return null;
}
