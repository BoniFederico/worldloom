import { getTranslations } from 'next-intl/server';
import { signInWithGitHub } from '@/app/auth/actions';

/** Accesso con provider esterni, separato dal form email/password da un'etichetta testuale. */
export async function OAuthButtons() {
  const t = await getTranslations('Auth.oauth');
  return (
    <div className="oauth">
      <p className="oauth-or" aria-hidden="true">
        {t('or')}
      </p>
      <form action={signInWithGitHub}>
        <button type="submit" className="btn btn-block">
          {t('github')}
        </button>
      </form>
    </div>
  );
}
