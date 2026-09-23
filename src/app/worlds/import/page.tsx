import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

type Props = { searchParams: Promise<{ error?: string }> };

export default async function ImportWorldPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login?next=%2Fworlds%2Fimport');
  const [t, { error }] = await Promise.all([getTranslations('Import'), searchParams]);

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href="/worlds">{t('worlds')}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('intro')}</p>
        <Feedback scope="Import" error={error} />
        <form
          action="/api/worlds/import"
          method="post"
          encType="multipart/form-data"
          className="form"
        >
          <div className="field">
            <label htmlFor="import-file">{t('file')}</label>
            <input
              id="import-file"
              name="file"
              type="file"
              accept=".json,application/json"
              required
            />
            <p className="field-hint">{t('hint')}</p>
          </div>
          <button type="submit" className="btn btn-primary">
            {t('submit')}
          </button>
        </form>

        <h2>{t('zipTitle')}</h2>
        <p>{t('zipIntro')}</p>
        <form
          action="/api/worlds/import-zip"
          method="post"
          encType="multipart/form-data"
          className="form"
        >
          <div className="field">
            <label htmlFor="zip-file">{t('zipFile')}</label>
            <input id="zip-file" name="file" type="file" accept=".zip,application/zip" required />
          </div>
          <button type="submit" className="btn btn-primary">
            {t('zipSubmit')}
          </button>
        </form>

        <h2>{t('markdownTitle')}</h2>
        <p>{t('markdownIntro')}</p>
        <form
          action="/api/worlds/import-markdown"
          method="post"
          encType="multipart/form-data"
          className="form"
        >
          <div className="field">
            <label htmlFor="md-name">{t('worldName')}</label>
            <input id="md-name" name="name" maxLength={120} required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="md-files">{t('markdownFiles')}</label>
            <input
              id="md-files"
              name="files"
              type="file"
              accept=".md,.markdown,.txt"
              multiple
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">
            {t('markdownSubmit')}
          </button>
        </form>

        <h2>{t('csvTitle')}</h2>
        <p>{t('csvIntro')}</p>
        <form
          action="/api/worlds/import-csv"
          method="post"
          encType="multipart/form-data"
          className="form"
        >
          <div className="field">
            <label htmlFor="csv-name">{t('worldName')}</label>
            <input id="csv-name" name="name" maxLength={120} required autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="csv-category">{t('csvCategory')}</label>
            <input id="csv-category" name="category" maxLength={80} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="csv-file">{t('csvFile')}</label>
            <input id="csv-file" name="file" type="file" accept=".csv,text/csv" required />
          </div>
          <button type="submit" className="btn btn-primary">
            {t('csvSubmit')}
          </button>
        </form>
      </section>
    </main>
  );
}
