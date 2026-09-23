import { describe, expect, it } from 'vitest';
import { buildZip, readZip } from '@/lib/zip/store';
import { buildMarkdownBundle } from './markdown-bundle';
import { buildExport, parseExport, planImport, type RawWorld } from './world';

const mention = (id: string) => ({ type: 'mention', attrs: { id } });
const doc = (...inline: unknown[]) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: inline }],
});

const raw: RawWorld = {
  world: { name: 'Aurelia' },
  categories: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Personaggio',
      icon: null,
      color: null,
      fields_schema: [],
      content_template: null,
    },
  ],
  snippets: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Elara',
      status: 'final',
      visibility: 'members',
      archived_at: null,
      deleted_at: null,
      tags: ['eroe'],
      aliases: [],
      fields: {},
      body: doc({ type: 'text', text: 'Vive a ' }, mention('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
      created_at: '2026-01-01T10:00:00+00:00',
      category_ids: ['11111111-1111-4111-8111-111111111111'],
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'Porto Verde',
      status: 'draft',
      visibility: 'public',
      archived_at: null,
      deleted_at: null,
      tags: [],
      aliases: [],
      fields: {},
      body: doc(),
      created_at: '2026-01-02T10:00:00+00:00',
      category_ids: [],
    },
  ],
  relationTypes: [],
  relations: [],
};

describe('buildMarkdownBundle', () => {
  const entries = buildMarkdownBundle(raw);

  it('include _worldloom.json e un file .md per snippet', () => {
    expect(entries.map((e) => e.name)).toEqual(['_worldloom.json', 'elara.md', 'porto-verde.md']);
  });

  it('_worldloom.json è esattamente l’export JSON esistente', () => {
    const json = new TextDecoder().decode(entries[0]?.data);
    expect(JSON.parse(json)).toEqual(buildExport(raw));
  });

  it('il file .md ha front matter e corpo con wikilink per le menzioni', () => {
    const text = new TextDecoder().decode(entries[1]?.data);
    expect(text).toContain('title: Elara');
    expect(text).toContain('status: final');
    expect(text).toContain('categories: [Personaggio]');
    expect(text).toContain('tags: [eroe]');
    expect(text).toContain('Vive a [[Porto Verde]]');
  });

  it('round trip via zip: decomprimere, leggere _worldloom.json, importarlo', () => {
    const archive = buildZip(entries);
    const unzipped = readZip(archive);
    expect(unzipped?.map((e) => e.name)).toEqual(entries.map((e) => e.name));
    const json = JSON.parse(new TextDecoder().decode(unzipped?.[0]?.data));
    const parsed = parseExport(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    let n = 0;
    const plan = planImport(
      parsed.data,
      () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.snippets.map((s) => s.title)).toEqual(['Elara', 'Porto Verde']);
  });
});
