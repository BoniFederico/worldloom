import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { loadWorld } from '@/lib/worlds/context';
import { createRelationType, deleteRelationType, updateRelationType } from './actions';

type Props = {
  params: Promise<{ worldId: string }>;
  searchParams: Promise<{ error?: string | string[]; notice?: string | string[] }>;
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

type Category = { id: string; name: string };

function CategorySelect({
  id,
  name,
  label,
  categories,
  value,
  anyLabel,
}: {
  id: string;
  name: string;
  label: string;
  categories: Category[];
  value: string | null;
  anyLabel: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={value ?? ''}>
        <option value="">{anyLabel}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export default async function RelationTypesPage({ params, searchParams }: Props) {
  const { worldId } = await params;
  const query = await searchParams;
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, { data: types }, { data: categories }] = await Promise.all([
    getTranslations('RelationTypes'),
    supabase
      .from('relation_types')
      .select('id, label, inverse_label, source_category_id, target_category_id')
      .eq('world_id', worldId)
      .order('label'),
    supabase.from('categories').select('id, name').eq('world_id', worldId).order('name'),
  ]);
  const cats = categories ?? [];
  const nameOf = (id: string | null) => cats.find((c) => c.id === id)?.name;

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}`}>{world.name}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className="lead">{t('intro')}</p>
        <Feedback scope="RelationTypes" notice={one(query.notice)} error={one(query.error)} />

        {types?.length ? (
          <ul className="relations">
            {types.map((type) => (
              <li key={type.id}>
                <p className="relation-line">
                  <span className="rel-label">{type.label}</span>
                  {type.inverse_label ? <> ↔ {type.inverse_label}</> : null}
                </p>
                <p className="role">
                  {t('from')}: {nameOf(type.source_category_id) ?? t('any')} · {t('to')}:{' '}
                  {nameOf(type.target_category_id) ?? t('any')}
                </p>
                {canWrite ? (
                  <>
                    <details className="field-edit">
                      <summary>
                        {t('edit')}
                        <span className="sr-only"> {type.label}</span>
                      </summary>
                      <form action={updateRelationType} className="form">
                        <input type="hidden" name="world" value={world.id} />
                        <input type="hidden" name="id" value={type.id} />
                        <div className="field">
                          <label htmlFor={`label-${type.id}`}>{t('label')}</label>
                          <input
                            id={`label-${type.id}`}
                            name="label"
                            defaultValue={type.label}
                            maxLength={120}
                            required
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`inverse-${type.id}`}>{t('inverse')}</label>
                          <input
                            id={`inverse-${type.id}`}
                            name="inverse"
                            defaultValue={type.inverse_label ?? ''}
                            maxLength={120}
                          />
                        </div>
                        <CategorySelect
                          id={`source-${type.id}`}
                          name="source"
                          label={t('sourceCategory')}
                          categories={cats}
                          value={type.source_category_id}
                          anyLabel={t('any')}
                        />
                        <CategorySelect
                          id={`target-${type.id}`}
                          name="target"
                          label={t('targetCategory')}
                          categories={cats}
                          value={type.target_category_id}
                          anyLabel={t('any')}
                        />
                        <button type="submit" className="btn">
                          {t('save')}
                        </button>
                      </form>
                    </details>
                    <form action={deleteRelationType}>
                      <input type="hidden" name="world" value={world.id} />
                      <input type="hidden" name="id" value={type.id} />
                      <button type="submit" className="btn btn-danger">
                        {t('remove')}
                        <span className="sr-only"> {type.label}</span>
                      </button>
                    </form>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">{t('empty')}</p>
        )}

        {canWrite ? (
          <>
            <h2>{t('createTitle')}</h2>
            <form action={createRelationType} className="form">
              <input type="hidden" name="world" value={world.id} />
              <div className="field">
                <label htmlFor="type-label">{t('label')}</label>
                <input id="type-label" name="label" maxLength={120} autoComplete="off" required />
              </div>
              <div className="field">
                <label htmlFor="type-inverse">{t('inverse')}</label>
                <input id="type-inverse" name="inverse" maxLength={120} autoComplete="off" />
              </div>
              <CategorySelect
                id="type-source"
                name="source"
                label={t('sourceCategory')}
                categories={cats}
                value={null}
                anyLabel={t('any')}
              />
              <CategorySelect
                id="type-target"
                name="target"
                label={t('targetCategory')}
                categories={cats}
                value={null}
                anyLabel={t('any')}
              />
              <p className="field-hint">{t('constraintHint')}</p>
              <button type="submit" className="btn btn-primary">
                {t('create')}
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
