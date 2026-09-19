import { getTranslations } from 'next-intl/server';
import { signOut } from '@/app/auth/actions';
import { AuthPage } from '@/components/auth-form';
import { createClient } from '@/lib/supabase/server';

type Props = { searchParams: Promise<{ notice?: string }> };

export default async function AccountPage({ searchParams }: Props) {
  const supabase = await createClient();
  const [t, { notice }, { data }] = await Promise.all([
    getTranslations('Auth'),
    searchParams,
    supabase.auth.getUser(),
  ]);
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', data.user?.id ?? '')
    .maybeSingle();

  return (
    <AuthPage title={t('account.title')} notice={notice}>
      <dl className="account">
        <dt>{t('displayName')}</dt>
        <dd>{profile?.display_name}</dd>
        <dt>{t('email')}</dt>
        <dd>{data.user?.email}</dd>
      </dl>
      <form action={signOut}>
        <button type="submit" className="btn">
          {t('account.signOut')}
        </button>
      </form>
    </AuthPage>
  );
}
