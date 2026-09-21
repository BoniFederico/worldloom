import type { Sheet } from '@/lib/characters/sheet';
import { fieldName, SPARE_ROWS } from '@/lib/characters/sheet';
import { defaultOf, type Sheet as Computed, type ValidSchema } from '@/lib/stats/compute';

type Item =
  | { kind: 'attribute'; key: string }
  | { kind: 'derived'; key: string }
  | { kind: 'resource'; key: string }
  | { kind: 'list'; key: string }
  | { kind: 'text'; key: string };

/**
 * I campi di una scheda generati dallo schema di statistiche, nell'ordine del `layout` (i campi che il layout non nomina
 * finiscono in «Altro»). Il modulo che li contiene lo fornisce chi lo usa: con `readOnly` sono campi disabilitati (anteprima).
 * I valori calcolati si mostrano a sola lettura e si aggiornano al salvataggio.
 */
/** Traduzione con i messaggi del gruppo `Characters` (`getTranslations` sul server, `useTranslations` nel browser). */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

export function CharacterSheetFields({
  valid,
  sheet,
  computed,
  readOnly = false,
  idPrefix = 'sheet',
  t,
}: {
  valid: ValidSchema;
  sheet: Sheet;
  computed: Computed;
  readOnly?: boolean;
  idPrefix?: string;
  t: Translate;
}) {
  const { schema } = valid;

  const items = new Map<string, Item>();
  for (const a of schema.attributes) items.set(a.key, { kind: 'attribute', key: a.key });
  for (const d of schema.derived) items.set(d.key, { kind: 'derived', key: d.key });
  for (const r of schema.resources) items.set(r.key, { kind: 'resource', key: r.key });
  for (const l of schema.lists) items.set(l.key, { kind: 'list', key: l.key });
  for (const x of schema.text) items.set(x.key, { kind: 'text', key: x.key });

  const placed = new Set<string>();
  const sections = schema.layout.map((s) => ({
    title: s.section,
    items: s.fields.flatMap((k) => {
      const item = items.get(k);
      if (!item || placed.has(k)) return [];
      placed.add(k);
      return [item];
    }),
  }));
  const rest = [...items.values()].filter((i) => !placed.has(i.key));
  if (rest.length) sections.push({ title: t('section.other'), items: rest });

  const attributeOf = new Map(schema.attributes.map((a) => [a.key, a]));
  const derivedOf = new Map(schema.derived.map((d) => [d.key, d]));
  const resourceOf = new Map(schema.resources.map((r) => [r.key, r]));
  const listOf = new Map(schema.lists.map((l) => [l.key, l]));
  const textOf = new Map(schema.text.map((x) => [x.key, x]));

  const render = (item: Item) => {
    const id = `${idPrefix}-${item.kind}-${item.key}`;
    if (item.kind === 'attribute') {
      const a = attributeOf.get(item.key)!;
      const value = sheet.attributes[a.key] ?? defaultOf(a);
      const hint =
        a.min !== undefined && a.max !== undefined
          ? t('range', { min: a.min, max: a.max })
          : a.min !== undefined
            ? t('min', { min: a.min })
            : a.max !== undefined
              ? t('upTo', { max: a.max })
              : null;
      return (
        <div className="field" key={id}>
          <label htmlFor={id}>{a.label}</label>
          <input
            id={id}
            name={fieldName.attribute(a.key)}
            type="number"
            inputMode={a.type === 'integer' ? 'numeric' : 'decimal'}
            step={a.type === 'integer' ? 1 : 'any'}
            min={a.min}
            max={a.max}
            defaultValue={value}
            disabled={readOnly}
          />
          {hint ? <span className="field-hint">{hint}</span> : null}
        </div>
      );
    }
    if (item.kind === 'derived') {
      const d = derivedOf.get(item.key)!;
      const value = computed.derived[d.key];
      return (
        <dl className="field stat" key={id}>
          <dt className="stat-label">{d.label}</dt>
          <dd className="stat-value">
            {value === null || value === undefined ? t('unavailable') : String(round(value))}
          </dd>
        </dl>
      );
    }
    if (item.kind === 'resource') {
      const r = resourceOf.get(item.key)!;
      const max = computed.max[r.key];
      const value = sheet.resources[r.key] ?? max ?? 0;
      return (
        <div className="field" key={id}>
          <label htmlFor={id}>{r.label}</label>
          <div className="resource">
            <input
              id={id}
              name={fieldName.resource(r.key)}
              type="number"
              inputMode="numeric"
              step={1}
              min={0}
              max={max ?? undefined}
              defaultValue={value}
              disabled={readOnly}
            />
            <span className="field-hint">
              {max === null || max === undefined
                ? t('unavailable')
                : t('maxValue', { max: round(max) })}
            </span>
          </div>
        </div>
      );
    }
    if (item.kind === 'list') {
      const l = listOf.get(item.key)!;
      const cols = Object.entries(l.item);
      const rows = sheet.lists[l.key] ?? [];
      const total = rows.length + (readOnly ? 1 : SPARE_ROWS);
      return (
        <fieldset className="fieldset stat-list" key={id}>
          <legend>{l.label}</legend>
          <table>
            <thead>
              <tr>
                {cols.map(([col]) => (
                  <th scope="col" key={col}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: total }, (_, i) => (
                <tr key={i}>
                  {cols.map(([col, type]) => (
                    <td key={col}>
                      <input
                        name={fieldName.cell(l.key, i, col)}
                        aria-label={t('rowLabel', { list: l.label, row: i + 1, column: col })}
                        type={type === 'text' ? 'text' : 'number'}
                        inputMode={
                          type === 'integer' ? 'numeric' : type === 'number' ? 'decimal' : undefined
                        }
                        step={type === 'integer' ? 1 : type === 'number' ? 'any' : undefined}
                        maxLength={type === 'text' ? 200 : undefined}
                        defaultValue={rows[i]?.[col] ?? ''}
                        disabled={readOnly}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {readOnly ? null : <p className="field-hint">{t('listHint')}</p>}
        </fieldset>
      );
    }
    const x = textOf.get(item.key)!;
    return (
      <div className="field" key={id}>
        <label htmlFor={id}>{x.label}</label>
        <textarea
          id={id}
          name={fieldName.text(x.key)}
          rows={4}
          maxLength={20000}
          defaultValue={sheet.text[x.key] ?? ''}
          disabled={readOnly}
        />
      </div>
    );
  };

  return (
    <>
      {sections.map((s, n) => (
        <fieldset className="fieldset sheet-section" key={n}>
          <legend>{s.title}</legend>
          {s.items.some((i) => i.kind === 'derived') && !readOnly ? (
            <p className="field-hint">{t('derivedHint')}</p>
          ) : null}
          {s.items.map(render)}
        </fieldset>
      ))}
    </>
  );
}

/** Al massimo due decimali, senza code di zeri. */
const round = (n: number) => Math.round(n * 100) / 100;
