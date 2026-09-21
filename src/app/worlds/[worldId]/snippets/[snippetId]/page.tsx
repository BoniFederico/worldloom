import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { BacklinksPanel } from '@/components/backlinks-panel';
import { RelationsPanel } from '@/components/relations-panel';
import { RichText } from '@/components/rich-text';
import { SnippetForm } from '@/components/snippet-form';
import { VisibilityForm } from '@/components/visibility-form';
import { VisibilityLog } from '@/components/visibility-log';
import { loadCalendars } from '@/lib/calendars/load';
import { fieldsSchema, type FieldDefinition } from '@/lib/fields/fields';
import { docToText, mentionsOf, sanitizeBody, withMentionLabels } from '@/lib/snippets/body';
import { cellValueText } from '@/lib/views/table';
import { loadShareTargets, loadShares } from '@/lib/visibility/load';
import { loadRestricted, withRestricted } from '@/lib/visibility/restricted';
import { fieldLevelOf, type Level } from '@/lib/visibility/input';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';
import {
  archiveSnippet,
  duplicateSnippet,
  restoreSnippet,
  trashSnippet,
  unarchiveSnippet,
} from '../actions';
import { applySnippetVisibility } from '../visibility-actions';

type Props = {
  params: Promise<{ worldId: string; snippetId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export default async function SnippetPage({ params, searchParams }: Props) {
  const { worldId, snippetId } = await params;
  if (!uuidSchema.safeParse(snippetId).success) notFound();
  const { supabase, world, canWrite } = await loadWorld(worldId);
  const [t, tv, { error, notice }, { data: snippet }, { data: categories }] = await Promise.all([
    getTranslations('Snippets'),
    getTranslations('Visibility'),
    searchParams,
    supabase
      .from('snippets')
      .select(
        'id, title, body, fields, tags, aliases, status, visibility, archived_at, deleted_at, updated_at, snippet_categories(category_id)',
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

  const categoryIds = snippet.snippet_categories.map((c) => c.category_id);
  const defs: FieldDefinition[] = [];
  for (const c of categories ?? []) {
    if (!categoryIds.includes(c.id)) continue;
    const parsed = fieldsSchema.safeParse(c.fields_schema);
    if (!parsed.success) continue;
    for (const def of parsed.data) if (!defs.some((d) => d.key === def.key)) defs.push(def);
  }

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

  const calendars = defs.some((d) => d.type === 'calendar_date')
    ? await loadCalendars(supabase, worldId)
    : [];

  // Tag già usati nel mondo (i più frequenti), da riusare invece di inventarne di simili.
  const { data: tagRows } = await supabase
    .from('snippets')
    .select('tags')
    .eq('world_id', worldId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(500);
  const counts = new Map<string, number>();
  for (const row of tagRows ?? [])
    for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const knownTags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([tag]) => tag);

  // Titoli attuali degli snippet menzionati nel testo (i cancellati o non leggibili restano senza link).
  const mentioned = mentionsOf(snippet.body);
  const { data: mentionRows } = mentioned.length
    ? await supabase
        .from('snippets')
        .select('id, title')
        .eq('world_id', worldId)
        .is('deleted_at', null)
        .in('id', mentioned)
    : { data: [] };
  const mentionTitles = Object.fromEntries((mentionRows ?? []).map((m) => [m.id, m.title]));
  const unavailable = t('mentionUnavailable');

  const trashed = snippet.deleted_at !== null;
  const editable = canWrite && !trashed;

  // I campi riservati non stanno nella colonna pubblica: chi li può leggere (il DM, o i destinatari) li vede uniti agli altri.
  const restricted = await loadRestricted(supabase, worldId);
  const values = withRestricted(snippet.id, asRecord(snippet.fields), restricted);
  const [targets, snippetShares, fieldShares] = editable
    ? await Promise.all([
        loadShareTargets(supabase, worldId),
        loadShares(supabase, worldId, 'snippet', [snippet.id]),
        loadShares(supabase, worldId, 'field', [snippet.id]),
      ])
    : [[], new Map<string, string[]>(), new Map<string, string[]>()];
  const fieldLevels = restricted.levels.get(snippet.id) ?? {};
  const sharedUsers = snippetShares.get(snippet.id) ?? [];
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
          <SnippetForm
            worldId={world.id}
            snippet={{
              id: snippet.id,
              title: snippet.title,
              status: snippet.status,
              body: docToText(snippet.body, { titles: mentionTitles, unavailable }),
              doc: withMentionLabels(sanitizeBody(snippet.body), mentionTitles, unavailable),
              updatedAt: snippet.updated_at,
              categoryIds,
              tags: snippet.tags,
              aliases: snippet.aliases,
              values,
            }}
            categories={(categories ?? []).map((c) => ({
              id: c.id,
              name: c.name,
              icon: c.icon ?? '',
              color: c.color ?? '',
            }))}
            defs={defs}
            refs={refs ?? []}
            calendars={calendars}
            knownTags={knownTags}
          />
        ) : (
          <>
            <RichText
              doc={snippet.body}
              worldId={world.id}
              titles={mentionTitles}
              unavailable={unavailable}
            />
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

        {!editable && defs.length ? (
          <section aria-labelledby="snippet-fields">
            <h2 id="snippet-fields">{t('fieldsTitle')}</h2>
            <dl className="fields-list">
              {defs
                .filter((d) => cellValueText(values[d.key]) !== '')
                .map((d) => (
                  <div key={d.key}>
                    <dt>{d.label}</dt>
                    <dd>{cellValueText(values[d.key])}</dd>
                  </div>
                ))}
            </dl>
          </section>
        ) : null}

        {!trashed ? (
          <>
            <Feedback scope="Relations" notice={notice} error={error} />
            <BacklinksPanel supabase={supabase} worldId={world.id} snippetId={snippet.id} />
            <RelationsPanel
              supabase={supabase}
              worldId={world.id}
              snippetId={snippet.id}
              snippetTitle={snippet.title}
              canWrite={canWrite}
            />
          </>
        ) : null}

        {editable ? (
          <section aria-labelledby="visibility">
            <h2 id="visibility">{tv('title')}</h2>
            <p className="field-hint">{tv('intro')}</p>
            <VisibilityForm
              action={applySnippetVisibility}
              hidden={{ world: world.id, id: snippet.id }}
              idPrefix="vis"
              level={snippet.visibility as Level}
              users={sharedUsers}
              targets={targets}
              fields={defs.map((d) => ({
                key: d.key,
                label: d.label,
                level: fieldLevelOf(fieldLevels, d.key),
                users: fieldShares.get(`${snippet.id}:${d.key}`) ?? [],
              }))}
            />
            <VisibilityLog
              supabase={supabase}
              worldId={world.id}
              snippetId={snippet.id}
              fieldLabels={Object.fromEntries(defs.map((d) => [d.key, d.label]))}
            />
          </section>
        ) : null}

        {editable ? (
          <>
            <h2>{t('actionsTitle')}</h2>
            <div className="field-actions">
              <Link className="btn" href={`/worlds/${world.id}/snippets/${snippet.id}/history`}>
                {t('historyLink')}
              </Link>
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
