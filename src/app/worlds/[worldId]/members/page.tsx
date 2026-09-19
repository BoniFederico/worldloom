import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { createClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/worlds/schemas';
import {
  addMember,
  changeMemberRole,
  leaveWorld,
  removeMember,
  transferOwnership,
} from '../../actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const ASSIGNABLE = ['editor', 'commenter', 'reader'] as const;

export default async function MembersPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  if (!uuidSchema.safeParse(worldId).success) notFound();

  const supabase = await createClient();
  const [t, { error, notice }, { data: auth }, { data: world }] = await Promise.all([
    getTranslations('Members'),
    searchParams,
    supabase.auth.getUser(),
    supabase.from('worlds').select('id, name').eq('id', worldId).maybeSingle(),
  ]);
  if (!world) notFound();

  const { data: members } = await supabase
    .from('world_members')
    .select('user_id, role')
    .eq('world_id', worldId);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', ids);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const me = auth.user?.id;
  const isOwner = members?.some((m) => m.user_id === me && m.role === 'owner') ?? false;
  const rows = [...(members ?? [])].sort((a, b) =>
    (a.role === 'owner' ? '' : (names.get(a.user_id) ?? '')).localeCompare(
      b.role === 'owner' ? '' : (names.get(b.user_id) ?? ''),
    ),
  );
  const others = rows.filter((m) => m.role !== 'owner');
  const roleOptions = ASSIGNABLE.map((r) => (
    <option key={r} value={r}>
      {t(`roles.${r}`)}
    </option>
  ));

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <Feedback scope="Members" notice={notice} error={error} />

        <table className="members">
          <caption className="sr-only">{t('caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('member')}</th>
              <th scope="col">{t('role')}</th>
              {isOwner ? <th scope="col">{t('actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const name = names.get(m.user_id) || t('unknown');
              const editable = isOwner && m.role !== 'owner';
              return (
                <tr key={m.user_id}>
                  <th scope="row">
                    {name}
                    {m.user_id === me ? <span className="role"> ({t('you')})</span> : null}
                  </th>
                  <td>
                    {editable ? (
                      <form action={changeMemberRole} className="row-form">
                        <input type="hidden" name="world" value={world.id} />
                        <input type="hidden" name="user" value={m.user_id} />
                        <label className="sr-only" htmlFor={`role-${m.user_id}`}>
                          {t('roleOf', { name })}
                        </label>
                        <select id={`role-${m.user_id}`} name="role" defaultValue={m.role}>
                          {roleOptions}
                        </select>
                        <button type="submit" className="btn">
                          {t('save')}
                        </button>
                      </form>
                    ) : (
                      t(`roles.${m.role}`)
                    )}
                  </td>
                  {isOwner ? (
                    <td>
                      {editable ? (
                        <form action={removeMember}>
                          <input type="hidden" name="world" value={world.id} />
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

        {isOwner ? (
          <>
            <h2>{t('addTitle')}</h2>
            <form action={addMember} className="form form-inline">
              <input type="hidden" name="world" value={world.id} />
              <div className="field">
                <label htmlFor="email">{t('email')}</label>
                <input id="email" name="email" type="email" autoComplete="off" required />
                <p className="field-hint">{t('emailHint')}</p>
              </div>
              <div className="field">
                <label htmlFor="new-role">{t('role')}</label>
                <select id="new-role" name="role" defaultValue="reader">
                  {roleOptions}
                </select>
              </div>
              <button type="submit" className="btn btn-primary">
                {t('add')}
              </button>
            </form>

            {others.length > 0 ? (
              <>
                <h2>{t('transferTitle')}</h2>
                <form action={transferOwnership} className="form danger-zone">
                  <input type="hidden" name="world" value={world.id} />
                  <p>{t('transferWarning')}</p>
                  <div className="field">
                    <label htmlFor="new-owner">{t('newOwner')}</label>
                    <select id="new-owner" name="user">
                      {others.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {names.get(m.user_id) || t('unknown')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="check">
                    <input type="checkbox" name="confirm" />
                    {t('transferConfirm')}
                  </label>
                  <button type="submit" className="btn btn-danger">
                    {t('transfer')}
                  </button>
                </form>
              </>
            ) : null}
          </>
        ) : (
          <form action={leaveWorld} className="form">
            <input type="hidden" name="world" value={world.id} />
            <button type="submit" className="btn btn-danger">
              {t('leave')}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
