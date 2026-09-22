import Link from 'next/link';
import { headers } from 'next/headers';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import {
  MAX_INVITE_DAYS,
  MAX_INVITE_USES,
  assignableRoles,
  canManageMember,
  inviteLink,
  inviteStatus,
  type CampaignRole,
} from '@/lib/campaigns/input';
import { loadCampaign } from '@/lib/campaigns/load';
import {
  createInvite,
  deleteCampaign,
  leaveCampaign,
  removeMember,
  revokeInvite,
  setMemberRole,
  updateCampaign,
} from '../actions';

type Props = {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function CampaignPage({ params, searchParams }: Props) {
  const { campaignId } = await params;
  const { supabase, campaign, role, userId, canManage } = await loadCampaign(campaignId);
  const [t, locale, format, { error, notice }, requestHeaders] = await Promise.all([
    getTranslations('Campaigns'),
    getLocale(),
    getFormatter(),
    searchParams,
    headers(),
  ]);

  const [{ data: members }, { data: invites }, { data: worldRows }] = await Promise.all([
    supabase.from('campaign_members').select('user_id, role').eq('campaign_id', campaign.id),
    canManage
      ? supabase
          .from('campaign_invites')
          .select('id, token, role, email, created_at, expires_at, max_uses, uses, revoked_at')
          .eq('campaign_id', campaign.id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    role === 'dm'
      ? supabase.from('world_members').select('worlds(id, name)').eq('user_id', userId)
      : Promise.resolve({ data: [] }),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const worlds = (worldRows ?? [])
    .flatMap((m) => (m.worlds ? [m.worlds] : []))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const linked = worlds.find((w) => w.id === campaign.world_id);

  const order: Record<string, number> = { dm: 0, co_dm: 1, player: 2, observer: 3 };
  const rows = [...(members ?? [])].sort(
    (a, b) =>
      (order[a.role] ?? 9) - (order[b.role] ?? 9) ||
      (names.get(a.user_id) ?? '').localeCompare(names.get(b.user_id) ?? '', locale),
  );

  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost';
  const proto =
    requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const origin = `${proto}://${host}`;
  const roleOptions = (viewer: CampaignRole) =>
    assignableRoles(viewer).map((r) => (
      <option key={r} value={r}>
        {t(`roles.${r}`)}
      </option>
    ));
  const inviteRoles = assignableRoles(role);

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href="/campaigns">{t('title')}</Link>
        </p>
        <h1>{campaign.name}</h1>
        <p className="role">
          {t(`roles.${role}`)} ·{' '}
          {campaign.world_id
            ? linked
              ? t('linkedTo', { name: linked.name })
              : t('linkedOther')
            : t('standalone')}
        </p>
        {campaign.description ? <p className="lead">{campaign.description}</p> : null}
        <Feedback scope="Campaigns" notice={notice} error={error} />
        <p className="campaign-links">
          <Link href={`/campaigns/${campaign.id}/characters`}>{t('characters')}</Link>
          <Link href={`/campaigns/${campaign.id}/stats`}>{t('stats')}</Link>
          <Link href={`/campaigns/${campaign.id}/sessions`}>{t('sessions')}</Link>
          <Link href={`/campaigns/${campaign.id}/chronicle`}>{t('chronicle')}</Link>
          <Link href={`/campaigns/${campaign.id}/messages`}>{t('messages')}</Link>
        </p>

        <h2>{t('membersTitle')}</h2>
        <table className="members">
          <caption className="sr-only">{t('caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('member')}</th>
              <th scope="col">{t('role')}</th>
              {canManage ? <th scope="col">{t('actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const name = names.get(m.user_id) || t('unknown');
              const editable = canManage && canManageMember(role, m.role as CampaignRole);
              return (
                <tr key={m.user_id}>
                  <th scope="row">
                    {name}
                    {m.user_id === userId ? <span className="role"> ({t('you')})</span> : null}
                  </th>
                  <td>
                    {editable ? (
                      <form action={setMemberRole} className="row-form">
                        <input type="hidden" name="campaign" value={campaign.id} />
                        <input type="hidden" name="user" value={m.user_id} />
                        <label className="sr-only" htmlFor={`role-${m.user_id}`}>
                          {t('roleOf', { name })}
                        </label>
                        <select id={`role-${m.user_id}`} name="role" defaultValue={m.role}>
                          {roleOptions(role)}
                        </select>
                        <button type="submit" className="btn">
                          {t('save')}
                        </button>
                      </form>
                    ) : (
                      t(`roles.${m.role}`)
                    )}
                  </td>
                  {canManage ? (
                    <td>
                      {editable ? (
                        <form action={removeMember}>
                          <input type="hidden" name="campaign" value={campaign.id} />
                          <input type="hidden" name="user" value={m.user_id} />
                          <button type="submit" className="btn btn-danger">
                            {t('remove')}
                            <span className="sr-only"> {name}</span>
                          </button>
                        </form>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>

        {role !== 'dm' ? (
          <form action={leaveCampaign} className="form">
            <input type="hidden" name="campaign" value={campaign.id} />
            <button type="submit" className="btn btn-danger">
              {t('leave')}
            </button>
          </form>
        ) : null}

        {canManage ? (
          <>
            <h2>{t('invitesTitle')}</h2>
            <p className="field-hint">{t('invitesIntro')}</p>
            <form action={createInvite} className="form">
              <input type="hidden" name="campaign" value={campaign.id} />
              <div className="form-inline-pair">
                <div className="field">
                  <label htmlFor="invite-role">{t('inviteRole')}</label>
                  <select id="invite-role" name="role" defaultValue="player">
                    {roleOptions(role)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="invite-email">{t('inviteEmail')}</label>
                  <input
                    id="invite-email"
                    name="email"
                    type="email"
                    autoComplete="off"
                    maxLength={254}
                    aria-describedby="invite-email-hint"
                  />
                  <p className="field-hint" id="invite-email-hint">
                    {t('inviteEmailHint')}
                  </p>
                </div>
              </div>
              <div className="form-inline-pair">
                <div className="field">
                  <label htmlFor="invite-days">{t('inviteDays')}</label>
                  <input
                    id="invite-days"
                    name="days"
                    type="number"
                    min={1}
                    max={MAX_INVITE_DAYS}
                    defaultValue={7}
                  />
                </div>
                <div className="field">
                  <label htmlFor="invite-uses">{t('inviteUses')}</label>
                  <input
                    id="invite-uses"
                    name="uses"
                    type="number"
                    min={1}
                    max={MAX_INVITE_USES}
                    defaultValue={1}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={inviteRoles.length === 0}>
                {t('inviteCreate')}
              </button>
            </form>

            {(invites ?? []).length === 0 ? (
              <p className="field-hint">{t('noInvites')}</p>
            ) : (
              <table className="members">
                <caption className="sr-only">{t('invitesCaption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('inviteLink')}</th>
                    <th scope="col">{t('role')}</th>
                    <th scope="col">{t('inviteFor')}</th>
                    <th scope="col">{t('inviteUsage')}</th>
                    <th scope="col">{t('inviteExpires')}</th>
                    <th scope="col">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(invites ?? []).map((i) => {
                    const status = inviteStatus(i);
                    return (
                      <tr key={i.id}>
                        <td>
                          {status === 'active' ? (
                            <>
                              <label className="sr-only" htmlFor={`link-${i.id}`}>
                                {t('linkOf', { role: t(`roles.${i.role}`) })}
                              </label>
                              <input
                                id={`link-${i.id}`}
                                readOnly
                                value={inviteLink(origin, i.token)}
                                className="invite-link"
                              />
                            </>
                          ) : (
                            <span className="role">{t(`status.${status}`)}</span>
                          )}
                        </td>
                        <td>{t(`roles.${i.role}`)}</td>
                        <td>{i.email ?? t('anyone')}</td>
                        <td>
                          {i.uses}/{i.max_uses}
                        </td>
                        <td>{format.dateTime(new Date(i.expires_at), { dateStyle: 'medium' })}</td>
                        <td>
                          {status === 'active' ? (
                            <form action={revokeInvite}>
                              <input type="hidden" name="campaign" value={campaign.id} />
                              <input type="hidden" name="invite" value={i.id} />
                              <button type="submit" className="btn btn-danger">
                                {t('revoke')}
                                <span className="sr-only"> {t(`roles.${i.role}`)}</span>
                              </button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <h2>{t('settingsTitle')}</h2>
            <form action={updateCampaign} className="form">
              <input type="hidden" name="id" value={campaign.id} />
              <div className="field">
                <label htmlFor="c-name">{t('name')}</label>
                <input
                  id="c-name"
                  name="name"
                  defaultValue={campaign.name}
                  maxLength={120}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label htmlFor="c-description">{t('description')}</label>
                <textarea
                  id="c-description"
                  name="description"
                  rows={3}
                  maxLength={2000}
                  defaultValue={campaign.description}
                />
              </div>
              {role === 'dm' ? (
                <div className="field">
                  <label htmlFor="c-world">{t('world')}</label>
                  <select id="c-world" name="world" defaultValue={campaign.world_id ?? ''}>
                    <option value="">{t('noWorld')}</option>
                    {worlds.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <button type="submit" className="btn">
                {t('save')}
              </button>
            </form>
          </>
        ) : null}

        {role === 'dm' ? (
          <>
            <h2>{t('deleteTitle')}</h2>
            <form action={deleteCampaign} className="form">
              <input type="hidden" name="id" value={campaign.id} />
              <label className="check">
                <input type="checkbox" name="confirm" />
                {t('confirmDelete')}
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
