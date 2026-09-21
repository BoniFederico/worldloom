import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/worlds/schemas';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ notice?: string }>;
};

export default async function WorldPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const { notice } = await searchParams;
  if (!uuidSchema.safeParse(worldId).success) notFound();

  const supabase = await createClient();
  const [t, { data: world }, { data: auth }] = await Promise.all([
    getTranslations('Worlds'),
    supabase.from('worlds').select('id, name').eq('id', worldId).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  if (!world) notFound();

  const { data: membership } = await supabase
    .from('world_members')
    .select('role')
    .eq('world_id', worldId)
    .eq('user_id', auth.user?.id ?? '')
    .maybeSingle();

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href="/worlds">{t('title')}</Link>
        </p>
        <h1>{world.name}</h1>
        <Feedback scope="Worlds" notice={notice} />
        <p className="role">{membership ? t(`roles.${membership.role}`) : null}</p>
        <p className="lead">{t('overviewEmpty')}</p>
        <p>
          <Link href={`/worlds/${world.id}/members`} className="btn">
            {t('members')}
          </Link>
        </p>
        <p>
          <Link href={`/worlds/${world.id}/search`} className="btn">
            {t('search')}
          </Link>
        </p>
        <p>
          <Link href={`/worlds/${world.id}/snippets`} className="btn btn-primary">
            {t('snippets')}
          </Link>
        </p>
        <p>
          <Link href={`/worlds/${world.id}/views`} className="btn">
            {t('views')}
          </Link>
        </p>
        <p>
          <Link href={`/worlds/${world.id}/relation-types`} className="btn">
            {t('relationTypes')}
          </Link>
        </p>
        <p>
          <Link href={`/worlds/${world.id}/categories`} className="btn">
            {t('categories')}
          </Link>
        </p>
        <p>
          <a href={`/worlds/${world.id}/export`} className="btn" download>
            {t('exportJson')}
          </a>
        </p>
        {membership?.role === 'owner' ? (
          <p>
            <Link href={`/worlds/${world.id}/settings`} className="btn">
              {t('settings')}
            </Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
