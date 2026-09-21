import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { loadWorld } from '@/lib/worlds/context';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function ViewsPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const { error, notice } = await searchParams;
  const { supabase, world } = await loadWorld(worldId);
  const [t, { data: views }] = await Promise.all([
    getTranslations('Views'),
    // La RLS mostra le viste condivise e quelle create da chi guarda.
    supabase
      .from('saved_views')
      .select('id, name, kind, shared, created_by')
      .eq('world_id', worldId)
      .order('name'),
  ]);
  const { data: auth } = await supabase.auth.getUser();

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <Feedback scope="Views" notice={notice} error={error} />
        {views?.length ? (
          <ul className="world-list">
            {views.map((v) => (
              <li key={v.id}>
                <Link href={`/worlds/${world.id}/views/${v.id}`}>{v.name}</Link>
                <span className="role">
                  {t(`kind.${v.kind}`)} · {v.shared ? t('shared') : t('private')}
                  {v.created_by === auth.user?.id ? ` · ${t('mine')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty">
            <p>{t('empty')}</p>
          </div>
        )}
        <p>
          <Link href={`/worlds/${world.id}/search`} className="btn">
            {t('newFromSearch')}
          </Link>{' '}
          <Link href={`/worlds/${world.id}/table`} className="btn">
            {t('newTable')}
          </Link>{' '}
          <Link href={`/worlds/${world.id}/graph`} className="btn">
            {t('newGraph')}
          </Link>{' '}
          <Link href={`/worlds/${world.id}/timeline`} className="btn">
            {t('newTimeline')}
          </Link>{' '}
          <Link href={`/worlds/${world.id}/tree`} className="btn">
            {t('newTree')}
          </Link>
        </p>
      </section>
    </main>
  );
}
