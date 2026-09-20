import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { CategoryForm } from '@/components/category-form';
import { CategoryBadge } from '@/components/category-icon';
import { Feedback } from '@/components/feedback';
import { PRESETS } from '@/lib/categories/presets';
import { loadWorld } from '@/lib/worlds/context';
import { createCategory, importPresets } from './actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function CategoriesPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, tp, { error, notice }, { data: categories }] = await Promise.all([
    getTranslations('Categories'),
    getTranslations('Presets'),
    searchParams,
    supabase
      .from('categories')
      .select('id, name, icon, color, fields_schema')
      .eq('world_id', worldId)
      .order('name'),
  ]);

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <Feedback scope="Categories" notice={notice} error={error} />

        {categories?.length ? (
          <ul className="world-list">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/worlds/${world.id}/categories/${c.id}`}>
                  <CategoryBadge icon={c.icon ?? ''} color={c.color ?? ''} />
                  {c.name}
                </Link>
                <span className="role">
                  {t('fieldsCount', {
                    count: Array.isArray(c.fields_schema) ? c.fields_schema.length : 0,
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">{t('empty')}</p>
        )}

        {canWrite ? (
          <>
            <h2>{t('createTitle')}</h2>
            <CategoryForm action={createCategory} worldId={world.id} submitLabel={t('create')} />

            <h2>{t('importTitle')}</h2>
            <form action={importPresets} className="form">
              <input type="hidden" name="world" value={world.id} />
              <p className="field-hint">{t('importHint')}</p>
              <fieldset className="presets">
                <legend className="sr-only">{t('importTitle')}</legend>
                {PRESETS.map((p) => (
                  <label key={p.id} className="check">
                    <input type="checkbox" name="preset" value={p.id} />
                    <CategoryBadge icon={p.icon} color={p.color} />
                    {tp(`${p.id}.name`)}
                  </label>
                ))}
              </fieldset>
              <button type="submit" className="btn">
                {t('importSubmit')}
              </button>
            </form>
          </>
        ) : (
          <p className="field-hint">{t('readOnly')}</p>
        )}
      </section>
    </main>
  );
}
