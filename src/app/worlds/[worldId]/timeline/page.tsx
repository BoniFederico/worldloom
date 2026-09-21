import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { TimelineView } from '@/components/timeline-view';
import { loadTimeline } from '@/lib/timeline/load';
import { parseTimelineParams, timelineQuery, type TimelineParams } from '@/lib/timeline/params';
import { loadWorld } from '@/lib/worlds/context';
import { saveView } from '../views/actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimelinePage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const raw = await searchParams;
  const p = parseTimelineParams(raw);
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, search, data] = await Promise.all([
    getTranslations('Timeline'),
    getTranslations('Search'),
    loadTimeline(supabase, worldId, p),
  ]);
  const base = `/worlds/${world.id}/timeline`;
  const href = (patch: Partial<TimelineParams>) => {
    const qs = timelineQuery({
      ...p,
      calendar: data?.calendar?.id ?? p.calendar,
      start: data?.startKey ?? p.start,
      end: data?.endKey ?? p.end,
      ...patch,
    });
    return qs ? `${base}?${qs}` : base;
  };
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

        {!data ? (
          <p role="alert" className="message message-error">
            {t('loadError')}
          </p>
        ) : !data.calendars.length ? (
          <p className="empty">
            {t('noCalendars')}{' '}
            <Link href={`/worlds/${world.id}/calendars`}>{t('manageCalendars')}</Link>
          </p>
        ) : !data.dateFields.length ? (
          <p className="empty">
            {t('noFields')}{' '}
            <Link href={`/worlds/${world.id}/categories`}>{t('manageCategories')}</Link>
          </p>
        ) : (
          <>
            <form method="get" className="form" aria-label={t('settings')}>
              <details className="field-edit" open>
                <summary>{t('settings')}</summary>
                <div className="form-inline-pair">
                  <div className="field">
                    <label htmlFor="calendar">{t('calendar')}</label>
                    <select id="calendar" name="calendar" defaultValue={data.calendar?.id ?? ''}>
                      {data.calendars.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="lane">{t('lane')}</label>
                    <select id="lane" name="lane" defaultValue={p.lane}>
                      <option value="category">{t('laneCategory')}</option>
                      <option value="tag">{t('laneTag')}</option>
                    </select>
                  </div>
                </div>
                <div className="form-inline-pair">
                  <div className="field">
                    <label htmlFor="start">{t('startField')}</label>
                    <select id="start" name="start" defaultValue={data.startKey ?? ''}>
                      {data.dateFields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="end">{t('endField')}</label>
                    <select id="end" name="end" defaultValue={data.endKey ?? ''}>
                      <option value="">{t('endNone')}</option>
                      {data.dateFields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-inline-pair">
                  <div className="field">
                    <label htmlFor="category">{search('category')}</label>
                    <select id="category" name="category" defaultValue={p.category ?? ''}>
                      <option value="">{search('any')}</option>
                      {data.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="tag">{t('tag')}</label>
                    <input
                      id="tag"
                      name="tag"
                      defaultValue={p.tag ?? ''}
                      maxLength={60}
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="related">{t('related')}</label>
                  <input
                    id="related"
                    name="related"
                    defaultValue={p.related ?? ''}
                    maxLength={120}
                    autoComplete="off"
                    aria-describedby="related-hint"
                  />
                  <p className="field-hint" id="related-hint">
                    {t('relatedHint')}
                  </p>
                </div>
              </details>
              <button type="submit" className="btn btn-primary">
                {t('apply')}
              </button>
            </form>

            {data.relatedMissing ? (
              <p className="message message-info">
                {t('relatedMissing', { title: p.related ?? '' })}
              </p>
            ) : null}
            <TimelineView worldId={world.id} data={data} params={p} href={href} />

            {canWrite ? (
              <details className="field-edit">
                <summary>{search('saveView')}</summary>
                <form action={saveView} className="form">
                  <input type="hidden" name="world" value={world.id} />
                  <input type="hidden" name="kind" value="timeline" />
                  <input type="hidden" name="calendar" value={data.calendar?.id ?? ''} />
                  <input type="hidden" name="start" value={data.startKey ?? ''} />
                  <input type="hidden" name="end" value={data.endKey ?? ''} />
                  <input type="hidden" name="lane" value={p.lane} />
                  {p.category ? <input type="hidden" name="category" value={p.category} /> : null}
                  {p.tag ? <input type="hidden" name="tag" value={p.tag} /> : null}
                  {p.related ? <input type="hidden" name="related" value={p.related} /> : null}
                  <input type="hidden" name="zoom" value={p.zoom} />
                  {p.center !== null ? (
                    <input type="hidden" name="center" value={p.center} />
                  ) : null}
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
          </>
        )}
      </section>
    </main>
  );
}
