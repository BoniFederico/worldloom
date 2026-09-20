import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { createClient } from '@/lib/supabase/server';

type Props = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  worldId: string;
  snippetId: string;
};

/** «Menzionato in»: gli snippet il cui testo cita questo (relazioni nate da menzioni, in ingresso). */
export async function BacklinksPanel({ supabase, worldId, snippetId }: Props) {
  const t = await getTranslations('Backlinks');
  const { data: rows } = await supabase
    .from('relations')
    .select('source_id')
    .eq('world_id', worldId)
    .eq('target_id', snippetId)
    .eq('from_mention', true)
    .limit(200);
  const ids = [...new Set((rows ?? []).map((r) => r.source_id))];
  const { data: sources } = ids.length
    ? await supabase
        .from('snippets')
        .select('id, title')
        .in('id', ids)
        .is('deleted_at', null)
        .order('title')
    : { data: [] };

  return (
    <section aria-labelledby="backlinks">
      <h2 id="backlinks">{t('title')}</h2>
      {sources?.length ? (
        <ul className="backlinks">
          {sources.map((s) => (
            <li key={s.id}>
              <Link href={`/worlds/${worldId}/snippets/${s.id}`}>{s.title}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">{t('empty')}</p>
      )}
    </section>
  );
}
