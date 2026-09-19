import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { signUp } from '@/app/auth/actions';
import { AuthPage, Field } from '@/components/auth-form';
import { OAuthButtons } from '@/components/oauth-buttons';

type Props = { searchParams: Promise<{ error?: string }> };

export default async function SignupPage({ searchParams }: Props) {
  const [t, { error }] = await Promise.all([getTranslations('Auth'), searchParams]);
  return (
    <AuthPage title={t('signup.title')} lead={t('signup.lead')} error={error}>
      <form action={signUp} className="form">
        <Field name="displayName" label={t('displayName')} autoComplete="nickname" />
        <Field name="email" type="email" label={t('email')} autoComplete="email" />
        <Field
          name="password"
          type="password"
          label={t('password')}
          autoComplete="new-password"
          hint={t('passwordHint')}
        />
        <button type="submit" className="btn btn-primary">
          {t('signup.submit')}
        </button>
      </form>
      <OAuthButtons />
      <p className="auth-links">
        <Link href="/login">{t('signup.toLogin')}</Link>
      </p>
    </AuthPage>
  );
}
