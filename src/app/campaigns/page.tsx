import { Swords } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { Field } from '@/components/auth-form';
import { createClient } from '@/lib/supabase/server';
import { createCampaign } from './actions';

type Props = { searchParams: Promise<{ error?: string; notice?: string }> };

export default async function CampaignsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const [t, locale, { error, notice }, { data: auth }] = await Promise.all([
    getTranslations('Campaigns'),
    getLocale(),
    searchParams,
    supabase.auth.getUser(),
  ]);
  const userId = auth.user?.id ?? '';
  const [{ data: memberships, error: listError }, { data: worldRows }] = await Promise.all([
    supabase
      .from('campaign_members')
      .select('role, campaigns(id, name, world_id)')
      .eq('user_id', userId),
    supabase.from('world_members').select('worlds(id, name)').eq('user_id', userId),
  ]);
  const worlds = (worldRows ?? [])
    .flatMap((m) => (m.worlds ? [m.worlds] : []))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const worldName = new Map(worlds.map((w) => [w.id, w.name]));
  const campaigns = (memberships ?? [])
    .flatMap((m) => (m.campaigns ? [{ ...m.campaigns, role: m.role }] : []))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <h1>{t('title')}</h1>
        <p className="lead">{t('intro')}</p>
        <Feedback scope="Campaigns" notice={notice} error={listError ? 'generic' : error} />

        {listError ? null : campaigns.length === 0 ? (
          <div className="empty">
            <Swords size={24} aria-hidden="true" />
            <p>{t('empty')}</p>
          </div>
        ) : (
          <ul className="world-list">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link href={`/campaigns/${c.id}`}>{c.name}</Link>
                <span className="role">
                  {t(`roles.${c.role}`)} ·{' '}
                  {c.world_id && worldName.has(c.world_id)
                    ? t('linkedTo', { name: worldName.get(c.world_id) ?? '' })
                    : c.world_id
                      ? t('linkedOther')
                      : t('standalone')}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h2>{t('createTitle')}</h2>
        <form action={createCampaign} className="form">
          <Field name="name" label={t('name')} autoComplete="off" />
          <div className="field">
            <label htmlFor="description">{t('description')}</label>
            <textarea id="description" name="description" rows={3} maxLength={2000} />
          </div>
          <div className="field">
            <label htmlFor="world">{t('world')}</label>
            <select id="world" name="world" defaultValue="" aria-describedby="world-hint">
              <option value="">{t('noWorld')}</option>
              {worlds.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <p className="field-hint" id="world-hint">
              {t('worldHint')}
            </p>
          </div>
          <button type="submit" className="btn btn-primary">
            {t('create')}
          </button>
        </form>
      </section>
    </main>
  );
}
