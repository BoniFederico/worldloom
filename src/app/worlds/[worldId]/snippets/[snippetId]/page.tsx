import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CategoryBadge } from '@/components/category-icon';
import { Feedback } from '@/components/feedback';
import { fieldsSchema, type FieldDefinition } from '@/lib/fields/fields';
import { docToText } from '@/lib/snippets/body';
import { EDITABLE_TYPES, fieldInputName } from '@/lib/snippets/form';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';
import {
  archiveSnippet,
  duplicateSnippet,
  restoreSnippet,
  saveSnippet,
  trashSnippet,
  unarchiveSnippet,
} from '../actions';

type Props = {
  params: Promise<{ worldId: string; snippetId: string }>;
  searchParams: Promise<{ error?: string; notice?: string; keys?: string }>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export default async function SnippetPage({ params, searchParams }: Props) {
  const { worldId, snippetId } = await params;
  if (!uuidSchema.safeParse(snippetId).success) notFound();
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, tf, { error, notice, keys }, { data: snippet }, { data: categories }] =
    await Promise.all([
      getTranslations('Snippets'),
      getTranslations('Categories'),
      searchParams,
      supabase
        .from('snippets')
        .select(
          'id, title, body, fields, status, archived_at, deleted_at, updated_at, snippet_categories(category_id)',
        )
        .eq('id', snippetId)
        .eq('world_id', worldId)
        .maybeSingle(),
      supabase
        .from('categories')
        .select('id, name, icon, color, fields_schema')
        .eq('world_id', worldId)
        .order('name'),
    ]);
  if (!snippet) notFound();

  const selected = new Set(snippet.snippet_categories.map((c) => c.category_id));
  const defs: FieldDefinition[] = [];
  for (const c of categories ?? []) {
    if (!selected.has(c.id)) continue;
    const parsed = fieldsSchema.safeParse(c.fields_schema);
    if (!parsed.success) continue;
    for (const def of parsed.data) if (!defs.some((d) => d.key === def.key)) defs.push(def);
  }
  const values = asRecord(snippet.fields);
  const badKeys = new Set((keys ?? '').split(',').filter((k) => /^[a-z0-9_]+$/.test(k)));

  const { data: refs } = defs.some((d) => d.type === 'snippet_ref')
    ? await supabase
        .from('snippets')
        .select('id, title')
        .eq('world_id', worldId)
        .is('deleted_at', null)
        .neq('id', snippetId)
        .order('title')
        .limit(500)
    : { data: [] };

  const trashed = snippet.deleted_at !== null;
  const editable = canWrite && !trashed;
  const ids = (
    <>
      <input type="hidden" name="world" value={world.id} />
      <input type="hidden" name="id" value={snippet.id} />
    </>
  );

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}/snippets`}>{t('title')}</Link>
        </p>
        <h1>{snippet.title}</h1>
        {trashed ? <p className="message message-info">{t('inTrash')}</p> : null}
        {snippet.archived_at ? <p className="message message-info">{t('isArchived')}</p> : null}
        <Feedback scope="Snippets" notice={notice} error={error} />

        {editable ? (
          <form action={saveSnippet} className="form">
            {ids}
            <input type="hidden" name="updated" value={snippet.updated_at} />
            <div className="field">
              <label htmlFor="title">{t('titleLabel')}</label>
              <input
                id="title"
                name="title"
                defaultValue={snippet.title}
                maxLength={300}
                required
              />
            </div>

            <fieldset className="presets">
              <legend>{t('categoriesLegend')}</legend>
              {categories?.length ? (
                categories.map((c) => (
                  <label key={c.id} className="check">
                    <input
                      type="checkbox"
                      name="category"
                      value={c.id}
                      defaultChecked={selected.has(c.id)}
                    />
                    <CategoryBadge icon={c.icon ?? ''} color={c.color ?? ''} />
                    {c.name}
                  </label>
                ))
              ) : (
                <p className="field-hint">{t('noCategoriesYet')}</p>
              )}
            </fieldset>

            <div className="field">
              <label htmlFor="status">{t('statusLabel')}</label>
              <select id="status" name="status" defaultValue={snippet.status}>
                <option value="draft">{t('status.draft')}</option>
                <option value="final">{t('status.final')}</option>
              </select>
              <p className="field-hint">{t('statusHint')}</p>
            </div>

            <div className="field">
              <label htmlFor="body">{t('bodyLabel')}</label>
              <textarea id="body" name="body" rows={12} defaultValue={docToText(snippet.body)} />
            </div>

            {defs.length ? <h2>{t('fieldsTitle')}</h2> : null}
            {defs.map((def) => {
              const name = fieldInputName(def.key);
              const id = `field-${def.key}`;
              const raw = values[def.key];
              const invalid = badKeys.has(def.key);
              const label = def.required ? `${def.label} (${tf('required')})` : def.label;
              if (!EDITABLE_TYPES.includes(def.type)) {
                return (
                  <p key={def.key} className="field-hint">
                    {def.label}: {t('editElsewhere')}
                  </p>
                );
              }
              return (
                <div className="field" key={def.key}>
                  <label htmlFor={id}>{label}</label>
                  {def.type === 'choice' ? (
                    <select
                      id={id}
                      name={name}
                      defaultValue={String(raw ?? '')}
                      aria-invalid={invalid}
                    >
                      <option value="">—</option>
                      {def.options?.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : def.type === 'snippet_ref' ? (
                    <select
                      id={id}
                      name={name}
                      defaultValue={String(raw ?? '')}
                      aria-invalid={invalid}
                    >
                      <option value="">—</option>
                      {refs?.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      name={name}
                      type={
                        def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'
                      }
                      step={def.type === 'number' ? 'any' : undefined}
                      min={def.type === 'number' ? def.min : undefined}
                      max={def.type === 'number' ? def.max : undefined}
                      defaultValue={raw === undefined || raw === null ? '' : String(raw)}
                      aria-invalid={invalid}
                    />
                  )}
                  {invalid ? <p className="field-hint">{t('fieldInvalid')}</p> : null}
                </div>
              );
            })}

            <button type="submit" className="btn btn-primary">
              {t('save')}
            </button>
          </form>
        ) : (
          <>
            <p>{docToText(snippet.body)}</p>
            {trashed && canWrite ? (
              <form action={restoreSnippet}>
                {ids}
                <button type="submit" className="btn">
                  {t('restore')}
                </button>
              </form>
            ) : null}
          </>
        )}

        {editable ? (
          <>
            <h2>{t('actionsTitle')}</h2>
            <div className="field-actions">
              <form action={duplicateSnippet}>
                {ids}
                <button type="submit" className="btn">
                  {t('duplicate')}
                </button>
              </form>
              <form action={snippet.archived_at ? unarchiveSnippet : archiveSnippet}>
                {ids}
                <button type="submit" className="btn">
                  {snippet.archived_at ? t('unarchive') : t('archive')}
                </button>
              </form>
              <form action={trashSnippet}>
                {ids}
                <button type="submit" className="btn btn-danger">
                  {t('trash')}
                </button>
              </form>
            </div>
            <p className="field-hint">{t('trashHint')}</p>
          </>
        ) : null}
      </section>
    </main>
  );
}
