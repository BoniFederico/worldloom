import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { TreeView } from '@/components/tree-view';
import { topLabels } from '@/lib/relations/input';
import { loadTree } from '@/lib/tree/load';
import { parseTreeParams } from '@/lib/tree/params';
import { loadWorld } from '@/lib/worlds/context';
import { saveView } from '../views/actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TreePage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const raw = await searchParams;
  const p = parseTreeParams(raw);
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, search, data, { data: labels }] = await Promise.all([
    getTranslations('Tree'),
    getTranslations('Search'),
    loadTree(supabase, worldId, p),
    supabase
      .from('relations')
      .select('label, inverse_label')
      .eq('world_id', worldId)
      .eq('from_mention', false)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);
  const suggestions = topLabels([
    ...(labels ?? []).map((r) => r.label),
    ...(labels ?? []).map((r) => r.inverse_label),
  ]);
  const errorKey = typeof raw.error === 'string' ? raw.error : undefined;

  return (
    <main id="main" className="page page-top">
      <section className="content content-wide">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('intro')}</p>
        <Feedback scope="Search" error={errorKey} />

        <form method="get" className="form" aria-label={t('settings')}>
          <div className="field">
            <label htmlFor="label">{t('label')}</label>
            <input
              id="label"
              name="label"
              list="tree-labels"
              defaultValue={p.label ?? ''}
              maxLength={120}
              autoComplete="off"
              required
              aria-describedby="label-hint"
            />
            <datalist id="tree-labels">
              {suggestions.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
            <p className="field-hint" id="label-hint">
              {t('labelHint')}
            </p>
          </div>
          <div className="form-inline-pair">
            <div className="field">
              <label htmlFor="root">{t('root')}</label>
              <input
                id="root"
                name="root"
                defaultValue={p.root ?? ''}
                maxLength={120}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="dir">{t('direction')}</label>
              <select id="dir" name="dir" defaultValue={p.dir}>
                <option value="down">{t('down')}</option>
                <option value="up">{t('up')}</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            {t('apply')}
          </button>
        </form>

        {!p.label ? (
          <p className="field-hint">{t('pickHint')}</p>
        ) : !data ? (
          <p role="alert" className="message message-error">
            {t('loadError')}
          </p>
        ) : data.rootMissing ? (
          <p className="message message-info">{t('rootMissing', { title: p.root ?? '' })}</p>
        ) : data.forest.roots.length === 0 ? (
          <p className="empty">{t('empty', { label: p.label })}</p>
        ) : (
          <>
            {data.edgesTruncated ? (
              <p className="message message-info">{t('edgesTruncated')}</p>
            ) : null}
            <TreeView worldId={world.id} forest={data.forest} />
          </>
        )}

        {canWrite && p.label ? (
          <details className="field-edit">
            <summary>{search('saveView')}</summary>
            <form action={saveView} className="form">
              <input type="hidden" name="world" value={world.id} />
              <input type="hidden" name="kind" value="tree" />
              <input type="hidden" name="label" value={p.label} />
              <input type="hidden" name="dir" value={p.dir} />
              {p.root ? <input type="hidden" name="root" value={p.root} /> : null}
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
