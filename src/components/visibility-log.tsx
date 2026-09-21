import { getFormatter, getTranslations } from 'next-intl/server';
import type { createClient } from '@/lib/supabase/server';

type Client = Awaited<ReturnType<typeof createClient>>;

const LIMIT = 30;

/** Registro dei cambi di visibilità di uno snippet e dei suoi campi (per chi scrive): chi, quando, da/a, destinatari e nota. */
export async function VisibilityLog({
  supabase,
  worldId,
  snippetId,
  fieldLabels,
}: {
  supabase: Client;
  worldId: string;
  snippetId: string;
  fieldLabels: Record<string, string>;
}) {
  const [t, format] = await Promise.all([getTranslations('Visibility'), getFormatter()]);
  const { data: rows } = await supabase
    .from('visibility_log')
    .select(
      'id, kind, field_key, from_level, to_level, shared_with, is_reveal, note, changed_by, created_at',
    )
    .eq('world_id', worldId)
    .eq('item_id', snippetId)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  const entries = rows ?? [];
  const ids = [
    ...new Set(entries.flatMap((r) => [...(r.changed_by ? [r.changed_by] : []), ...r.shared_with])),
  ];
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id, display_name').in('id', ids)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const who = (id: string) => names.get(id) || t('unknownUser');

  return (
    <section aria-labelledby="visibility-log">
      <h3 id="visibility-log">{t('logTitle')}</h3>
      {entries.length === 0 ? (
        <p className="empty">{t('logEmpty')}</p>
      ) : (
        <ol className="visibility-log">
          {entries.map((r) => (
            <li key={r.id}>
              <p>
                <time dateTime={r.created_at}>
                  {format.dateTime(new Date(r.created_at), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>{' '}
                — {r.changed_by ? who(r.changed_by) : t('unknownUser')}:{' '}
                {r.kind === 'field'
                  ? t('logField', { name: fieldLabels[r.field_key] ?? r.field_key })
                  : t('logSnippet')}{' '}
                {t('logChange', {
                  from: t(`levels.${r.from_level}`),
                  to: t(`levels.${r.to_level}`),
                })}
                {r.is_reveal ? <strong className="badge"> {t('reveal')}</strong> : null}
              </p>
              {r.shared_with.length ? (
                <p className="role">
                  {t('logUsers', { names: r.shared_with.map(who).join(', ') })}
                </p>
              ) : null}
              {r.note ? <p className="relation-notes">{r.note}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
