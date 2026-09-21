import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { TableView } from '@/components/table-view';
import { parseSearchParams } from '@/lib/search/params';
import { searchQuery } from '@/lib/views/filters';
import { configFromQuery, configQuery, type TableConfig } from '@/lib/views/table';
import { TABLE_LIMIT, loadTableContext, loadTableRows } from '@/lib/views/table-data';
import { loadWorld } from '@/lib/worlds/context';
import { saveView } from '../views/actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const FIXED_COLUMNS = ['title', 'status', 'categories', 'tags', 'updated'] as const;

export default async function TablePage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const raw = await searchParams;
  const p = parseSearchParams(raw);
  const config: TableConfig = configFromQuery(raw);
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, search, locale, { ctx, categories, fieldColumns }] = await Promise.all([
    getTranslations('Table'),
    getTranslations('Search'),
    getLocale(),
    loadTableContext(supabase, worldId),
  ]);
  const loaded = await loadTableRows(supabase, worldId, p);

  const base = `/worlds/${world.id}/table`;
  const filterQuery = searchQuery({ ...p, q: '', relation: null });
  const sortHref = (column: string, dir: 'asc' | 'desc') => {
    const qs = [filterQuery, configQuery({ ...config, sort: { by: column, dir } })]
      .filter(Boolean)
      .join('&');
    return `${base}?${qs}`;
  };
  const errorKey = typeof raw.error === 'string' ? raw.error : undefined;
  const allColumns = [
    ...FIXED_COLUMNS.map((c) => ({ value: c, label: t(`col.${c}`) })),
    ...fieldColumns.map((f) => ({ value: `field:${f.key}`, label: f.label })),
  ];
  const groups = [
    { value: '', label: t('noGroup') },
    { value: 'status', label: t('col.status') },
    { value: 'category', label: t('col.categories') },
    ...fieldColumns.map((f) => ({ value: `field:${f.key}`, label: f.label })),
  ];

  return (
    <main id="main" className="page page-top">
      <section className="content content-wide">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <Feedback scope="Search" error={errorKey} />

        <form method="get" className="form" aria-label={t('settings')}>
          <details className="field-edit" open>
            <summary>{t('settings')}</summary>
            <fieldset className="field">
              <legend>{t('columns')}</legend>
              <div className="check-row">
                {allColumns.map((c) => (
                  <label key={c.value} className="check">
                    <input
                      type="checkbox"
                      name="cols"
                      value={c.value}
                      defaultChecked={config.columns.includes(c.value)}
                      disabled={c.value === 'title'}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              {/* Il titolo è sempre presente: la casella è disabilitata, quindi si invia a parte. */}
              <input type="hidden" name="cols" value="title" />
            </fieldset>
            <div className="form-inline-pair">
              <div className="field">
                <label htmlFor="sort">{t('sortField')}</label>
                <select id="sort" name="sort" defaultValue={config.sort.by}>
                  {allColumns.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="dir">{t('direction')}</label>
                <select id="dir" name="dir" defaultValue={config.sort.dir}>
                  <option value="asc">{t('asc')}</option>
                  <option value="desc">{t('desc')}</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="group">{t('groupBy')}</label>
              <select id="group" name="group" defaultValue={config.group ?? ''}>
                {groups.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="category">{search('category')}</label>
              <select id="category" name="category" defaultValue={p.category ?? ''}>
                <option value="">{search('any')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tags">{search('tags')}</label>
              <input
                id="tags"
                name="tags"
                defaultValue={p.tags.join(', ')}
                maxLength={300}
                autoComplete="off"
              />
              <p className="field-hint">{search('tagsHint')}</p>
            </div>
            <div className="field">
              <label htmlFor="status">{search('status')}</label>
              <select id="status" name="status" defaultValue={p.status ?? ''}>
                <option value="">{search('any')}</option>
                <option value="draft">{search('draft')}</option>
                <option value="final">{search('final')}</option>
              </select>
            </div>
            <div className="form-inline-pair">
              <div className="field">
                <label htmlFor="field">{search('field')}</label>
                <select id="field" name="field" defaultValue={p.fieldKey ?? ''}>
                  <option value="">{search('any')}</option>
                  {fieldColumns
                    .filter((f) => f.filterable)
                    .map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="value">{search('value')}</label>
                <input
                  id="value"
                  name="value"
                  defaultValue={p.fieldValue}
                  maxLength={200}
                  autoComplete="off"
                />
              </div>
            </div>
            <label className="check">
              <input type="checkbox" name="archived" value="1" defaultChecked={p.archived} />
              {search('archived')}
            </label>
          </details>
          <button type="submit" className="btn btn-primary">
            {t('apply')}
          </button>
        </form>

        {loaded ? (
          <TableView
            worldId={world.id}
            rows={loaded.rows}
            ctx={ctx}
            config={config}
            truncatedAt={loaded.truncated ? TABLE_LIMIT : null}
            sortHref={sortHref}
            locale={locale}
          />
        ) : (
          <p role="alert" className="message message-error">
            {t('loadError')}
          </p>
        )}

        {canWrite ? (
          <details className="field-edit">
            <summary>{search('saveView')}</summary>
            <form action={saveView} className="form">
              <input type="hidden" name="world" value={world.id} />
              <input type="hidden" name="kind" value="table" />
              {Object.entries(
                Object.fromEntries(
                  new URLSearchParams(searchQuery({ ...p, q: '', relation: null })),
                ),
              ).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              {Object.entries(Object.fromEntries(new URLSearchParams(configQuery(config)))).map(
                ([name, value]) => (
                  <input key={`cfg-${name}`} type="hidden" name={name} value={value} />
                ),
              )}
              <div className="field">
                <label htmlFor="view-name">{search('viewName')}</label>
                <input id="view-name" name="name" maxLength={80} required autoComplete="off" />
              </div>
              <label className="check">
                <input type="checkbox" name="shared" defaultChecked />
                {search('shareWithMembers')}
              </label>
              <button type="submit" className="btn">
                {search('saveViewSubmit')}
              </button>
            </form>
          </details>
        ) : null}
        <p className="field-hint">{t('filtersOnly')}</p>
      </section>
    </main>
  );
}
