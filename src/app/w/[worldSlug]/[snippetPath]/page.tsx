import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RichText } from '@/components/rich-text';
import { createClient } from '@/lib/supabase/server';
import { docToText } from '@/lib/snippets/body';
import { loadWikiSnippet, loadWikiWorld } from '@/lib/wiki/load';
import { snippetPath, wikiSlugSchema, wikiSnippetIdFromPath } from '@/lib/wiki/slug';

type Props = { params: Promise<{ worldSlug: string; snippetPath: string }> };

async function load(params: Props['params']) {
  const { worldSlug, snippetPath: path } = await params;
  if (!wikiSlugSchema.safeParse(worldSlug).success) return null;
  const snippetId = wikiSnippetIdFromPath(path);
  if (!snippetId) return null;
  const supabase = await createClient();
  const world = await loadWikiWorld(supabase, worldSlug);
  if (!world) return null;
  const result = await loadWikiSnippet(supabase, world.id, snippetId);
  if (!result) return null;
  return { world, ...result };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params);
  if (!data) return {};
  const description = docToText(data.snippet.body).slice(0, 200);
  return { title: `${data.snippet.title} — ${data.world.name}`, description };
}

export default async function WikiSnippetPage({ params }: Props) {
  const data = await load(params);
  if (!data) notFound();
  const { world, snippet, titles, relations, backlinks } = data;
  const t = await getTranslations('Wiki');
  const unavailable = t('notPublic');
  const linkBase = `/w/${world.wiki_slug}`;

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/w/${world.wiki_slug}`}>{world.name}</Link>
        </p>
        <h1>{snippet.title}</h1>
        {snippet.tags.length ? (
          <ul className="tags">
            {snippet.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : null}

        <RichText
          doc={snippet.body}
          worldId={world.id}
          titles={titles}
          unavailable={unavailable}
          linkBase={linkBase}
          imageBase={`${linkBase}/images`}
        />

        {relations.length ? (
          <section aria-labelledby="wiki-relations">
            <h2 id="wiki-relations">{t('relations')}</h2>
            <ul>
              {relations.map((r) => (
                <li key={`${r.label}-${r.id}`}>
                  {r.label}{' '}
                  <Link href={`${linkBase}/${snippetPath({ id: r.id, title: r.title })}`}>
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {backlinks.length ? (
          <section aria-labelledby="wiki-backlinks">
            <h2 id="wiki-backlinks">{t('mentionedIn')}</h2>
            <ul>
              {backlinks.map((b) => (
                <li key={b.id}>
                  <Link href={`${linkBase}/${snippetPath({ id: b.id, title: b.title })}`}>
                    {b.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </main>
  );
}
