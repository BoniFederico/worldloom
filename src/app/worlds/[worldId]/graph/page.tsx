import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { GraphView } from '@/components/graph-view';
import { loadGraph } from '@/lib/graph/load';
import { graphQuery, parseGraphParams } from '@/lib/graph/params';
import { topLabels } from '@/lib/relations/input';
import { loadWorld } from '@/lib/worlds/context';
import { saveView } from '../views/actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GraphPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const raw = await searchParams;
  const p = parseGraphParams(raw);
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, search, graph, { data: categories }, { data: labels }] = await Promise.all([
    getTranslations('Graph'),
    getTranslations('Search'),
    loadGraph(supabase, worldId, p),
    supabase.from('categories').select('id, name, color').eq('world_id', worldId).order('name'),
    supabase
      .from('relations')
      .select('label, inverse_label')
      .eq('world_id', worldId)
      .eq('from_mention', false)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);
  const relationLabels = topLabels([
    ...(labels ?? []).map((r) => r.label),
    ...(labels ?? []).map((r) => r.inverse_label),
  ]);
  const centerTitle = graph?.nodes.find((n) => n.id === p.center)?.title ?? null;
  const base = `/worlds/${world.id}/graph`;
  const nodeHref = (id: string) => {
    const qs = graphQuery({ ...p, center: id });
    return qs ? `${base}?${qs}` : base;
  };
  const withoutCenter = graphQuery({ ...p, center: null });
  const errorKey = typeof raw.error === 'string' ? raw.error : undefined;

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
            {p.center ? <input type="hidden" name="center" value={p.center} /> : null}
            <div className="form-inline-pair">
              <div className="field">
                <label htmlFor="depth">{t('depth')}</label>
                <select id="depth" name="depth" defaultValue={String(p.depth)}>
                  {[0, 1, 2, 3, 4].map((d) => (
                    <option key={d} value={d}>
                      {t('depthOption', { count: d })}
                    </option>
                  ))}
                </select>
                <p className="field-hint">{t('depthHint')}</p>
              </div>
              <div className="field">
                <label htmlFor="category">{search('category')}</label>
                <select id="category" name="category" defaultValue={p.category ?? ''}>
                  <option value="">{search('any')}</option>
                  {(categories ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-inline-pair">
              <div className="field">
                <label htmlFor="label">{search('relation')}</label>
                <input
                  id="label"
                  name="label"
                  list="graph-labels"
                  defaultValue={p.label ?? ''}
                  maxLength={120}
                  autoComplete="off"
                />
                <datalist id="graph-labels">
                  {relationLabels.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label htmlFor="mentions">{t('mentions')}</label>
                <select id="mentions" name="mentions" defaultValue={p.mentions ? '1' : '0'}>
                  <option value="1">{t('mentionsShow')}</option>
                  <option value="0">{t('mentionsHide')}</option>
                </select>
              </div>
            </div>
          </details>
          <button type="submit" className="btn btn-primary">
            {t('apply')}
          </button>
        </form>

        {p.center ? (
          <p className="graph-center-bar">
            {centerTitle ? t('centeredOn', { title: centerTitle }) : t('centered')}{' '}
            <Link href={`/worlds/${world.id}/snippets/${p.center}`} className="btn">
              {t('openSnippet')}
            </Link>{' '}
            <Link href={withoutCenter ? `${base}?${withoutCenter}` : base} className="btn">
              {t('removeCenter')}
            </Link>
          </p>
        ) : (
          <p className="field-hint">{t('pickHint')}</p>
        )}

        {graph ? (
          <GraphView
            worldId={world.id}
            graph={graph}
            center={p.center}
            categories={categories ?? []}
            nodeHref={nodeHref}
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
              <input type="hidden" name="kind" value="graph" />
              {p.center ? <input type="hidden" name="center" value={p.center} /> : null}
              <input type="hidden" name="depth" value={p.depth} />
              {p.label ? <input type="hidden" name="label" value={p.label} /> : null}
              {p.category ? <input type="hidden" name="category" value={p.category} /> : null}
              <input type="hidden" name="mentions" value={p.mentions ? '1' : '0'} />
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
      </section>
    </main>
  );
}
