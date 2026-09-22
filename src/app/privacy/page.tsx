import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Privacy');
  return { title: `${t('title')} — Worldloom` };
}

export default async function PrivacyPage() {
  const t = await getTranslations('Privacy');
  const sections = ['data', 'purpose', 'retention', 'rights', 'sharing', 'contact'] as const;

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <h1>{t('title')}</h1>
        <p className="lead">{t('intro')}</p>
        {sections.map((key) => (
          <div key={key}>
            <h2>{t(`${key}.title`)}</h2>
            <p>{t(`${key}.body`)}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
