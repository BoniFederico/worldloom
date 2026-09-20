import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CategoryForm } from '@/components/category-form';
import { Feedback } from '@/components/feedback';
import { FieldsEditor } from '@/components/fields-editor';
import { fieldsSchema } from '@/lib/fields/fields';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';
import { deleteCategory, updateCategory } from '../actions';

type Props = {
  params: Promise<{ worldId: string; categoryId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

export default async function CategoryPage({ params, searchParams }: Props) {
  const { worldId, categoryId } = await params;
  if (!uuidSchema.safeParse(categoryId).success) notFound();
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, { error, notice }, { data: category }] = await Promise.all([
    getTranslations('Categories'),
    searchParams,
    supabase
      .from('categories')
      .select('id, name, icon, color, fields_schema')
      .eq('id', categoryId)
      .eq('world_id', worldId)
      .maybeSingle(),
  ]);
  if (!category) notFound();

  const parsed = fieldsSchema.safeParse(category.fields_schema);
  const fields = parsed.success ? parsed.data : [];

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}/categories`}>{t('back')}</Link>
        </p>
        <h1>{category.name}</h1>
        <Feedback scope="Categories" notice={notice} error={error} />

        {canWrite ? (
          <CategoryForm
            action={updateCategory}
            worldId={world.id}
            categoryId={category.id}
            values={{ name: category.name, icon: category.icon ?? '', color: category.color ?? '' }}
            submitLabel={t('save')}
          />
        ) : null}

        <FieldsEditor
          worldId={world.id}
          categoryId={category.id}
          fields={fields}
          canWrite={canWrite}
        />

        {canWrite ? (
          <>
            <h2>{t('deleteTitle')}</h2>
            <form action={deleteCategory} className="form danger-zone">
              <input type="hidden" name="world" value={world.id} />
              <input type="hidden" name="id" value={category.id} />
              <p>{t('deleteWarning')}</p>
              <label className="check">
                <input type="checkbox" name="confirm" />
                {t('deleteConfirm', { name: category.name })}
              </label>
              <button type="submit" className="btn btn-danger">
                {t('delete')}
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
