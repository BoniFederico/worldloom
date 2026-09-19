import { Globe } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { Field } from '@/components/auth-form';
import { createClient } from '@/lib/supabase/server';
import { createWorld } from './actions';

type Props = { searchParams: Promise<{ error?: string; notice?: string }> };

export default async function WorldsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const [t, locale, { error, notice }, { data: auth }] = await Promise.all([
    getTranslations('Worlds'),
    getLocale(),
    searchParams,
    supabase.auth.getUser(),
  ]);
  const { data: memberships, error: listError } = await supabase
    .from('world_members')
    .select('role, worlds(id, name)')
    .eq('user_id', auth.user?.id ?? '');
  const worlds = (memberships ?? [])
    .flatMap((m) => (m.worlds ? [{ ...m.worlds, role: m.role }] : []))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <h1>{t('title')}</h1>
        <Feedback scope="Worlds" notice={notice} error={listError ? 'generic' : error} />

        {listError ? null : worlds.length === 0 ? (
          <div className="empty">
            <Globe size={24} aria-hidden="true" />
            <p>{t('empty')}</p>
          </div>
        ) : (
          <ul className="world-list">
            {worlds.map((w) => (
              <li key={w.id}>
                <Link href={`/worlds/${w.id}`}>{w.name}</Link>
                <span className="role">{t(`roles.${w.role}`)}</span>
              </li>
            ))}
          </ul>
        )}

        <h2>{t('createTitle')}</h2>
        <form action={createWorld} className="form form-inline">
          <Field name="name" label={t('name')} autoComplete="off" />
          <button type="submit" className="btn btn-primary">
            {t('create')}
          </button>
        </form>
      </section>
    </main>
  );
}
