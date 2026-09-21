import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { formatDate } from '@/lib/calendars/calendar';
import { layoutTimeline, MARGIN, sortEvents } from '@/lib/timeline/layout';
import type { TimelineData } from '@/lib/timeline/load';
import { MAX_ZOOM, type TimelineParams } from '@/lib/timeline/params';

// Colori ammessi per le categorie (stessi token del design system); qualsiasi altro valore ricade sul colore primario.
const COLORS = new Set(['teal', 'brass', 'moss', 'rust', 'slate', 'plum', 'ocean', 'rose']);

const WIDTH = 960;
const AXIS = 34;
const LANE_HEAD = 24;
const ROW = 28;
const LANE_GAP = 10;

type Props = {
  worldId: string;
  data: TimelineData;
  params: TimelineParams;
  /** Indirizzo della stessa timeline con alcuni parametri cambiati (un normale link: funziona senza JavaScript). */
  href: (patch: Partial<TimelineParams>) => string;
};

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * Timeline disegnata sul server come SVG (nessuna libreria nel browser). Ogni evento è un link allo snippet; zoom e
 * spostamento sono link che cambiano finestra e centro. L'alternativa testuale è la tabella cronologica sotto il
 * disegno, con gli stessi eventi (anche quelli fuori dalla finestra).
 */
export async function TimelineView({ worldId, data, params, href }: Props) {
  const t = await getTranslations('Timeline');
  const { calendar } = data;
  if (!calendar || !data.startKey) return null;

  const categoryNames = new Map(data.categories.map((c) => [c.id, c.name]));
  const colorOf = (categoryId: string | null) => {
    const color = data.categories.find((c) => c.id === categoryId)?.color;
    return color && COLORS.has(color) ? `var(--cat-${color})` : 'var(--primary)';
  };
  const layout = layoutTimeline(calendar.calendar, data.events, {
    lane: params.lane,
    zoom: params.zoom,
    center: params.center,
    width: WIDTH,
    categoryNames,
    noLaneLabel: params.lane === 'tag' ? t('noTag') : t('noCategory'),
  });
  const middle = Math.round((layout.range.from + layout.range.to) / 2);
  const span = layout.range.to - layout.range.from;

  const laneHeights = layout.lanes.map((lane) => LANE_HEAD + lane.rows * ROW + LANE_GAP);
  const laneTops = laneHeights.map((_, i) =>
    laneHeights.slice(0, i).reduce((sum, h) => sum + h, AXIS),
  );
  const height = Math.max(
    laneHeights.reduce((sum, h) => sum + h, AXIS),
    AXIS + 40,
  );
  const titles = new Map(data.events.map((e) => [e.id, e]));
  const sorted = sortEvents(calendar.calendar, data.events);
  const laneNames = (id: string) => {
    const event = titles.get(id);
    if (!event) return '';
    if (params.lane === 'tag') return event.tags.join(', ');
    return event.categoryIds
      .map((c) => categoryNames.get(c))
      .filter(Boolean)
      .join(', ');
  };
  const usedCategories = data.categories.filter((c) =>
    layout.lanes.some((l) => l.events.some((e) => e.categoryId === c.id)),
  );

  return (
    <div>
      <p className="role" aria-live="polite">
        {t('count', { shown: layout.total - layout.hidden, total: layout.total })}
      </p>
      {layout.hidden ? (
        <p className="message message-info">{t('hidden', { count: layout.hidden })}</p>
      ) : null}
      {data.truncated ? <p className="message message-info">{t('truncated')}</p> : null}
      {data.skipped ? (
        <p className="message message-info">{t('skipped', { count: data.skipped })}</p>
      ) : null}
      {layout.lanesTruncated ? <p className="message message-info">{t('lanesTruncated')}</p> : null}

      {layout.total === 0 ? (
        <p className="empty">{t('empty')}</p>
      ) : (
        <>
          <nav className="timeline-controls" aria-label={t('controls')}>
            {params.zoom > 0 ? (
              <>
                <Link
                  className="btn"
                  href={href({ center: Math.round(middle - span / 2), zoom: params.zoom })}
                  rel="prev"
                >
                  {t('panBack')}
                </Link>
                <Link
                  className="btn"
                  href={href({ center: Math.round(middle + span / 2), zoom: params.zoom })}
                >
                  {t('panForward')}
                </Link>
              </>
            ) : null}
            {params.zoom < MAX_ZOOM ? (
              <Link className="btn" href={href({ zoom: params.zoom + 1, center: middle })}>
                {t('zoomIn')}
              </Link>
            ) : (
              <span className="btn btn-disabled" aria-disabled="true">
                {t('zoomIn')}
              </span>
            )}
            {params.zoom > 0 ? (
              <Link
                className="btn"
                href={href({ zoom: params.zoom - 1, center: params.zoom === 1 ? null : middle })}
              >
                {t('zoomOut')}
              </Link>
            ) : (
              <span className="btn btn-disabled" aria-disabled="true">
                {t('zoomOut')}
              </span>
            )}
            <Link className="btn" href={href({ zoom: 0, center: null })}>
              {t('reset')}
            </Link>
          </nav>

          <div className="timeline-scroll" tabIndex={0} role="region" aria-label={t('scroll')}>
            <svg
              className="timeline"
              viewBox={`0 0 ${WIDTH} ${height}`}
              role="group"
              aria-labelledby="timeline-title timeline-desc"
            >
              <title id="timeline-title">{t('svgTitle')}</title>
              <desc id="timeline-desc">{t('svgDesc')}</desc>
              <g className="timeline-axis">
                {layout.ticks.map((tick, i) => (
                  <g key={i}>
                    <line
                      x1={tick.x}
                      x2={tick.x}
                      y1={AXIS - 6}
                      y2={height}
                      className="timeline-tick"
                    />
                    <text x={tick.x + 3} y={AXIS - 12} className="timeline-tick-label">
                      {tick.label}
                    </text>
                  </g>
                ))}
              </g>
              {layout.lanes.map((lane, li) => {
                const y0 = laneTops[li] ?? 0;
                return (
                  <g key={lane.key} className="timeline-lane">
                    <rect
                      x={0}
                      y={y0}
                      width={WIDTH}
                      height={LANE_HEAD + lane.rows * ROW + LANE_GAP - 2}
                      className={li % 2 ? 'timeline-band timeline-band-alt' : 'timeline-band'}
                    />
                    <text x={MARGIN - 12} y={y0 + 16} className="timeline-lane-label">
                      {truncate(lane.label, 40)}
                    </text>
                    {lane.events.map((e) => {
                      const cy = y0 + LANE_HEAD + e.row * ROW + ROW / 2 - 2;
                      const color = colorOf(e.categoryId);
                      const label = e.endLabel
                        ? t('intervalLabel', {
                            title: e.title,
                            start: e.startLabel,
                            end: e.endLabel,
                          })
                        : t('pointLabel', { title: e.title, start: e.startLabel });
                      const labelWidth = Math.min(30, e.title.length) * 7;
                      // Vicino al bordo destro l'etichetta passa a sinistra dell'evento, per non essere tagliata.
                      const flip = (e.x2 ?? e.x) + 10 + labelWidth > WIDTH - 4;
                      const right = flip ? e.x - 10 : (e.x2 ?? e.x) + 10;
                      return (
                        <a
                          key={e.id}
                          href={`/worlds/${worldId}/snippets/${e.id}`}
                          className="timeline-event"
                          aria-label={label}
                        >
                          <title>{label}</title>
                          {e.x2 !== null ? (
                            <rect
                              x={e.x}
                              y={cy - 6}
                              width={Math.max(4, e.x2 - e.x)}
                              height={12}
                              rx={6}
                              fill={color}
                            />
                          ) : (
                            <circle cx={e.x} cy={cy} r={6} fill={color} />
                          )}
                          <text
                            x={right}
                            y={cy + 4}
                            textAnchor={flip ? 'end' : 'start'}
                            className="timeline-event-label"
                          >
                            {truncate(e.title, 30)}
                          </text>
                        </a>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>

          {usedCategories.length ? (
            <ul className="graph-legend" aria-label={t('legend')}>
              {usedCategories.map((c) => (
                <li key={c.id}>
                  <span
                    className="graph-swatch"
                    style={{ background: colorOf(c.id) }}
                    aria-hidden="true"
                  />
                  {c.name}
                </li>
              ))}
            </ul>
          ) : null}

          <h2>{t('tableTitle')}</h2>
          <p className="field-hint">{t('tableHint')}</p>
          <div className="table-scroll" tabIndex={0} role="region" aria-label={t('tableScroll')}>
            <table className="data-table">
              <caption className="sr-only">{t('tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('event')}</th>
                  <th scope="col">{t('start')}</th>
                  <th scope="col">{t('end')}</th>
                  <th scope="col">{params.lane === 'tag' ? t('tags') : t('categories')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ event }) => (
                  <tr key={event.id}>
                    <th scope="row">
                      <Link href={`/worlds/${worldId}/snippets/${event.id}`}>{event.title}</Link>
                    </th>
                    <td>{formatDate(calendar.calendar, event.start)}</td>
                    <td>{event.end ? formatDate(calendar.calendar, event.end) : '—'}</td>
                    <td>{laneNames(event.id) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
