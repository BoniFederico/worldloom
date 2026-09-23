import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CategoryBadge } from '@/components/category-icon';
import { Feedback } from '@/components/feedback';
import { SubmitButton } from '@/components/submit-button';
import { parseTags } from '@/lib/snippets/labels';
import { loadWorld } from '@/lib/worlds/context';
import { createSnippet, deleteSnippetForever, restoreSnippet } from './actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{
    error?: string | string[];
    notice?: string | string[];
    view?: string | string[];
    tag?: string | string[];
    status?: string | string[];
  }>;
};

/** Un parametro ripetuto (`?tag=a&tag=b`) arriva come array: si prende il primo valore. */
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const VIEWS = ['active', 'archived', 'trash'] as const;
type View = (typeof VIEWS)[number];

export default async function SnippetsPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const query_ = await searchParams;
  const [error, notice, rawView, rawTag, rawStatus] = [
    one(query_.error),
    one(query_.notice),
    one(query_.view),
    one(query_.tag),
    one(query_.status),
  ];
  const view: View = VIEWS.find((v) => v === rawView) ?? 'active';
  const { supabase, world, canWrite } = await loadWorld(worldId);
  // Il cestino è solo per chi può scrivere.
  if (view === 'trash' && !canWrite) redirect(`/worlds/${worldId}/snippets`);
  const t = await getTranslations('Snippets');
  // Il filtro usa le stesse regole dei tag salvati: minuscole, spazi normalizzati, nessun carattere speciale.
  const tagFilter = parseTags(rawTag ?? '');
  const tags = tagFilter.ok ? tagFilter.values : [];
  const tag = tags.join(', ');
  const status = rawStatus === 'draft' || rawStatus === 'final' ? rawStatus : undefined;

  let query = supabase
    .from('snippets')
    .select(
      'id, title, status, tags, updated_at, deleted_at, snippet_categories(categories(id, name, icon, color))',
    )
    .eq('world_id', worldId);
  if (view === 'trash')
    query = query.not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
  else if (view === 'archived')
    query = query
      .is('deleted_at', null)
      .not('archived_at', 'is', null)
      .order('updated_at', { ascending: false });
  else
    query = query
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('updated_at', { ascending: false });

  if (tags.length) query = query.contains('tags', tags);
  if (status) query = query.eq('status', status);

  const [{ data: snippets, error: listError }, { data: categories }] = await Promise.all([
    query.limit(200),
    supabase.from('categories').select('id, name').eq('world_id', worldId).order('name'),
  ]);
  // Il cestino è visibile solo a chi può scrivere (lo garantisce la RLS); gli altri vedono l'elenco attivo.
  const showTrash = canWrite;

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <Feedback
          scope="Snippets"
          notice={notice}
          error={error ?? (listError ? 'generic' : undefined)}
        />
        {rawTag && !tagFilter.ok ? (
          <p role="alert" className="message message-error">
            {t('errors.invalid_labels')}
          </p>
        ) : null}

        <nav aria-label={t('views')} className="tabs">
          {VIEWS.filter((v) => v !== 'trash' || showTrash).map((v) => (
            <Link
              key={v}
              href={
                v === 'active'
                  ? `/worlds/${world.id}/snippets`
                  : `/worlds/${world.id}/snippets?view=${v}`
              }
              aria-current={v === view ? 'page' : undefined}
              className="tab"
            >
              {t(`view.${v}`)}
            </Link>
          ))}
        </nav>
        {view !== 'trash' ? (
          <form method="get" className="form-inline filters" aria-label={t('filters')}>
            {view !== 'active' ? <input type="hidden" name="view" value={view} /> : null}
            <div className="field">
              <label htmlFor="filter-tag">{t('filterTag')}</label>
              <input
                id="filter-tag"
                name="tag"
                defaultValue={tag}
                maxLength={200}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="filter-status">{t('filterStatus')}</label>
              <select id="filter-status" name="status" defaultValue={status ?? ''}>
                <option value="">{t('filterAll')}</option>
                <option value="draft">{t('status.draft')}</option>
                <option value="final">{t('status.final')}</option>
              </select>
            </div>
            <button type="submit" className="btn">
              {t('filterApply')}
            </button>
            {tag || status ? (
              <Link
                className="btn"
                href={
                  view === 'active'
                    ? `/worlds/${world.id}/snippets`
                    : `/worlds/${world.id}/snippets?view=${view}`
                }
              >
                {t('filterReset')}
              </Link>
            ) : null}
          </form>
        ) : null}
        {view === 'trash' ? <p className="field-hint">{t('trashHint')}</p> : null}

        {snippets?.length ? (
          <ul className="world-list">
            {snippets.map((s) => {
              const cats = s.snippet_categories.flatMap((sc) =>
                sc.categories ? [sc.categories] : [],
              );
              return (
                <li key={s.id}>
                  {view === 'trash' ? (
                    <span>{s.title}</span>
                  ) : (
                    <Link href={`/worlds/${world.id}/snippets/${s.id}`}>
                      {cats[0] ? (
                        <CategoryBadge icon={cats[0].icon ?? ''} color={cats[0].color ?? ''} />
                      ) : null}
                      {s.title}
                    </Link>
                  )}
                  <span className="role">
                    {cats.map((c) => c.name).join(', ')}
                    {cats.length ? ' · ' : ''}
                    {t(`status.${s.status}`)}
                    {s.tags.length ? ` · ${s.tags.map((x) => `#${x}`).join(' ')}` : ''}
                  </span>
                  {view === 'trash' && canWrite ? (
                    <span className="field-actions">
                      <form action={restoreSnippet}>
                        <input type="hidden" name="world" value={world.id} />
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="btn">
                          {t('restore')}
                          <span className="sr-only"> {s.title}</span>
                        </button>
                      </form>
                      <form action={deleteSnippetForever}>
                        <input type="hidden" name="world" value={world.id} />
                        <input type="hidden" name="id" value={s.id} />
                        <label className="check">
                          <input type="checkbox" name="confirm" />
                          {t('confirmForever')}
                          <span className="sr-only"> {s.title}</span>
                        </label>
                        <button type="submit" className="btn btn-danger">
                          {t('deleteForever')}
                          <span className="sr-only"> {s.title}</span>
                        </button>
                      </form>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">{t(`empty.${view}`)}</p>
        )}

        {canWrite && view === 'active' ? (
          <>
            <h2>{t('createTitle')}</h2>
            <form action={createSnippet} className="form">
              <input type="hidden" name="world" value={world.id} />
              <div className="field">
                <label htmlFor="new-title">{t('titleLabel')}</label>
                <input id="new-title" name="title" maxLength={300} autoComplete="off" required />
              </div>
              <div className="field">
                <label htmlFor="new-category">{t('categoryLabel')}</label>
                <select id="new-category" name="category" defaultValue="">
                  <option value="">{t('noCategory')}</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton className="btn btn-primary">{t('create')}</SubmitButton>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
