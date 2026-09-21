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
      </section>
    </main>
  );
}
