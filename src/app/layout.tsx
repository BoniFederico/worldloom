import type { Metadata } from 'next';
import { Schibsted_Grotesk, Source_Serif_4 } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { AppHeader } from '@/components/app-header';
import { THEME_COOKIE, resolveTheme } from '@/i18n/preferences';
import './globals.css';

const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-source-serif' });
const ui = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-schibsted' });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Home');
  return { title: 'Worldloom', description: t('lead') };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, jar, t] = await Promise.all([getLocale(), cookies(), getTranslations('Shell')]);
  const theme = resolveTheme(jar.get(THEME_COOKIE)?.value);

  return (
    <html
      lang={locale}
      data-theme={theme === 'system' ? undefined : theme}
      className={`${serif.variable} ${ui.variable}`}
    >
      <body>
        <a href="#main" className="skip-link">
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>
          <AppHeader />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
