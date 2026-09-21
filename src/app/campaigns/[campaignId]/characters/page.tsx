import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { loadCampaign } from '@/lib/campaigns/load';
import { loadStats } from '@/lib/characters/load';
import { createCharacter } from './actions';

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function CharactersPage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const { supabase, campaign, role, canManage } = await loadCampaign(campaignId);
  const [t, { error, notice }, stats] = await Promise.all([
    getTranslations('Characters'),
    searchParams,
    loadStats(supabase, campaignId),
  ]);

  // La RLS decide che cosa si vede: chi gestisce tutte le schede, un giocatore solo le proprie.
  const [{ data: characters }, { data: members }] = await Promise.all([
    supabase
      .from('characters')
      .select('id, name, kind, owner_id')
      .eq('campaign_id', campaignId)
      .order('name'),
    canManage
      ? supabase.from('campaign_members').select('user_id, role').eq('campaign_id', campaignId)
      : Promise.resolve({ data: [] }),
  ]);
  const playerIds = (members ?? []).filter((m) => m.role === 'player').map((m) => m.user_id);
  const ownerIds = [
    ...new Set([
      ...playerIds,
      ...(characters ?? []).flatMap((c) => (c.owner_id ? [c.owner_id] : [])),
    ]),
  ];
  const { data: profiles } = ownerIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', ownerIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const nameOf = (id: string | null) => (id ? names.get(id) || t('unknownUser') : t('noOwner'));
  const canCreate = role !== 'observer' && stats !== null;

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className="role">
          <Link href={`/campaigns/${campaign.id}/stats`}>{t('schemaLink')}</Link>
        </p>
        <Feedback scope="Characters" notice={notice} error={error} />

        {stats === null ? (
          <p className="empty">
            {t('noSchema')}{' '}
            {role === 'dm' ? (
              <Link href={`/campaigns/${campaign.id}/stats`}>{t('defineSchema')}</Link>
            ) : null}
          </p>
        ) : null}

        {characters?.length ? (
          <table className="members">
            <caption className="sr-only">{t('listCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('columnName')}</th>
                <th scope="col">{t('columnKind')}</th>
                <th scope="col">{t('columnOwner')}</th>
              </tr>
            </thead>
            <tbody>
              {characters.map((c) => (
                <tr key={c.id}>
                  <th scope="row">
                    <Link href={`/campaigns/${campaign.id}/characters/${c.id}`}>{c.name}</Link>
                  </th>
                  <td>{t(`kindsShort.${c.kind}`)}</td>
                  <td>{c.kind === 'pc' ? nameOf(c.owner_id) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">{t('empty')}</p>
        )}

        {canCreate ? (
          <>
            <h2>{t('newTitle')}</h2>
            {canManage ? null : <p className="field-hint">{t('playerHint')}</p>}
            <form action={createCharacter} className="form">
              <input type="hidden" name="campaign" value={campaign.id} />
              <div className="field">
                <label htmlFor="new-name">{t('name')}</label>
                <input id="new-name" name="name" maxLength={120} required />
              </div>
              {canManage ? (
                <>
                  <div className="field">
                    <label htmlFor="new-kind">{t('kind')}</label>
                    <select id="new-kind" name="kind" defaultValue="npc">
                      <option value="pc">{t('kinds.pc')}</option>
                      <option value="npc">{t('kinds.npc')}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="new-owner">{t('owner')}</label>
                    <select id="new-owner" name="owner" defaultValue="">
                      <option value="">{t('noOwner')}</option>
                      {playerIds.map((id) => (
                        <option key={id} value={id}>
                          {nameOf(id)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : null}
              <input type="hidden" name="notes" value="" />
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
