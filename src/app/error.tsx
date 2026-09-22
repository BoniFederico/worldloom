'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/** Confine errori per le rotte sotto il layout principale (#45): segnala al server e mostra un fallback. */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('ErrorPage');

  useEffect(() => {
    fetch('/api/log/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: error.name || 'Error',
        digest: error.digest,
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <h1>{t('title')}</h1>
        <p>{t('body')}</p>
        <button type="button" className="btn btn-primary" onClick={reset}>
          {t('retry')}
        </button>{' '}
        <Link href="/" className="btn">
          {t('home')}
        </Link>
      </section>
    </main>
  );
}
