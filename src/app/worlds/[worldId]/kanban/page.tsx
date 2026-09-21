import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { KanbanBoard } from '@/components/kanban-board';
import { loadBoard, loadChoiceFields } from '@/lib/kanban/load';
import { parseKanbanParams } from '@/lib/kanban/params';
import { loadWorld } from '@/lib/worlds/context';
import { saveView } from '../views/actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function KanbanPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const raw = await searchParams;
  const p = parseKanbanParams(raw);
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, search, choice] = await Promise.all([
    getTranslations('Kanban'),
    getTranslations('Search'),
    loadChoiceFields(supabase, worldId),
  ]);
  const data = choice ? await loadBoard(supabase, worldId, p, choice.fields) : null;
  const label = (value: string | null) =>
    value === null
      ? t('none')
      : p.by === 'status' && (value === 'draft' || value === 'final')
        ? t(`status.${value}`)
        : value;

  return (
    <main id="main" className="page page-top">
      <section className="content content-wide">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('intro')}</p>
        <Feedback scope="Kanban" notice={one(raw.notice)} error={one(raw.error)} />

        <form method="get" className="form" aria-label={t('settings')}>
          <div className="form-inline-pair">
            <div className="field">
              <label htmlFor="by">{t('by')}</label>
              <select id="by" name="by" defaultValue={p.by ?? ''} required>
                <option value="" disabled>
                  {t('pick')}
                </option>
                <option value="status">{t('statusField')}</option>
                {(choice?.fields ?? []).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="category">{t('category')}</label>
              <select id="category" name="category" defaultValue={p.category ?? ''}>
                <option value="">{t('anyCategory')}</option>
                {(choice?.categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            {t('apply')}
          </button>
        </form>

        {!choice ? (
          <p role="alert" className="message message-error">
            {t('loadError')}
          </p>
        ) : !p.by ? (
          <p className="field-hint">{t(choice.fields.length ? 'pickHint' : 'pickHintNoFields')}</p>
        ) : !data ? (
          <p role="alert" className="message message-error">
            {t('loadOrFieldError')}
          </p>
        ) : (
          <>
            {data.truncated ? <p className="message message-info">{t('truncated')}</p> : null}
            <KanbanBoard
              worldId={world.id}
              board={data.board}
              by={p.by}
              category={p.category}
              label={label}
              canWrite={canWrite}
            />
          </>
        )}

        {canWrite && p.by && data ? (
          <details className="field-edit">
            <summary>{search('saveView')}</summary>
            <form action={saveView} className="form">
              <input type="hidden" name="world" value={world.id} />
              <input type="hidden" name="kind" value="kanban" />
              <input type="hidden" name="by" value={p.by} />
              {p.category ? <input type="hidden" name="category" value={p.category} /> : null}
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
