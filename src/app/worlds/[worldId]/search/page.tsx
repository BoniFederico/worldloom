import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { fieldsSchema } from '@/lib/fields/fields';
import { topLabels } from '@/lib/relations/input';
import { hasCriteria, parseSearchParams, rpcArgs } from '@/lib/search/params';
import { Feedback } from '@/components/feedback';
import { SearchResults } from '@/components/search-results';
import { loadWorld } from '@/lib/worlds/context';
import { saveView } from '../views/actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const LIMIT = 50;
// Tipi di campo confrontabili per uguaglianza di testo.
const SEARCHABLE_FIELD_TYPES = new Set(['text', 'number', 'date', 'choice']);

export default async function SearchPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const raw = await searchParams;
  const p = parseSearchParams(raw);
  const queryError = raw.error;
  const { supabase, world, canWrite } = await loadWorld(worldId);
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
        <Feedback scope="Search" error={typeof queryError === 'string' ? queryError : undefined} />

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
          <>
            <SearchResults worldId={world.id} results={results ?? []} />
            {canWrite ? (
              <details className="field-edit">
                <summary>{t('saveView')}</summary>
                <form action={saveView} className="form">
                  <input type="hidden" name="world" value={world.id} />
                  {p.q ? <input type="hidden" name="q" value={p.q} /> : null}
                  {p.category ? <input type="hidden" name="category" value={p.category} /> : null}
                  {p.tags.length ? (
                    <input type="hidden" name="tags" value={p.tags.join(',')} />
                  ) : null}
                  {p.status ? <input type="hidden" name="status" value={p.status} /> : null}
                  {p.fieldKey ? <input type="hidden" name="field" value={p.fieldKey} /> : null}
                  {p.fieldKey && p.fieldValue ? (
                    <input type="hidden" name="value" value={p.fieldValue} />
                  ) : null}
                  {p.relation ? <input type="hidden" name="relation" value={p.relation} /> : null}
                  {p.archived ? <input type="hidden" name="archived" value="1" /> : null}
                  <div className="field">
                    <label htmlFor="view-name">{t('viewName')}</label>
                    <input id="view-name" name="name" maxLength={80} required autoComplete="off" />
                  </div>
                  <label className="check">
                    <input type="checkbox" name="shared" defaultChecked />
                    {t('shareWithMembers')}
                  </label>
                  <button type="submit" className="btn">
                    {t('saveViewSubmit')}
                  </button>
                </form>
              </details>
            ) : null}
          </>
        ) : (
          <p className="field-hint">{t('intro')}</p>
        )}
      </section>
    </main>
  );
}
