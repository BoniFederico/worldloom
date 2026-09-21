import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { MapFrame } from '@/components/map-frame';
import { imageSrc } from '@/lib/images/sniff';
import { MAX_STOPS, toPercent } from '@/lib/maps/input';
import { loadMapDetail } from '@/lib/maps/load';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';
import { addPin, addRoute, deleteMap, removePin, removeRoute } from '../actions';

type Props = {
  params: Promise<{ worldId: string; mapId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Colori dei percorsi (stessi token del design system), a rotazione.
const ROUTE_COLORS = ['rust', 'ocean', 'plum', 'moss', 'brass', 'slate'];
const COLORS = new Set(['teal', 'brass', 'moss', 'rust', 'slate', 'plum', 'ocean', 'rose']);
const STOP_FIELDS = 8;

export default async function MapPage({ params, searchParams }: Props) {
  const { worldId, mapId } = await params;
  if (!uuidSchema.safeParse(mapId).success) notFound();
  const query = await searchParams;
  const categoryParam = uuidSchema.safeParse(one(query.category) ?? '');
  const category = categoryParam.success ? categoryParam.data : null;

  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, detail, { data: categories }, { data: snippets }] = await Promise.all([
    getTranslations('Maps'),
    loadMapDetail(supabase, worldId, mapId),
    supabase.from('categories').select('id, name, color').eq('world_id', worldId).order('name'),
    canWrite
      ? supabase
          .from('snippets')
          .select('id, title')
          .eq('world_id', worldId)
          .is('deleted_at', null)
          .order('title')
          .limit(500)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  if (detail === 'missing') notFound();

  if (!detail) {
    return (
      <main id="main" className="page page-top">
        <section className="content">
          <p role="alert" className="message message-error">
            {t('loadError')}
          </p>
        </section>
      </main>
    );
  }

  const { map, pins, routes } = detail;
  const shown = category ? pins.filter((p) => p.categoryIds.includes(category)) : pins;
  const byId = new Map(shown.map((p) => [p.id, p]));
  const allById = new Map(pins.map((p) => [p.id, p]));
  const colorOf = (categoryIds: string[]) => {
    const color = categories?.find((c) => categoryIds.includes(c.id))?.color;
    return color && COLORS.has(color) ? `var(--cat-${color})` : 'var(--primary)';
  };
  const routeColor = (i: number) => `var(--cat-${ROUTE_COLORS[i % ROUTE_COLORS.length]})`;
  const pinHref = (p: (typeof pins)[number]) =>
    p.placeMap
      ? `/worlds/${world.id}/maps/${p.placeMap.id}`
      : `/worlds/${world.id}/snippets/${p.snippetId}`;
  const pinLabel = (p: (typeof pins)[number]) =>
    p.placeMap ? t('pinOpensMap', { title: p.title, map: p.placeMap.name }) : p.title;

  return (
    <main id="main" className="page page-top">
      <section className="content content-wide">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}/maps`}>{t('title')}</Link>
        </p>
        <h1>{map.name}</h1>
        {detail.place ? (
          <p className="role">
            {t('depictsLink')}{' '}
            <Link href={`/worlds/${world.id}/snippets/${detail.place.id}`}>
              {detail.place.title}
            </Link>
          </p>
        ) : null}
        <Feedback scope="Maps" notice={one(query.notice)} error={one(query.error)} />

        <form method="get" className="form form-inline" aria-label={t('filters')}>
          <div className="field">
            <label htmlFor="category">{t('category')}</label>
            <select id="category" name="category" defaultValue={category ?? ''}>
              <option value="">{t('anyCategory')}</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn">
            {t('apply')}
          </button>
        </form>
        {detail.truncated ? <p className="message message-info">{t('truncated')}</p> : null}

        <MapFrame
          pick={canWrite ? { xId: 'pin-x', yId: 'pin-y', label: t('newPinSpot') } : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- immagine privata servita dalla rotta con la sessione */}
          <img
            src={imageSrc(world.id, map.image)}
            alt={t('imageAlt', { name: map.name })}
            className="map-image"
          />
          <svg
            className="map-routes"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {routes.map((r, i) => {
              const points = r.stops.flatMap((s) => {
                const p = byId.get(s);
                return p ? [`${p.x * 100},${p.y * 100}`] : [];
              });
              return points.length >= 2 ? (
                <polyline
                  key={r.id}
                  points={points.join(' ')}
                  className="map-route"
                  style={{ stroke: routeColor(i) }}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null;
            })}
          </svg>
          <ul className="map-pins" aria-label={t('pinsLabel')}>
            {shown.map((p) => (
              <li key={p.id} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}>
                <a href={pinHref(p)} className="map-pin" aria-label={pinLabel(p)}>
                  <span
                    className={p.placeMap ? 'map-marker map-marker-nested' : 'map-marker'}
                    style={{ background: colorOf(p.categoryIds) }}
                    aria-hidden="true"
                  />
                  <span className="map-pin-label">{p.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </MapFrame>
        {canWrite ? <p className="field-hint">{t('clickHint')}</p> : null}

        {routes.length ? (
          <ul className="graph-legend" aria-label={t('routesLegend')}>
            {routes.map((r, i) => (
              <li key={r.id}>
                <span
                  className="graph-swatch"
                  style={{ background: routeColor(i) }}
                  aria-hidden="true"
                />
                {r.name}
              </li>
            ))}
          </ul>
        ) : null}

        <h2>{t('pinsTitle')}</h2>
        {shown.length ? (
          <div className="table-scroll" tabIndex={0} role="region" aria-label={t('pinsScroll')}>
            <table className="data-table">
              <caption className="sr-only">{t('pinsCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('place')}</th>
                  <th scope="col">{t('position')}</th>
                  <th scope="col">{t('opens')}</th>
                  {canWrite ? (
                    <th scope="col">
                      <span className="sr-only">{t('actions')}</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">
                      <Link href={`/worlds/${world.id}/snippets/${p.snippetId}`}>{p.title}</Link>
                    </th>
                    <td>{t('positionValue', { x: toPercent(p.x), y: toPercent(p.y) })}</td>
                    <td>
                      {p.placeMap ? (
                        <Link href={`/worlds/${world.id}/maps/${p.placeMap.id}`}>
                          {p.placeMap.name}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    {canWrite ? (
                      <td>
                        <form action={removePin}>
                          <input type="hidden" name="world" value={world.id} />
                          <input type="hidden" name="map" value={map.id} />
                          <input type="hidden" name="pin" value={p.id} />
                          <button type="submit" className="btn btn-danger">
                            {t('removePin')}
                            <span className="sr-only"> {p.title}</span>
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">{t('noPins')}</p>
        )}

        <h2>{t('routesTitle')}</h2>
        {routes.length ? (
          <ol className="routes-list">
            {routes.map((r) => {
              const names = r.stops.flatMap((s) => {
                const p = allById.get(s);
                return p ? [p.title] : [];
              });
              return (
                <li key={r.id}>
                  <strong>{r.name}</strong>: {names.join(' → ')}
                  {canWrite ? (
                    <form action={removeRoute}>
                      <input type="hidden" name="world" value={world.id} />
                      <input type="hidden" name="map" value={map.id} />
                      <input type="hidden" name="route" value={r.id} />
                      <button type="submit" className="btn btn-danger">
                        {t('removeRoute')}
                        <span className="sr-only"> {r.name}</span>
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="empty">{t('noRoutes')}</p>
        )}

        {canWrite ? (
          <>
            <h2>{t('addPinTitle')}</h2>
            <form action={addPin} className="form">
              <input type="hidden" name="world" value={world.id} />
              <input type="hidden" name="map" value={map.id} />
              <div className="field">
                <label htmlFor="pin-snippet">{t('place')}</label>
                <select id="pin-snippet" name="snippet" defaultValue="" required>
                  <option value="" disabled>
                    {t('choosePlace')}
                  </option>
                  {(snippets ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-inline-pair">
                <div className="field">
                  <label htmlFor="pin-x">{t('xPercent')}</label>
                  <input id="pin-x" name="x" inputMode="decimal" autoComplete="off" required />
                </div>
                <div className="field">
                  <label htmlFor="pin-y">{t('yPercent')}</label>
                  <input id="pin-y" name="y" inputMode="decimal" autoComplete="off" required />
                </div>
              </div>
              <p className="field-hint">{t('coordinatesHint')}</p>
              <button type="submit" className="btn btn-primary">
                {t('addPin')}
              </button>
            </form>

            {pins.length >= 2 ? (
              <>
                <h2>{t('addRouteTitle')}</h2>
                <form action={addRoute} className="form">
                  <input type="hidden" name="world" value={world.id} />
                  <input type="hidden" name="map" value={map.id} />
                  <div className="field">
                    <label htmlFor="route-name">{t('routeName')}</label>
                    <input id="route-name" name="name" maxLength={80} autoComplete="off" required />
                  </div>
                  {Array.from({ length: Math.min(STOP_FIELDS, MAX_STOPS) }, (_, i) => (
                    <div className="field" key={i}>
                      <label htmlFor={`stop-${i}`}>{t('stop', { n: i + 1 })}</label>
                      <select id={`stop-${i}`} name="stop" defaultValue="">
                        <option value="">—</option>
                        {pins.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <p className="field-hint">{t('routeHint')}</p>
                  <button type="submit" className="btn btn-primary">
                    {t('addRoute')}
                  </button>
                </form>
              </>
            ) : null}

            <h2>{t('manage')}</h2>
            <form action={deleteMap} className="form">
              <input type="hidden" name="world" value={world.id} />
              <input type="hidden" name="map" value={map.id} />
              <label className="check">
                <input type="checkbox" name="confirm" />
                {t('confirmDelete')}
              </label>
              <button type="submit" className="btn btn-danger">
                {t('delete')}
              </button>
            </form>
            <p className="field-hint">{t('deleteHint')}</p>
          </>
        ) : null}
      </section>
    </main>
  );
}
