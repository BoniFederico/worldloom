import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  cellText,
  groupRows,
  sortRows,
  type TableConfig,
  type TableContext,
  type TableRow,
} from '@/lib/views/table';

type Props = {
  worldId: string;
  rows: TableRow[];
  ctx: TableContext;
  config: TableConfig;
  truncatedAt: number | null;
  /** Indirizzo che ordina per la colonna indicata (l'ordinamento è un normale link: funziona da tastiera e senza JavaScript). */
  sortHref: (column: string, dir: 'asc' | 'desc') => string;
  locale: string;
};

/**
 * Tabella accessibile: `<table>` reale con didascalia, intestazioni di colonna ordinabili (`aria-sort`) e, se richiesto,
 * gruppi con una riga di intestazione. Ogni cella è testo semplice.
 */
export async function TableView({
  worldId,
  rows,
  ctx,
  config,
  truncatedAt,
  sortHref,
  locale,
}: Props) {
  const t = await getTranslations('Table');
  const search = await getTranslations('Search');
  const sorted = sortRows(rows, config.sort, ctx);
  const groups = groupRows(sorted, config.group, ctx);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  const label = (column: string) =>
    column.startsWith('field:')
      ? (ctx.fields.get(column.slice('field:'.length))?.label ?? column.slice('field:'.length))
      : t(`col.${column}`);

  const text = (row: TableRow, column: string) => {
    const value = cellText(row, column, ctx);
    if (column === 'status') return value === 'final' ? search('final') : search('draft');
    if (column === 'updated') return date.format(new Date(value));
    return value;
  };

  const groupLabel = (g: { key: string; label: string }) => {
    if (g.label === '') return t('noValue');
    return config.group === 'status'
      ? g.key === 'final'
        ? search('final')
        : search('draft')
      : g.label;
  };

  return (
    <div>
      <p className="role" aria-live="polite">
        {t('count', { count: rows.length })}
      </p>
      {truncatedAt ? (
        <p className="message message-info">{t('truncated', { count: truncatedAt })}</p>
      ) : null}
      {rows.length === 0 ? (
        <p className="empty">{t('empty')}</p>
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label={t('scrollRegion')}>
          <table className="data-table">
            <caption className="sr-only">{t('caption')}</caption>
            <thead>
              <tr>
                {config.columns.map((column) => {
                  const active = config.sort.by === column;
                  const next = active && config.sort.dir === 'asc' ? 'desc' : 'asc';
                  return (
                    <th
                      key={column}
                      scope="col"
                      aria-sort={
                        active
                          ? config.sort.dir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      <Link
                        href={sortHref(column, next)}
                        title={t('sortBy', { column: label(column) })}
                      >
                        {label(column)}
                        {active ? (
                          <span aria-hidden="true">{config.sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>
                        ) : null}
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key || 'all'}>
                {config.group ? (
                  <tr className="data-group">
                    <th scope="colgroup" colSpan={config.columns.length}>
                      {groupLabel(g)} <span className="role">({g.rows.length})</span>
                    </th>
                  </tr>
                ) : null}
                {g.rows.map((row) => (
                  <tr key={row.id}>
                    {config.columns.map((column) =>
                      column === 'title' ? (
                        <th key={column} scope="row">
                          <Link href={`/worlds/${worldId}/snippets/${row.id}`}>{row.title}</Link>
                        </th>
                      ) : (
                        <td key={column}>{text(row, column)}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
