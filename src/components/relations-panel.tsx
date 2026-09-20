import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { deleteRelation, updateRelation } from '@/app/worlds/[worldId]/snippets/relation-actions';
import { RelationForm, TimeFields } from '@/components/relation-form';
import { relationView, topLabels, type TimePoint } from '@/lib/relations/input';
import type { createClient } from '@/lib/supabase/server';

type Props = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  worldId: string;
  snippetId: string;
  snippetTitle: string;
  canWrite: boolean;
};

const point = (p: unknown): TimePoint | null =>
  typeof p === 'object' && p !== null && typeof (p as TimePoint).year === 'number'
    ? (p as TimePoint)
    : null;

/** «12/2/-300»: giorno, mese e anno, dal più al meno preciso; i campi assenti si omettono. */
const formatPoint = (p: TimePoint) =>
  [p.day, p.month, p.year].filter((v) => v !== undefined).join('/');

const fields = (p: TimePoint | null, prefix: 'from' | 'to') => ({
  [`${prefix}_year`]: p ? String(p.year) : '',
  [`${prefix}_month`]: p?.month !== undefined ? String(p.month) : '',
  [`${prefix}_day`]: p?.day !== undefined ? String(p.day) : '',
});

/** Relazioni dello snippet, in uscita e in ingresso, con il modulo per aggiungerne e modificarle. */
export async function RelationsPanel({
  supabase,
  worldId,
  snippetId,
  snippetTitle,
  canWrite,
}: Props) {
  const t = await getTranslations('Relations');

  const { data: rows } = await supabase
    .from('relations')
    .select('id, source_id, target_id, label, inverse_label, notes, valid_from, valid_to')
    .eq('world_id', worldId)
    .eq('from_mention', false) // le menzioni hanno il loro pannello (backlink)
    .or(`source_id.eq.${snippetId},target_id.eq.${snippetId}`)
    .order('created_at');
  const allViews = (rows ?? []).map((row) => ({ row, view: relationView(row, snippetId) }));

  const otherIds = [...new Set(allViews.map((v) => v.view.otherId))];
  const { data: others } = otherIds.length
    ? await supabase.from('snippets').select('id, title').in('id', otherIds).is('deleted_at', null)
    : { data: [] };
  const titles = new Map((others ?? []).map((s) => [s.id, s.title]));
  // Le relazioni verso snippet nel cestino non si mostrano (tornano se lo snippet viene ripristinato).
  const views = allViews.filter((v) => titles.has(v.view.otherId));

  // Suggerimenti: etichette già usate nel mondo e possibili destinazioni.
  const [{ data: used }, { data: targets }, { data: types }] = canWrite
    ? await Promise.all([
        supabase
          .from('relations')
          .select('label, inverse_label')
          .eq('world_id', worldId)
          .eq('from_mention', false)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('snippets')
          .select('id, title')
          .eq('world_id', worldId)
          .is('deleted_at', null)
          .neq('id', snippetId)
          .order('title')
          .limit(500),
        supabase.from('relation_types').select('label, inverse_label').eq('world_id', worldId),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return (
    <section aria-labelledby="relations">
      <h2 id="relations">{t('title')}</h2>
      {views.length === 0 ? (
        <p className="empty">{t('empty')}</p>
      ) : (
        <ul className="relations">
          {views.map(({ row, view }) => {
            const otherTitle = titles.get(view.otherId) ?? t('unknown');
            const from = point(row.valid_from);
            const to = point(row.valid_to);
            const validity =
              from && to
                ? t('validBoth', { from: formatPoint(from), to: formatPoint(to) })
                : from
                  ? t('validFromOnly', { from: formatPoint(from) })
                  : to
                    ? t('validToOnly', { to: formatPoint(to) })
                    : null;
            const source = view.direction === 'out' ? snippetTitle : otherTitle;
            const target = view.direction === 'out' ? otherTitle : snippetTitle;
            return (
              <li key={row.id}>
                <p className="relation-line">
                  {view.reversed ? (
                    <>
                      <Link href={`/worlds/${worldId}/snippets/${view.otherId}`}>{otherTitle}</Link>{' '}
                      <span className="rel-label">{view.label}</span> <em>{t('thisSnippet')}</em>
                    </>
                  ) : (
                    <>
                      <span className="rel-label">{view.label}</span>{' '}
                      <Link href={`/worlds/${worldId}/snippets/${view.otherId}`}>{otherTitle}</Link>
                    </>
                  )}
                </p>
                {validity ? <p className="role">{validity}</p> : null}
                {row.notes ? <p className="relation-notes">{row.notes}</p> : null}

                {canWrite ? (
                  <details className="field-edit">
                    <summary>
                      {t('edit')}
                      <span className="sr-only">
                        {' '}
                        {row.label} — {otherTitle}
                      </span>
                    </summary>
                    <form action={updateRelation} className="form">
                      <input type="hidden" name="world" value={worldId} />
                      <input type="hidden" name="id" value={snippetId} />
                      <input type="hidden" name="relation" value={row.id} />
                      <input type="hidden" name="target" value={view.otherId} />
                      <p className="field-hint">{t('editing', { source, target })}</p>
                      <div className="field">
                        <label htmlFor={`label-${row.id}`}>{t('label')}</label>
                        <input
                          id={`label-${row.id}`}
                          name="label"
                          defaultValue={row.label}
                          maxLength={120}
                          required
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`inverse-${row.id}`}>{t('inverse')}</label>
                        <input
                          id={`inverse-${row.id}`}
                          name="inverse"
                          defaultValue={row.inverse_label ?? ''}
                          maxLength={120}
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`notes-${row.id}`}>{t('notes')}</label>
                        <textarea
                          id={`notes-${row.id}`}
                          name="notes"
                          rows={3}
                          defaultValue={row.notes}
                        />
                      </div>
                      <TimeFields
                        prefix="from"
                        legend={t('validFrom')}
                        values={fields(from, 'from')}
                        idSuffix={`-${row.id}`}
                      />
                      <TimeFields
                        prefix="to"
                        legend={t('validTo')}
                        values={fields(to, 'to')}
                        idSuffix={`-${row.id}`}
                      />
                      <button type="submit" className="btn">
                        {t('save')}
                      </button>
                    </form>
                  </details>
                ) : null}
                {canWrite ? (
                  <form action={deleteRelation}>
                    <input type="hidden" name="world" value={worldId} />
                    <input type="hidden" name="id" value={snippetId} />
                    <input type="hidden" name="relation" value={row.id} />
                    <button type="submit" className="btn btn-danger">
                      {t('remove')}
                      <span className="sr-only">
                        {' '}
                        {row.label} — {otherTitle}
                      </span>
                    </button>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite ? (
        <>
          <h3>{t('addTitle')}</h3>
          <p className="field-hint">
            <Link href={`/worlds/${worldId}/relation-types`}>{t('manageTypes')}</Link>
          </p>
          <RelationForm
            worldId={worldId}
            snippetId={snippetId}
            targets={targets ?? []}
            labels={topLabels([
              ...(types ?? []).map((r) => r.label),
              ...(used ?? []).map((r) => r.label),
            ])}
            inverses={topLabels([
              ...(types ?? []).map((r) => r.inverse_label),
              ...(used ?? []).map((r) => r.inverse_label),
            ])}
          />
        </>
      ) : null}
    </section>
  );
}
