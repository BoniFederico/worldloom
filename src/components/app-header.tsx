import { Compass } from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { setLocale, setTheme } from '@/app/actions';
import { THEME_COOKIE, resolveTheme } from '@/i18n/preferences';
import { createClient } from '@/lib/supabase/server';
import { PreferenceGroup } from './preference-group';

export async function AppHeader() {
  const [t, locale, jar] = await Promise.all([getTranslations('Shell'), getLocale(), cookies()]);
  const theme = resolveTheme(jar.get(THEME_COOKIE)?.value);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  return (
    <header className="app-header">
      <Link href="/" className="brand">
        <Compass size={20} aria-hidden="true" />
        Worldloom
      </Link>
      <nav aria-label={t('mainNav')} className="app-nav">
        <Link href="/worlds">{t('worlds')}</Link>
      </nav>
      <Link href={signedIn ? '/account' : '/login'} className="app-nav-link">
        {signedIn ? t('account') : t('login')}
      </Link>
      <div className="prefs">
        <PreferenceGroup
          legend={t('language')}
          current={locale}
          action={setLocale}
          options={[
            { value: 'it', label: 'IT' },
            { value: 'en', label: 'EN' },
          ]}
        />
        <PreferenceGroup
          legend={t('theme')}
          current={theme}
          action={setTheme}
          options={[
            { value: 'system', label: t('themeSystem') },
            { value: 'light', label: t('themeLight') },
            { value: 'dark', label: t('themeDark') },
          ]}
        />
      </div>
    </header>
  );
}
