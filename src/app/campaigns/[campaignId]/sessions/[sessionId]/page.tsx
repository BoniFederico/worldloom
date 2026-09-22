import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { loadCampaign } from '@/lib/campaigns/load';
import { loadNames } from '@/lib/sessions/load';
import { uuidSchema } from '@/lib/worlds/schemas';
import {
  deleteSession,
  linkSessionSnippet,
  saveDmNotes,
  savePlayerNotes,
  unlinkSessionSnippet,
  updateSession,
} from '../actions';

type Props = {
  params: Promise<{ campaignId: string; sessionId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function SessionPage({ params, searchParams }: Props) {
  const { campaignId, sessionId } = await params;
  if (!uuidSchema.safeParse(sessionId).success) notFound();
  const { supabase, campaign, canManage, role, userId } = await loadCampaign(campaignId);
  const [t, tv, format, { error, notice }] = await Promise.all([
    getTranslations('Sessions'),
    getTranslations('Visibility'),
    getFormatter(),
    searchParams,
  ]);

  const { data: session } = await supabase
    .from('campaign_sessions')
    .select('id, number, title, played_on, summary')
    .eq('id', sessionId)
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (!session) notFound();

  const [{ data: dmNotesRow }, { data: playerNotesRow }, { data: links }, { data: reveals }] =
    await Promise.all([
      canManage
        ? supabase
            .from('session_dm_notes')
            .select('notes')
            .eq('session_id', sessionId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      role === 'player'
        ? supabase
            .from('session_player_notes')
            .select('notes')
            .eq('session_id', sessionId)
            .eq('user_id', userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('session_snippets').select('snippet_id').eq('session_id', sessionId),
      supabase
        .from('visibility_log')
        .select(
          'id, kind, item_id, from_level, to_level, shared_with, note, changed_by, created_at',
        )
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

  const snippetIds = (links ?? []).map((l) => l.snippet_id);
  const { data: linkedSnippets } = snippetIds.length
    ? await supabase.from('snippets').select('id, title').in('id', snippetIds)
    : { data: [] };
  const snippetTitles = new Map((linkedSnippets ?? []).map((s) => [s.id, s.title]));

  const names = await loadNames(supabase, [
    ...(reveals ?? []).flatMap((r) => [...(r.changed_by ? [r.changed_by] : []), ...r.shared_with]),
  ]);
  const who = (id: string | null) => (id ? names.get(id) || t('unknownUser') : t('unknownUser'));

  const back = `/campaigns/${campaign.id}/sessions`;

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={back}>{t('title')}</Link>
        </p>
        <h1>{session.title ? session.title : t('number', { number: session.number })}</h1>
        {session.title ? <p className="role">{t('number', { number: session.number })}</p> : null}
        <Feedback scope="Sessions" notice={notice} error={error} />

        {canManage ? (
          <form action={updateSession} className="form">
            <input type="hidden" name="campaign" value={campaign.id} />
            <input type="hidden" name="id" value={session.id} />
            <div className="field">
              <label htmlFor="title">{t('sessionTitle')}</label>
              <input id="title" name="title" defaultValue={session.title} maxLength={150} />
            </div>
            <div className="field">
              <label htmlFor="played-on">{t('playedOn')}</label>
              <input
                id="played-on"
                name="played_on"
                type="date"
                defaultValue={session.played_on ?? ''}
              />
            </div>
            <div className="field">
              <label htmlFor="summary">{t('summary')}</label>
              <textarea
                id="summary"
                name="summary"
                rows={8}
                maxLength={10000}
                defaultValue={session.summary}
              />
            </div>
            <button type="submit" className="btn btn-primary">
              {t('save')}
            </button>
          </form>
        ) : (
          <>
            <h2>{t('summary')}</h2>
            {session.summary ? (
              <p className="lead">{session.summary}</p>
            ) : (
              <p className="empty">{t('noSummary')}</p>
            )}
          </>
        )}

        <h2>{t('revealsTitle')}</h2>
        {reveals?.length ? (
          <ul className="visibility-log">
            {reveals.map((r) => (
              <li key={r.id}>
                <p>
                  <time dateTime={r.created_at}>
                    {format.dateTime(new Date(r.created_at), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>{' '}
                  — {who(r.changed_by)}:{' '}
                  {r.kind === 'snippet' && snippetTitles.has(r.item_id)
                    ? snippetTitles.get(r.item_id)
                    : t(`kinds.${r.kind}`)}{' '}
                  {tv('logChange', {
                    from: tv(`levels.${r.from_level}`),
                    to: tv(`levels.${r.to_level}`),
                  })}
                </p>
                {r.shared_with.length ? (
                  <p className="role">
                    {tv('logUsers', { names: r.shared_with.map(who).join(', ') })}
                  </p>
                ) : null}
                {r.note ? <p className="relation-notes">{r.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">{t('revealsEmpty')}</p>
        )}

        <h2>{t('eventsTitle')}</h2>
        {campaign.world_id ? (
          <>
            {links?.length ? (
              <ul className="sessions-events">
                {links.map((l) => (
                  <li key={l.snippet_id}>
                    {snippetTitles.has(l.snippet_id) ? (
                      <Link href={`/worlds/${campaign.world_id}/snippets/${l.snippet_id}`}>
                        {snippetTitles.get(l.snippet_id)}
                      </Link>
                    ) : (
                      t('eventHidden')
                    )}
                    {canManage ? (
                      <form action={unlinkSessionSnippet} className="row-form">
                        <input type="hidden" name="campaign" value={campaign.id} />
                        <input type="hidden" name="session" value={session.id} />
                        <input type="hidden" name="snippet" value={l.snippet_id} />
                        <button type="submit" className="btn btn-danger">
                          {t('unlinkEvent')}
                          <span className="sr-only"> {snippetTitles.get(l.snippet_id) ?? ''}</span>
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">{t('eventsEmpty')}</p>
            )}
            {canManage ? (
              <form action={linkSessionSnippet} className="row-form">
                <input type="hidden" name="campaign" value={campaign.id} />
                <input type="hidden" name="session" value={session.id} />
                <label className="sr-only" htmlFor="event-title">
                  {t('eventTitleLabel')}
                </label>
                <input
                  id="event-title"
                  name="title"
                  maxLength={300}
                  placeholder={t('eventTitleLabel')}
                />
                <button type="submit" className="btn">
                  {t('linkEvent')}
                </button>
              </form>
            ) : null}
          </>
        ) : (
          <p className="empty">{t('noWorld')}</p>
        )}

        {canManage ? (
          <>
            <h2>{t('dmNotesTitle')}</h2>
            <form action={saveDmNotes} className="form">
              <input type="hidden" name="campaign" value={campaign.id} />
              <input type="hidden" name="session" value={session.id} />
              <div className="field">
                <label htmlFor="dm-notes">{t('dmNotesHint')}</label>
                <textarea
                  id="dm-notes"
                  name="notes"
                  rows={6}
                  maxLength={10000}
                  defaultValue={dmNotesRow?.notes ?? ''}
                />
              </div>
              <button type="submit" className="btn">
                {t('saveNotes')}
              </button>
            </form>
          </>
        ) : null}

        {role === 'player' ? (
          <>
            <h2>{t('playerNotesTitle')}</h2>
            <form action={savePlayerNotes} className="form">
              <input type="hidden" name="campaign" value={campaign.id} />
              <input type="hidden" name="session" value={session.id} />
              <div className="field">
                <label htmlFor="player-notes">{t('playerNotesHint')}</label>
                <textarea
                  id="player-notes"
                  name="notes"
                  rows={6}
                  maxLength={10000}
                  defaultValue={playerNotesRow?.notes ?? ''}
                />
              </div>
              <button type="submit" className="btn">
                {t('saveNotes')}
              </button>
            </form>
          </>
        ) : null}

        {canManage ? (
          <>
            <h2>{t('deleteTitle')}</h2>
            <form action={deleteSession} className="form">
              <input type="hidden" name="campaign" value={campaign.id} />
              <input type="hidden" name="id" value={session.id} />
              <label className="check">
                <input type="checkbox" name="confirm" value="yes" />
                {t('deleteConfirm')}
              </label>
              <button type="submit" className="btn btn-danger">
                {t('delete')}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
