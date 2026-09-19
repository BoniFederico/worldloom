import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requestPasswordReset } from '@/app/auth/actions';
import { AuthPage, Field } from '@/components/auth-form';

type Props = { searchParams: Promise<{ error?: string }> };

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const [t, { error }] = await Promise.all([getTranslations('Auth'), searchParams]);
  return (
    <AuthPage title={t('forgot.title')} lead={t('forgot.lead')} error={error}>
      <form action={requestPasswordReset} className="form">
        <Field name="email" type="email" label={t('email')} autoComplete="email" />
        <button type="submit" className="btn btn-primary">
          {t('forgot.submit')}
        </button>
      </form>
      <p className="auth-links">
        <Link href="/login">{t('forgot.toLogin')}</Link>
      </p>
    </AuthPage>
  );
}
