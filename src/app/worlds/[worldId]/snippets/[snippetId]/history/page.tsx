import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Feedback } from '@/components/feedback';
import { docToText } from '@/lib/snippets/body';
import {
  diffFields,
  diffLines,
  diffList,
  type FieldChange,
  type VersionContent,
} from '@/lib/versions/diff';
import { loadWorld } from '@/lib/worlds/context';
import { uuidSchema } from '@/lib/worlds/schemas';
import { restoreVersion } from './actions';

type Props = {
  params: Promise<{ worldId: string; snippetId: string }>;
  searchParams: Promise<{ v?: string | string[]; error?: string; notice?: string }>;
};

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

const show = (value: unknown): string =>
  value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value);

export default async function HistoryPage({ params, searchParams }: Props) {
  const { worldId, snippetId } = await params;
  if (!uuidSchema.safeParse(snippetId).success) notFound();
  const { supabase, world, canWrite } = await loadWorld(worldId);
  // La cronologia è per chi può scrivere: ai lettori la pagina non esiste.
  if (!canWrite) notFound();

  const query = await searchParams;
  const [t, locale, { data: snippet }, { data: versions }] = await Promise.all([
    getTranslations('History'),
    getLocale(),
    supabase
      .from('snippets')
      .select('id, title, updated_at, deleted_at')
      .eq('id', snippetId)
      .eq('world_id', worldId)
      .maybeSingle(),
    supabase
      .from('snippet_versions')
      .select(
        'version, title, status, body, fields, tags, aliases, restored_from, created_by, created_at',
      )
      .eq('snippet_id', snippetId)
      .eq('world_id', worldId)
      .order('version', { ascending: false })
      .limit(100),
  ]);
  if (!snippet) notFound();

  const list = versions ?? [];
  const authors = [...new Set(list.flatMap((v) => (v.created_by ? [v.created_by] : [])))];
  const { data: profiles } = authors.length
    ? await supabase.from('profiles').select('id, display_name').in('id', authors)
    : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const requested = Number(one(query.v));
  const selected = list.find((v) => v.version === requested) ?? list[0];
  const previous = selected ? list.find((v) => v.version === selected.version - 1) : undefined;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const snippetPath = `/worlds/${world.id}/snippets/${snippet.id}`;

  const content = (v: typeof selected | undefined): VersionContent | null =>
    v
      ? {
          title: v.title,
          status: v.status,
          body: docToText(v.body),
          fields: v.fields,
          tags: v.tags,
          aliases: v.aliases,
        }
      : null;
  const after = content(selected);
  const before = content(previous);
  const empty: VersionContent = {
    title: '',
    status: '',
    body: '',
    fields: {},
    tags: [],
    aliases: [],
  };
  const base = before ?? empty;
  const bodyDiff = after ? diffLines(String(base.body), String(after.body)) : [];
  const tagDiff = after ? diffList(base.tags, after.tags) : null;
  const aliasDiff = after ? diffList(base.aliases, after.aliases) : null;
  const fieldChanges: FieldChange[] = after ? diffFields(base.fields, after.fields) : [];
  const metaChanges = after
    ? [
        base.title !== after.title
          ? { label: t('titleLabel'), from: base.title, to: after.title }
          : null,
        base.status !== after.status
          ? { label: t('statusLabel'), from: base.status, to: after.status }
          : null,
      ].filter((c) => c !== null)
    : [];
  const nothing =
    !!after &&
    metaChanges.length === 0 &&
    bodyDiff.every((l) => l.type === 'same') &&
    !tagDiff?.added.length &&
    !tagDiff?.removed.length &&
    !aliasDiff?.added.length &&
    !aliasDiff?.removed.length &&
    fieldChanges.length === 0;

  return (
    <main id="main" className="page page-top">
      <section className="content">
        <p className="crumbs">
          <Link href={`/worlds/${world.id}/snippets`}>{t('snippets')}</Link> /{' '}
          <Link href={snippetPath}>{snippet.title}</Link>
        </p>
        <h1>{t('title')}</h1>
        <p className="field-hint">{t('hint')}</p>
        <Feedback scope="History" notice={query.notice} error={query.error} />

        {list.length === 0 ? <p>{t('empty')}</p> : null}
        <div className="history">
          <nav aria-label={t('listLabel')}>
            <ol className="history-list">
              {list.map((v) => (
                <li key={v.version}>
                  <Link
                    href={`${snippetPath}/history?v=${v.version}`}
                    aria-current={v.version === selected?.version ? 'true' : undefined}
                  >
                    <strong>{t('version', { n: v.version })}</strong>
                    <span>{date.format(new Date(v.created_at))}</span>
                    <span>
                      {(v.created_by && names.get(v.created_by)) || t('unknownAuthor')}
                      {v.restored_from ? ` · ${t('restoredFrom', { n: v.restored_from })}` : ''}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>

          {selected && after ? (
            <div className="history-detail">
              <h2>
                {t('version', { n: selected.version })}
                {previous ? ` · ${t('comparedWith', { n: previous.version })}` : ` · ${t('first')}`}
              </h2>
              {nothing ? <p>{t('noChanges')}</p> : null}

              {metaChanges.map((c) => (
                <p key={c.label} className="diff-meta">
                  <strong>{c.label}:</strong> <del>{c.from || '—'}</del> <ins>{c.to}</ins>
                </p>
              ))}
              {tagDiff && (tagDiff.added.length || tagDiff.removed.length) ? (
                <p className="diff-meta">
                  <strong>{t('tags')}:</strong>{' '}
                  {tagDiff.removed.map((x) => (
                    <del key={`r${x}`}>{x} </del>
                  ))}
                  {tagDiff.added.map((x) => (
                    <ins key={`a${x}`}>{x} </ins>
                  ))}
                </p>
              ) : null}
              {aliasDiff && (aliasDiff.added.length || aliasDiff.removed.length) ? (
                <p className="diff-meta">
                  <strong>{t('aliases')}:</strong>{' '}
                  {aliasDiff.removed.map((x) => (
                    <del key={`r${x}`}>{x} </del>
                  ))}
                  {aliasDiff.added.map((x) => (
                    <ins key={`a${x}`}>{x} </ins>
                  ))}
                </p>
              ) : null}
              {fieldChanges.map((c) => (
                <p key={c.key} className="diff-meta">
                  <strong>{c.key}:</strong> <del>{show(c.before)}</del> <ins>{show(c.after)}</ins>
                </p>
              ))}

              {bodyDiff.some((l) => l.type !== 'same') ? (
                <>
                  <h3>{t('bodyLabel')}</h3>
                  <div className="diff" role="group" aria-label={t('bodyLabel')}>
                    {bodyDiff.map((line, i) =>
                      line.type === 'same' ? (
                        <p key={i} className="diff-line">
                          {line.text || ' '}
                        </p>
                      ) : line.type === 'add' ? (
                        <p key={i} className="diff-line diff-add">
                          <span aria-hidden="true">+ </span>
                          <span className="sr-only">{t('added')}: </span>
                          {line.text || ' '}
                        </p>
                      ) : (
                        <p key={i} className="diff-line diff-remove">
                          <span aria-hidden="true">− </span>
                          <span className="sr-only">{t('removed')}: </span>
                          {line.text || ' '}
                        </p>
                      ),
                    )}
                  </div>
                </>
              ) : null}

              {snippet.deleted_at === null ? (
                <form action={restoreVersion} className="field-actions">
                  <input type="hidden" name="world" value={world.id} />
                  <input type="hidden" name="id" value={snippet.id} />
                  <input type="hidden" name="version" value={selected.version} />
                  <input type="hidden" name="token" value={snippet.updated_at} />
                  <button type="submit" className="btn">
                    {t('restore', { n: selected.version })}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
