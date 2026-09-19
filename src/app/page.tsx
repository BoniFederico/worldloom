import { Compass } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

export default async function Home() {
  const t = await getTranslations('Home');
  return (
    <main id="main" className="page">
      <section className="intro">
        <h1>{t('title')}</h1>
        <p>{t('lead')}</p>
        <span className="status">
          <Compass size={16} aria-hidden="true" />
          {t('status')}
        </span>
      </section>
    </main>
  );
}
