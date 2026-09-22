import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { loadWikiCategories, loadWikiWorld, listWikiSnippets } from '@/lib/wiki/load';
import { snippetPath, wikiSlugSchema } from '@/lib/wiki/slug';

type Props = { params: Promise<{ worldSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { worldSlug } = await params;
  if (!wikiSlugSchema.safeParse(worldSlug).success) return {};
  const supabase = await createClient();
  const world = await loadWikiWorld(supabase, worldSlug);
  return world ? { title: `${world.name} — Worldloom` } : {};
}

export default async function WikiWorldPage({ params }: Props) {
  const { worldSlug } = await params;
  if (!wikiSlugSchema.safeParse(worldSlug).success) notFound();

  const supabase = await createClient();
  const [t, world] = await Promise.all([
    getTranslations('Wiki'),
    loadWikiWorld(supabase, worldSlug),
  ]);
  if (!world) notFound();

  const [snippets, categories] = await Promise.all([
    listWikiSnippets(supabase, world.id),
    loadWikiCategories(supabase, world.id),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const groups = new Map<string, { name: string; items: { id: string; title: string }[] }>();
  for (const s of snippets) {
    const catId = s.snippet_categories[0]?.category_id ?? '';
    const name = catId
      ? (categoryName.get(catId) ?? t('categoryUncategorized'))
      : t('categoryUncategorized');
    const group = groups.get(catId) ?? { name, items: [] };
    group.items.push({ id: s.id, title: s.title });
    groups.set(catId, group);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <h1>{world.name}</h1>
        {snippets.length === 0 ? (
          <p className="empty">{t('empty')}</p>
        ) : (
          sortedGroups.map((group) => (
            <div key={group.name}>
              <h2>{group.name}</h2>
              <ul>
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/w/${worldSlug}/${snippetPath({ id: item.id, title: item.title })}`}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <p className="hint">{t('poweredBy')}</p>
      </section>
    </main>
  );
}
