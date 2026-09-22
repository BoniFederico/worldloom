import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { loadCampaign } from '@/lib/campaigns/load';
import { loadSessions } from '@/lib/sessions/load';
import { createSession } from './actions';

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function SessionsPage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const { supabase, campaign, canManage } = await loadCampaign(campaignId);
  const [t, format, { error, notice }, sessions] = await Promise.all([
    getTranslations('Sessions'),
    getFormatter(),
    searchParams,
    loadSessions(supabase, campaignId),
  ]);

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <Feedback scope="Sessions" notice={notice} error={error} />

        {sessions.length ? (
          <ol className="sessions-list">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/campaigns/${campaign.id}/sessions/${s.id}`}>
                  {t('number', { number: s.number })}
                  {s.title ? ` — ${s.title}` : ''}
                </Link>
                {s.played_on ? (
                  <span className="role">
                    {' '}
                    {format.dateTime(new Date(`${s.played_on}T00:00:00`), { dateStyle: 'long' })}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty">{t('empty')}</p>
        )}

        {canManage ? (
          <>
            <h2>{t('newTitle')}</h2>
            <form action={createSession} className="form">
              <input type="hidden" name="campaign" value={campaign.id} />
              <div className="field">
                <label htmlFor="new-title">{t('sessionTitle')}</label>
                <input id="new-title" name="title" maxLength={150} />
                <span className="field-hint">{t('titleHint')}</span>
              </div>
              <div className="field">
                <label htmlFor="new-played-on">{t('playedOn')}</label>
                <input id="new-played-on" name="played_on" type="date" />
              </div>
              <div className="field">
                <label htmlFor="new-summary">{t('summary')}</label>
                <textarea id="new-summary" name="summary" rows={4} maxLength={10000} />
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
