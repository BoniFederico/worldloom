import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { loadCampaign } from '@/lib/campaigns/load';
import { loadEncounters } from '@/lib/encounters/load';
import { createEncounter } from './actions';

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function EncountersPage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const { supabase, campaign, canManage } = await loadCampaign(campaignId);
  const [t, { error, notice }, encounters] = await Promise.all([
    getTranslations('Encounters'),
    searchParams,
    loadEncounters(supabase, campaignId),
  ]);

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <Feedback scope="Encounters" notice={notice} error={error} />

        {encounters.length ? (
          <ol className="sessions-list">
            {encounters.map((e) => (
              <li key={e.id}>
                <Link href={`/campaigns/${campaign.id}/encounters/${e.id}`}>
                  {e.name || t('unnamed')}
                </Link>
                <span className="role"> {t('roundOf', { round: e.round })}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">{t('empty')}</p>
        )}

        {canManage ? (
          <>
            <h2>{t('newTitle')}</h2>
            <form action={createEncounter} className="form form-inline">
              <input type="hidden" name="campaign" value={campaign.id} />
              <div className="field">
                <label htmlFor="new-encounter-name">{t('name')}</label>
                <input id="new-encounter-name" name="name" maxLength={120} autoComplete="off" />
              </div>
              <button type="submit" className="btn btn-primary">
                {t('create')}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
