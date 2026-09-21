import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { splitExcerpt } from '@/lib/search/params';

type Result = {
  id: string;
  title: string;
  status: string;
  tags: string[];
  excerpt: string | null;
};

/** Elenco dei risultati di ricerca (estratti con i termini evidenziati, mai interpretati come HTML). */
export async function SearchResults({ worldId, results }: { worldId: string; results: Result[] }) {
  const t = await getTranslations('Search');
  return (
    <section aria-labelledby="results" aria-live="polite">
      <h2 id="results">{t('results')}</h2>
      <p className="role">{t('count', { count: results.length })}</p>
      {results.length ? (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.id}>
              <Link href={`/worlds/${worldId}/snippets/${r.id}`}>{r.title}</Link>
              <span className="role">
                {' '}
                {r.status === 'final' ? t('final') : t('draft')}
                {r.tags.length ? ` · ${r.tags.map((x) => `#${x}`).join(' ')}` : ''}
              </span>
              {r.excerpt ? (
                <p className="search-excerpt">
                  {splitExcerpt(r.excerpt).map((part, i) =>
                    part.mark ? <mark key={i}>{part.text}</mark> : <span key={i}>{part.text}</span>,
                  )}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">{t('none')}</p>
      )}
    </section>
  );
}
