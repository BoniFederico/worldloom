import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { fieldsSchema } from '@/lib/fields/fields';
import { topLabels } from '@/lib/relations/input';
import { hasCriteria, parseSearchParams, rpcArgs, splitExcerpt } from '@/lib/search/params';
import { loadWorld } from '@/lib/worlds/context';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const LIMIT = 50;
// Tipi di campo confrontabili per uguaglianza di testo.
const SEARCHABLE_FIELD_TYPES = new Set(['text', 'number', 'date', 'choice']);

export default async function SearchPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const p = parseSearchParams(await searchParams);
  const { supabase, world } = await loadWorld(worldId);
  const t = await getTranslations('Search');

  const [{ data: categories }, { data: labels }] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, fields_schema')
      .eq('world_id', worldId)
      .order('name'),
    supabase
      .from('relations')
      .select('label, inverse_label')
      .eq('world_id', worldId)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  // Campi filtrabili: chiavi definite dalle categorie del mondo (la prima etichetta trovata per chiave).
  const fieldOptions = new Map<string, string>();
  for (const c of categories ?? []) {
    const parsed = fieldsSchema.safeParse(c.fields_schema);
    if (!parsed.success) continue;
    for (const f of parsed.data) {
      if (SEARCHABLE_FIELD_TYPES.has(f.type) && !fieldOptions.has(f.key)) {
        fieldOptions.set(f.key, f.label);
      }
    }
  }
  const relationLabels = topLabels([
    ...(labels ?? []).map((r) => r.label),
    ...(labels ?? []).map((r) => r.inverse_label),
  ]);

  const searched = hasCriteria(p);
  const { data: results, error } = searched
    ? await supabase.rpc('search_snippets', rpcArgs(worldId, p, LIMIT))
    : { data: [], error: null };

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>

        <form method="get" className="form" role="search" aria-label={t('title')}>
          <div className="field">
            <label htmlFor="q">{t('query')}</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={p.q}
              maxLength={200}
              autoComplete="off"
            />
          </div>

          <details
            className="field-edit"
            open={Boolean(
              p.category || p.tags.length || p.status || p.fieldKey || p.relation || p.archived,
            )}
          >
            <summary>{t('filters')}</summary>
            <div className="field">
              <label htmlFor="category">{t('category')}</label>
              <select id="category" name="category" defaultValue={p.category ?? ''}>
                <option value="">{t('any')}</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tags">{t('tags')}</label>
              <input
                id="tags"
                name="tags"
                defaultValue={p.tags.join(', ')}
                maxLength={300}
                autoComplete="off"
              />
              <p className="field-hint">{t('tagsHint')}</p>
            </div>
            <div className="field">
              <label htmlFor="status">{t('status')}</label>
              <select id="status" name="status" defaultValue={p.status ?? ''}>
                <option value="">{t('any')}</option>
                <option value="draft">{t('draft')}</option>
                <option value="final">{t('final')}</option>
              </select>
            </div>
            <div className="form-inline-pair">
              <div className="field">
                <label htmlFor="field">{t('field')}</label>
                <select id="field" name="field" defaultValue={p.fieldKey ?? ''}>
                  <option value="">{t('any')}</option>
                  {[...fieldOptions].map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="value">{t('value')}</label>
                <input
                  id="value"
                  name="value"
                  defaultValue={p.fieldValue}
                  maxLength={200}
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="relation">{t('relation')}</label>
              <input
                id="relation"
                name="relation"
                list="relation-labels"
                defaultValue={p.relation ?? ''}
                maxLength={120}
                autoComplete="off"
              />
              <datalist id="relation-labels">
                {relationLabels.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
            <label className="check">
              <input type="checkbox" name="archived" value="1" defaultChecked={p.archived} />
              {t('archived')}
            </label>
          </details>

          <button type="submit" className="btn btn-primary">
            {t('submit')}
          </button>
        </form>

        {error ? (
          <p role="alert" className="message message-error">
            {t('error')}
          </p>
        ) : null}

        {searched ? (
          <section aria-labelledby="results" aria-live="polite">
            <h2 id="results">{t('results')}</h2>
            <p className="role">{t('count', { count: results?.length ?? 0 })}</p>
            {results?.length ? (
              <ul className="search-results">
                {results.map((r) => (
                  <li key={r.id}>
                    <Link href={`/worlds/${world.id}/snippets/${r.id}`}>{r.title}</Link>
                    <span className="role">
                      {' '}
                      {r.status === 'final' ? t('final') : t('draft')}
                      {r.tags.length ? ` · ${r.tags.map((x) => `#${x}`).join(' ')}` : ''}
                    </span>
                    {r.excerpt ? (
                      <p className="search-excerpt">
                        {splitExcerpt(r.excerpt).map((part, i) =>
                          part.mark ? (
                            <mark key={i}>{part.text}</mark>
                          ) : (
                            <span key={i}>{part.text}</span>
                          ),
                        )}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">{t('none')}</p>
            )}
          </section>
        ) : (
          <p className="field-hint">{t('intro')}</p>
        )}
      </section>
    </main>
  );
}
