import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/worlds/schemas';
import { deleteWorld, renameWorld } from '../../actions';

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
    supabase.from('worlds').select('id, name, owner_id').eq('id', worldId).maybeSingle(),
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
