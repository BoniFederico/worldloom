import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { signIn } from '@/app/auth/actions';
import { AuthPage, Field } from '@/components/auth-form';

type Props = { searchParams: Promise<{ error?: string; notice?: string; next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const [t, { error, notice, next }] = await Promise.all([getTranslations('Auth'), searchParams]);
  return (
    <AuthPage title={t('login.title')} error={error} notice={notice}>
      <form action={signIn} className="form">
        <input type="hidden" name="next" value={next ?? ''} />
        <Field name="email" type="email" label={t('email')} autoComplete="email" />
        <Field
          name="password"
          type="password"
          label={t('password')}
          autoComplete="current-password"
        />
        <button type="submit" className="btn btn-primary">
          {t('login.submit')}
        </button>
      </form>
      <p className="auth-links">
        <Link href="/forgot-password">{t('login.forgot')}</Link>
        <Link href="/signup">{t('login.toSignup')}</Link>
      </p>
    </AuthPage>
  );
}
