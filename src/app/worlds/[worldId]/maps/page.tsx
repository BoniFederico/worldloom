import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { MAX_IMAGE_BYTES, imageSrc } from '@/lib/images/sniff';
import { loadMaps } from '@/lib/maps/load';
import { loadWorld } from '@/lib/worlds/context';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function MapsPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const query = await searchParams;
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, loaded, { data: snippets }] = await Promise.all([
    getTranslations('Maps'),
    loadMaps(supabase, worldId),
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

  return (
    <main id="main" className="page page-top">
      <section className="content content-wide">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('intro')}</p>
        <Feedback scope="Maps" notice={one(query.notice)} error={one(query.error)} />

        {!loaded ? (
          <p role="alert" className="message message-error">
            {t('loadError')}
          </p>
        ) : loaded.maps.length ? (
          <ul className="map-cards">
            {loaded.maps.map((m) => (
              <li key={m.id} className="map-card">
                <Link href={`/worlds/${world.id}/maps/${m.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- immagine privata servita dalla rotta con la sessione */}
                  <img
                    src={imageSrc(world.id, m.image)}
                    alt=""
                    className="map-card-image"
                    loading="lazy"
                  />
                  <span className="map-card-name">{m.name}</span>
                </Link>
                {m.placeTitle ? (
                  <span className="role">{t('depicts', { place: m.placeTitle })}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">{t('empty')}</p>
        )}

        {canWrite ? (
          <>
            <h2>{t('createTitle')}</h2>
            <form
              method="post"
              action={`/worlds/${world.id}/maps/upload`}
              encType="multipart/form-data"
              className="form"
            >
              <div className="field">
                <label htmlFor="map-name">{t('name')}</label>
                <input id="map-name" name="name" maxLength={80} autoComplete="off" required />
              </div>
              <div className="field">
                <label htmlFor="map-file">{t('file')}</label>
                <input
                  id="map-file"
                  name="file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  required
                  aria-describedby="map-file-hint"
                />
                <p className="field-hint" id="map-file-hint">
                  {t('fileHint', { mb: MAX_IMAGE_BYTES / (1024 * 1024) })}
                </p>
              </div>
              <div className="field">
                <label htmlFor="map-place">{t('place')}</label>
                <select id="map-place" name="place" defaultValue="">
                  <option value="">{t('noPlace')}</option>
                  {(snippets ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <p className="field-hint">{t('placeHint')}</p>
              </div>
              <button type="submit" className="btn btn-primary">
                {t('create')}
              </button>
            </form>
          </>
        ) : (
          <p className="field-hint">{t('readOnly')}</p>
        )}
      </section>
    </main>
  );
}
