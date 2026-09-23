import { Compass } from 'lucide-react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import { LOCALES, THEME_COOKIE, resolveTheme, type Locale, type Theme } from '@/i18n/preferences';
import { createClient } from '@/lib/supabase/server';
import { AccountMenu } from './account-menu';
import { LanguageMenu } from './language-menu';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';

const THEME_KEY: Record<Theme, 'themeSystem' | 'themeLight' | 'themeDark'> = {
  system: 'themeSystem',
  light: 'themeLight',
  dark: 'themeDark',
};
const THEME_ORDER: readonly Theme[] = ['system', 'light', 'dark'];

export async function AppHeader() {
  const [t, rawLocale, jar] = await Promise.all([getTranslations('Shell'), getLocale(), cookies()]);
  const locale: Locale = LOCALES.find((l) => l === rawLocale) ?? 'it';
  const theme = resolveTheme(jar.get(THEME_COOKIE)?.value);
  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length] as Theme;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email =
    typeof data?.claims?.email === 'string' && data.claims.email.length > 0
      ? data.claims.email
      : null;
  const signedIn = Boolean(data?.claims);

  return (
    <header className="app-header">
      <Link href="/" className="brand">
        <Compass size={20} aria-hidden="true" />
        Worldloom
      </Link>
      <nav aria-label={t('mainNav')} className="app-nav">
        <Link href="/worlds">{t('worlds')}</Link>
        <Link href="/campaigns">{t('campaigns')}</Link>
      </nav>
      {signedIn ? <NotificationBell supabase={supabase} /> : null}
      <div className="topbar-controls">
        <LanguageMenu
          current={locale}
          label={t('language')}
          options={[
            { value: 'it', label: 'IT' },
            { value: 'en', label: 'EN' },
          ]}
        />
        <ThemeToggle current={theme} label={t(THEME_KEY[theme])} next={t(THEME_KEY[nextTheme])} />
        {signedIn ? (
          <AccountMenu
            href="/account"
            label={t('account')}
            initial={email?.[0]?.toUpperCase() ?? null}
          />
        ) : (
          <Link href="/login" className="app-nav-link">
            {t('login')}
          </Link>
        )}
      </div>
    </header>
  );
}
