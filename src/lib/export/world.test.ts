import { describe, expect, it } from 'vitest';
import { buildExport, parseExport, planImport, type RawWorld } from './world';

const ids = {
  cChar: '11111111-1111-4111-8111-111111111111',
  cPlace: '22222222-2222-4222-8222-222222222222',
  sA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  sB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  sTrashed: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
};

const mention = (id: string) => ({ type: 'mention', attrs: { id } });
const doc = (...inline: unknown[]) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: inline }],
});

const raw: RawWorld = {
  world: { name: 'Aurelia' },
  categories: [
    {
      id: ids.cPlace,
      name: 'Luogo',
      icon: 'map-pin',
      color: 'teal',
      fields_schema: [],
      content_template: null,
    },
    {
      id: ids.cChar,
      name: 'Personaggio',
      icon: null,
      color: null,
      fields_schema: [{ key: 'eta', label: 'Età', type: 'number' }],
      content_template: null,
    },
  ],
  snippets: [
    {
      id: ids.sA,
      title: 'Elara',
      status: 'final',
      visibility: 'members',
      archived_at: null,
      deleted_at: null,
      tags: ['eroe'],
      aliases: ['La Saggia'],
      fields: { eta: 42 },
      body: doc({ type: 'text', text: 'Vive a ' }, mention(ids.sB), mention(ids.sTrashed)),
      created_at: '2026-01-01T10:00:00+00:00',
      category_ids: [ids.cChar],
    },
    {
      id: ids.sB,
      title: 'Porto Verde',
      status: 'draft',
      visibility: 'public',
      archived_at: '2026-02-01T00:00:00+00:00',
      deleted_at: null,
      tags: [],
      aliases: [],
      fields: {},
      body: doc(),
      created_at: '2026-01-02T10:00:00+00:00',
      category_ids: [ids.cPlace],
    },
    {
      id: ids.sTrashed,
      title: 'Cancellato',
      status: 'draft',
      visibility: 'members',
      archived_at: null,
      deleted_at: '2026-03-01T00:00:00+00:00',
      tags: [],
      aliases: [],
      fields: {},
      body: doc(),
      created_at: '2026-01-03T10:00:00+00:00',
      category_ids: [],
    },
  ],
  relationTypes: [
    {
      label: 'abita a',
      inverse_label: 'ospita',
      source_category_id: ids.cChar,
      target_category_id: ids.cPlace,
    },
  ],
  relations: [
    {
      source_id: ids.sA,
      target_id: ids.sB,
      label: 'abita a',
      inverse_label: 'ospita',
      notes: 'dal 12°',
      valid_from: { calendar: 'default', year: 12 },
      valid_to: null,
      from_mention: false,
      visibility: 'members',
      created_at: '2026-01-04T10:00:00+00:00',
    },
    {
      source_id: ids.sA,
      target_id: ids.sB,
      label: 'menziona',
      inverse_label: 'menzionato in',
      notes: '',
      valid_from: null,
      valid_to: null,
      from_mention: true,
      visibility: 'members',
      created_at: '2026-01-05T10:00:00+00:00',
    },
    {
      // verso uno snippet nel cestino: non si esporta
      source_id: ids.sA,
      target_id: ids.sTrashed,
      label: 'conosce',
      inverse_label: null,
      notes: '',
      valid_from: null,
      valid_to: null,
      from_mention: false,
      visibility: 'members',
      created_at: '2026-01-06T10:00:00+00:00',
    },
  ],
};

describe('buildExport', () => {
  const out = buildExport(raw);

  it('dichiara formato e versione, senza dati variabili come la data di esportazione', () => {
    expect(out.format).toBe('worldloom.world');
    expect(out.version).toBe(1);
    expect(Object.keys(out)).not.toContain('exportedAt');
  });

  it('usa riferimenti ordinali al posto degli id e ordina per data di creazione', () => {
    expect(out.snippets.map((s) => s.ref)).toEqual(['s1', 's2']);
    expect(out.snippets.map((s) => s.title)).toEqual(['Elara', 'Porto Verde']);
    expect(out.categories.map((c) => [c.ref, c.name])).toEqual([
      ['c1', 'Luogo'],
      ['c2', 'Personaggio'],
    ]);
    expect(out.snippets[0]?.categories).toEqual(['c2']);
    expect(JSON.stringify(out)).not.toContain(ids.sA);
  });

  it('esclude gli snippet nel cestino e le relazioni che li toccano', () => {
    expect(out.snippets.some((s) => s.title === 'Cancellato')).toBe(false);
    expect(out.relations.map((r) => r.label)).toEqual(['abita a', 'menziona']);
  });

  it('riscrive le menzioni con i riferimenti e toglie quelle verso snippet non esportati', () => {
    expect(out.snippets[0]?.body).toEqual(doc({ type: 'text', text: 'Vive a ' }, mention('s2')));
  });

  it('mantiene i vincoli dei tipi di relazione come riferimenti alle categorie', () => {
    expect(out.relationTypes).toEqual([
      { label: 'abita a', inverseLabel: 'ospita', sourceCategory: 'c2', targetCategory: 'c1' },
    ]);
  });
});

describe('parseExport', () => {
  it('accetta un export valido dopo il passaggio da JSON', () => {
    const result = parseExport(JSON.parse(JSON.stringify(buildExport(raw))));
    expect(result.ok).toBe(true);
  });

  it.each([
    ['non è un oggetto', 'ciao'],
    ['formato sbagliato', { format: 'altro', version: 1 }],
    ['versione futura', { ...buildExport(raw), version: 2 }],
    [
      'riferimento a una categoria inesistente',
      {
        ...buildExport(raw),
        snippets: [{ ...buildExport(raw).snippets[0], categories: ['c99'] }],
      },
    ],
    [
      'relazione verso uno snippet inesistente',
      {
        ...buildExport(raw),
        relations: [{ ...buildExport(raw).relations[0], target: 's99' }],
      },
    ],
    [
      'riferimenti doppi',
      {
        ...buildExport(raw),
        snippets: [buildExport(raw).snippets[0], buildExport(raw).snippets[0]],
      },
    ],
    [
      'stato non valido',
      { ...buildExport(raw), snippets: [{ ...buildExport(raw).snippets[0], status: 'x' }] },
    ],
  ])('rifiuta: %s', (_name, input) => {
    expect(parseExport(input).ok).toBe(false);
  });

  it('rifiuta più di 5000 snippet', () => {
    const base = buildExport(raw);
    const many = Array.from({ length: 5001 }, (_, i) => ({
      ...base.snippets[0],
      ref: `s${i + 1}`,
    }));
    expect(parseExport({ ...base, snippets: many }).ok).toBe(false);
  });
});

describe('planImport', () => {
  const fresh = () => {
    let n = 0;
    return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  };

  it('round trip: esportare, importare e riesportare dà lo stesso documento', () => {
    const first = buildExport(raw);
    const parsed = parseExport(JSON.parse(JSON.stringify(first)));
    if (!parsed.ok) throw new Error(parsed.error);
    const plan = planImport(parsed.data, fresh());
    if (!plan.ok) throw new Error(plan.error);
    const second = buildExport({
      world: { name: plan.world.name },
      categories: plan.categories,
      snippets: plan.snippets.map((s) => ({
        ...s,
        deleted_at: null,
        category_ids: plan.snippetCategories
          .filter((c) => c.snippet_id === s.id)
          .map((c) => c.category_id),
      })),
      relationTypes: plan.relationTypes,
      relations: plan.relations,
    });
    expect(second).toEqual(first);
  });

  it('assegna id nuovi e ricollega menzioni, categorie e relazioni', () => {
    const parsed = parseExport(buildExport(raw));
    if (!parsed.ok) throw new Error(parsed.error);
    const plan = planImport(parsed.data, fresh());
    if (!plan.ok) throw new Error(plan.error);
    const [a, b] = plan.snippets;
    expect(a?.id).not.toBe(ids.sA);
    expect(a?.body).toEqual(doc({ type: 'text', text: 'Vive a ' }, mention(b?.id ?? '')));
    expect(plan.relations[0]).toMatchObject({ source_id: a?.id, target_id: b?.id });
    expect(plan.snippetCategories).toHaveLength(2);
  });

  it('rifiuta un corpo non valido invece di sostituirlo con uno vuoto', () => {
    const base = buildExport(raw);
    const bad = {
      ...base,
      snippets: [{ ...base.snippets[0], body: { type: 'nope' } }],
      relations: [],
    };
    const parsed = parseExport(bad);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(planImport(parsed.data, fresh()).ok).toBe(false);
  });

  it('toglie i link non sicuri dal corpo', () => {
    const base = buildExport(raw);
    const evil = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    };
    const parsed = parseExport({
      ...base,
      snippets: [{ ...base.snippets[0], body: evil }],
      relations: [],
    });
    if (!parsed.ok) throw new Error(parsed.error);
    const plan = planImport(parsed.data, fresh());
    if (!plan.ok) throw new Error(plan.error);
    expect(JSON.stringify(plan.snippets[0]?.body)).not.toContain('javascript');
  });
});

describe('ordine delle chiavi', () => {
  it('il testo dell’export non dipende dall’ordine delle chiavi jsonb (Postgres le riordina)', () => {
    const shuffled: RawWorld = {
      ...raw,
      snippets: raw.snippets.map((s) => ({
        ...s,
        fields: Object.fromEntries(Object.entries({ zeta: 1, eta: 42 }).reverse()),
        body: { content: (s.body as { content: unknown }).content, type: 'doc' },
      })),
      relations: raw.relations.map((r) => ({
        ...r,
        valid_from: r.valid_from ? { year: 12, calendar: 'default' } : null,
      })),
    };
    const a = JSON.stringify(buildExport(shuffled));
    const b = JSON.stringify(
      buildExport({
        ...shuffled,
        snippets: shuffled.snippets.map((s) => ({
          ...s,
          fields: { eta: 42, zeta: 1 },
          body: { type: 'doc', content: (s.body as { content: unknown }).content },
        })),
        relations: shuffled.relations.map((r) => ({
          ...r,
          valid_from: r.valid_from ? { calendar: 'default', year: 12 } : null,
        })),
      }),
    );
    expect(a).toBe(b);
  });
});

describe('robustezza dell’importazione', () => {
  const fresh = () => {
    let n = 0;
    return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  };
  const base = buildExport(raw);
  const withSnippet = (patch: Record<string, unknown>) => ({
    ...base,
    snippets: [{ ...base.snippets[0], ...patch }],
    relations: [],
  });

  it('toglie le immagini dal testo: puntano ai file del mondo di origine', () => {
    const body = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'ciao' }] },
        {
          type: 'image',
          attrs: {
            src: '/worlds/11111111-1111-4111-8111-111111111111/images/22222222-2222-4222-8222-222222222222.png',
          },
        },
      ],
    };
    const parsed = parseExport(withSnippet({ body }));
    if (!parsed.ok) throw new Error(parsed.error);
    const plan = planImport(parsed.data, fresh());
    if (!plan.ok) throw new Error(plan.error);
    expect(JSON.stringify(plan.snippets[0]?.body)).not.toContain('image');
    expect(JSON.stringify(plan.snippets[0]?.body)).toContain('ciao');
  });

  it('rifiuta campi personalizzati troppo grandi', () => {
    const huge = { nota: 'x'.repeat(200_000) };
    expect(parseExport(withSnippet({ fields: huge })).ok).toBe(false);
  });

  it('accetta solo un modello di contenuto nullo', () => {
    const withTemplate = {
      ...base,
      categories: [{ ...base.categories[0], contentTemplate: { type: 'doc' } }],
      snippets: [],
      relations: [],
      relationTypes: [],
    };
    expect(parseExport(withTemplate).ok).toBe(false);
  });
});

describe('esportazione come modello (#43): solo struttura, senza contenuto', () => {
  // Stesso formato v1, con snippet e relazioni vuoti: il chiamante (la rotta di export) filtra i dati grezzi
  // prima di chiamare buildExport — nessun codice nuovo qui, si verifica solo che il risultato resti valido.
  const template = buildExport({ ...raw, snippets: [], relations: [] });

  it('mantiene categorie e tipi di relazione, senza snippet né relazioni', () => {
    expect(template.categories).toHaveLength(2);
    expect(template.relationTypes).toHaveLength(1);
    expect(template.snippets).toEqual([]);
    expect(template.relations).toEqual([]);
  });

  it('si importa come un mondo nuovo con la struttura ma senza contenuto', () => {
    const parsed = parseExport(template);
    if (!parsed.ok) throw new Error(parsed.error);
    let n = 0;
    const plan = planImport(
      parsed.data,
      () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    );
    if (!plan.ok) throw new Error(plan.error);
    expect(plan.categories).toHaveLength(2);
    expect(plan.relationTypes).toHaveLength(1);
    expect(plan.snippets).toEqual([]);
    expect(plan.relations).toEqual([]);
  });
});

describe('campi riservati', () => {
  const withSecret: RawWorld = {
    ...raw,
    snippets: raw.snippets.map((s) =>
      s.id === ids.sA
        ? {
            ...s,
            fields: { eta: 42, segreto: 'è un drago' },
            restricted: { segreto: 'secret' as const },
          }
        : s,
    ),
  };

  it("l'export include il valore e la sua visibilità solo per chi lo ha letto", () => {
    const file = buildExport(withSecret);
    const elara = file.snippets.find((s) => s.title === 'Elara');
    expect(elara?.fields).toEqual({ eta: 42, segreto: 'è un drago' });
    expect(elara?.fieldVisibility).toEqual({ segreto: 'secret' });
    // Gli snippet senza campi riservati non hanno la chiave: i file esistenti non cambiano.
    expect(file.snippets.find((s) => s.title === 'Porto Verde')).not.toHaveProperty(
      'fieldVisibility',
    );
    // Un giocatore che non ha letto il valore non lo trova nel file.
    const reader = buildExport(raw).snippets.find((s) => s.title === 'Elara');
    expect(reader?.fields).toEqual({ eta: 42 });
  });

  it("l'importazione rimette il valore nella tabella riservata, mai nella colonna pubblica", () => {
    const parsed = parseExport(JSON.parse(JSON.stringify(buildExport(withSecret))));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    let n = 0;
    const plan = planImport(
      parsed.data,
      () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    );
    if (!plan.ok) throw new Error(plan.error);
    const elara = plan.snippets.find((s) => s.title === 'Elara');
    expect(elara?.fields).toEqual({ eta: 42 });
    expect(plan.restrictedFields).toEqual([
      { snippet_id: elara?.id, key: 'segreto', value: 'è un drago' },
    ]);
  });

  it('un file con una chiave di visibilità non valida è rifiutato', () => {
    const file = JSON.parse(JSON.stringify(buildExport(withSecret)));
    file.snippets[0].fieldVisibility = { 'Chiave Non Valida': 'secret' };
    expect(parseExport(file).ok).toBe(false);
    file.snippets[0].fieldVisibility = { segreto: 'public' };
    expect(parseExport(file).ok).toBe(false);
  });
});
