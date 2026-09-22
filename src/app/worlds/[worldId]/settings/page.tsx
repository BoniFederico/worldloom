import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/worlds/schemas';
import { deleteWorld, publishWiki, renameWorld, unpublishWiki } from '../../actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function WorldSettingsPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  if (!uuidSchema.safeParse(worldId).success) notFound();

  const supabase = await createClient();
  const [t, { error, notice }, { data: world }] = await Promise.all([
    getTranslations('Worlds'),
    searchParams,
    supabase.from('worlds').select('id, name, owner_id, wiki_slug').eq('id', worldId).maybeSingle(),
  ]);
  const { data: auth } = await supabase.auth.getUser();
  // Solo il proprietario vede le impostazioni: per gli altri la pagina non esiste.
  if (!world || world.owner_id !== auth.user?.id) notFound();

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('settings')}</h1>
        <Feedback scope="Worlds" notice={notice} error={error} />

        <form action={renameWorld} className="form form-inline">
          <input type="hidden" name="id" value={world.id} />
          <div className="field">
            <label htmlFor="name">{t('name')}</label>
            <input
              id="name"
              name="name"
              defaultValue={world.name}
              autoComplete="off"
              maxLength={120}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">
            {t('rename')}
          </button>
        </form>

        <h2>{t('wikiTitle')}</h2>
        {world.wiki_slug ? (
          <>
            <p>
              {t('wikiPublished')}{' '}
              <Link href={`/w/${world.wiki_slug}`}>{`/w/${world.wiki_slug}`}</Link>
            </p>
            <form action={unpublishWiki} className="form-inline">
              <input type="hidden" name="id" value={world.id} />
              <button type="submit" className="btn">
                {t('wikiUnpublish')}
              </button>
            </form>
          </>
        ) : (
          <>
            <p>{t('wikiExplain')}</p>
            <form action={publishWiki} className="form form-inline">
              <input type="hidden" name="id" value={world.id} />
              <div className="field">
                <label htmlFor="wikiSlug">{t('wikiSlug')}</label>
                <input
                  id="wikiSlug"
                  name="wikiSlug"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  minLength={3}
                  maxLength={60}
                  required
                  autoComplete="off"
                />
              </div>
              <button type="submit" className="btn btn-primary">
                {t('wikiPublish')}
              </button>
            </form>
          </>
        )}

        <h2>{t('dangerTitle')}</h2>
        <form action={deleteWorld} className="form danger-zone">
          <input type="hidden" name="id" value={world.id} />
          <p>{t('deleteWarning')}</p>
          <label className="check">
            <input type="checkbox" name="confirm" />
            {t('deleteConfirm', { name: world.name })}
          </label>
          <button type="submit" className="btn btn-danger">
            {t('delete')}
          </button>
        </form>
      </section>
    </main>
  );
}
