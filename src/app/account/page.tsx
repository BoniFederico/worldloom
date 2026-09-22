import { getTranslations } from 'next-intl/server';
import { deleteAccount, signOut } from '@/app/auth/actions';
import { AuthPage } from '@/components/auth-form';
import { createClient } from '@/lib/supabase/server';

type Props = { searchParams: Promise<{ notice?: string; error?: string }> };

export default async function AccountPage({ searchParams }: Props) {
  const supabase = await createClient();
  const [t, { notice, error }, { data }] = await Promise.all([
    getTranslations('Auth'),
    searchParams,
    supabase.auth.getUser(),
  ]);
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, privacy_accepted_at')
    .eq('id', data.user?.id ?? '')
    .maybeSingle();

  return (
    <AuthPage title={t('account.title')} notice={notice} error={error}>
      <dl className="account">
        <dt>{t('displayName')}</dt>
        <dd>{profile?.display_name}</dd>
        <dt>{t('email')}</dt>
        <dd>{data.user?.email}</dd>
        <dt>{t('account.privacyAcceptedAt')}</dt>
        <dd>
          {profile?.privacy_accepted_at
            ? new Date(profile.privacy_accepted_at).toLocaleDateString()
            : t('account.privacyNotRecorded')}
        </dd>
      </dl>
      <form action={signOut}>
        <button type="submit" className="btn">
          {t('account.signOut')}
        </button>
      </form>

      <h2>{t('account.exportTitle')}</h2>
      <p>{t('account.exportIntro')}</p>
      <a href="/account/export" className="btn">
        {t('account.exportButton')}
      </a>

      <h2>{t('account.deleteTitle')}</h2>
      <form action={deleteAccount} className="form danger-zone">
        <p>{t('account.deleteWarning')}</p>
        <label className="check">
          <input type="checkbox" name="confirm" />
          {t('account.deleteConfirm')}
        </label>
        <button type="submit" className="btn btn-danger">
          {t('account.delete')}
        </button>
      </form>
    </AuthPage>
  );
}
