import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { SearchResults } from '@/components/search-results';
import { TableView } from '@/components/table-view';
import { hasCriteria, rpcArgs } from '@/lib/search/params';
import { paramsOfFilters, searchQuery } from '@/lib/views/filters';
import { configFromQuery, configQuery, parseTableConfig } from '@/lib/views/table';
import { TABLE_LIMIT, loadTableContext, loadTableRows } from '@/lib/views/table-data';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';
import { deleteView, updateView } from '../actions';

type Props = {
  params: Promise<{ worldId: string; viewId: string }>;
  searchParams: Promise<{
    error?: string;
    notice?: string;
    sort?: string | string[];
    dir?: string | string[];
  }>;
};

const LIMIT = 50;

export default async function ViewPage({ params, searchParams }: Props) {
  const { worldId, viewId } = await params;
  if (!uuidSchema.safeParse(viewId).success) notFound();
  const raw = await searchParams;
  const { error, notice } = raw;
  const { supabase, world, role } = await loadWorld(worldId);
  const [t, { data: view }, { data: auth }] = await Promise.all([
    getTranslations('Views'),
    supabase
      .from('saved_views')
      .select('id, name, kind, filters, config, shared, created_by')
      .eq('id', viewId)
      .eq('world_id', worldId)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);
  // Una vista non condivisa di un altro utente non si vede: per chi guarda non esiste.
  if (!view) notFound();

  const p = paramsOfFilters(view.filters);
  const canManage = view.created_by === auth.user?.id || role === 'owner';
  const editable = canManage && (role === 'owner' || role === 'editor');
  // I risultati si calcolano ora, con i permessi di chi guarda (RLS): la vista non contiene dati.
  const { data: results, error: searchError } =
    view.kind === 'list' && hasCriteria(p)
      ? await supabase.rpc('search_snippets', rpcArgs(worldId, p, LIMIT))
      : { data: [], error: null };
  const query = searchQuery(p);

  // Tabella: la configurazione salvata; ordinare da un'intestazione la cambia solo per questa visita (non modifica la vista).
  const isTable = view.kind === 'table';
  const saved = parseTableConfig(view.config);
  const override = configFromQuery({ cols: saved.columns.join(','), sort: raw.sort, dir: raw.dir });
  const tableConfig = raw.sort ? { ...saved, sort: override.sort } : saved;
  const [locale, tableData, tableRows] = isTable
    ? await Promise.all([
        getLocale(),
        loadTableContext(supabase, worldId),
        loadTableRows(supabase, worldId, p),
      ])
    : [null, null, null];
  const viewPath = `/worlds/${world.id}/views/${view.id}`;
  const editTable = `/worlds/${world.id}/table?${[query, configQuery(saved)].filter(Boolean).join('&')}`;

  return (
    <main id="main" className="page page-top">
      <section className={isTable ? 'content content-wide' : 'content'}>
        <p className="crumbs">
          <Link href={`/worlds/${world.id}/views`}>{t('title')}</Link>
        </p>
        <h1>{view.name}</h1>
        <p className="role">
          {t(`kind.${view.kind}`)} · {view.shared ? t('shared') : t('private')}
        </p>
        <Feedback scope="Views" notice={notice} error={error} />

        {view.kind === 'list' ? (
          <>
            <p>
              <Link href={`/worlds/${world.id}/search${query ? `?${query}` : ''}`} className="btn">
                {t('editFilters')}
              </Link>
            </p>
            {searchError ? (
              <p role="alert" className="message message-error">
                {t('searchError')}
              </p>
            ) : hasCriteria(p) ? (
              <SearchResults worldId={world.id} results={results ?? []} />
            ) : (
              <p className="field-hint">{t('noFilters')}</p>
            )}
          </>
        ) : isTable && tableData && locale ? (
          <>
            <p>
              <Link href={editTable} className="btn">
                {t('editTable')}
              </Link>
            </p>
            {tableRows ? (
              <TableView
                worldId={world.id}
                rows={tableRows.rows}
                ctx={tableData.ctx}
                config={tableConfig}
                truncatedAt={tableRows.truncated ? TABLE_LIMIT : null}
                sortHref={(column, dir) =>
                  `${viewPath}?sort=${encodeURIComponent(column)}&dir=${dir}`
                }
                locale={locale}
              />
            ) : (
              <p role="alert" className="message message-error">
                {t('searchError')}
              </p>
            )}
          </>
        ) : (
          <p className="message message-info">{t('kindSoon')}</p>
        )}

        {editable ? (
          <>
            <h2>{t('manage')}</h2>
            <form action={updateView} className="form">
              <input type="hidden" name="world" value={world.id} />
              <input type="hidden" name="id" value={view.id} />
              <div className="field">
                <label htmlFor="view-name">{t('name')}</label>
                <input
                  id="view-name"
                  name="name"
                  defaultValue={view.name}
                  maxLength={80}
                  required
                  autoComplete="off"
                />
              </div>
              {view.created_by === auth.user?.id ? (
                <label className="check">
                  <input type="checkbox" name="shared" defaultChecked={view.shared} />
                  {t('shareWithMembers')}
                </label>
              ) : null}
              <button type="submit" className="btn">
                {t('save')}
              </button>
            </form>
            <form action={deleteView} className="form">
              <input type="hidden" name="world" value={world.id} />
              <input type="hidden" name="id" value={view.id} />
              <label className="check">
                <input type="checkbox" name="confirm" />
                {t('confirmDelete')}
              </label>
              <button type="submit" className="btn btn-danger">
                {t('delete')}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
