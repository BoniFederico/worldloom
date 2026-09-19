import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { updatePassword } from '@/app/auth/actions';
import { AuthPage, Field } from '@/components/auth-form';
import { createClient } from '@/lib/supabase/server';

type Props = { searchParams: Promise<{ error?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  // Si arriva qui solo dal link email, che ha già creato una sessione di recupero.
  if (!data.user) redirect('/forgot-password');

  const [t, { error }] = await Promise.all([getTranslations('Auth'), searchParams]);
  return (
    <AuthPage title={t('reset.title')} error={error}>
      <form action={updatePassword} className="form">
        <Field
          name="password"
          type="password"
          label={t('newPassword')}
          autoComplete="new-password"
          hint={t('passwordHint')}
        />
        <button type="submit" className="btn btn-primary">
          {t('reset.submit')}
        </button>
      </form>
    </AuthPage>
  );
}
