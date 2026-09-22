import { describe, expect, it } from 'vitest';
import type { DocNode } from '@/lib/snippets/body';
import { planMarkdownImport } from './markdown-plan';

const ids = () => {
  let n = 0;
  return () => `11111111-1111-4111-8111-${String(++n).padStart(12, '0')}`;
};

describe('planMarkdownImport', () => {
  it('un file diventa uno snippet; il titolo viene dal front matter', () => {
    const plan = planMarkdownImport(
      'Aurelia',
      [{ name: 'aragorn.md', content: '---\ntitle: Aragorn\ntags: [eroe]\n---\nRe di Gondor.' }],
      ids(),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.snippets).toHaveLength(1);
    expect(plan.snippets[0]?.title).toBe('Aragorn');
    expect(plan.snippets[0]?.tags).toEqual(['eroe']);
    expect(plan.snippets[0]?.visibility).toBe('members');
  });

  it('senza front matter il titolo viene dal nome del file', () => {
    const plan = planMarkdownImport(
      'Aurelia',
      [{ name: 'Isolato.md', content: 'Nota libera.' }],
      ids(),
    );
    expect(plan.ok && plan.snippets[0]?.title).toBe('Isolato');
  });

  it('un wikilink verso un altro file diventa una menzione risolta', () => {
    const plan = planMarkdownImport(
      'Aurelia',
      [
        { name: 'aragorn.md', content: '---\ntitle: Aragorn\n---\nAmico di [[Legolas]].' },
        { name: 'legolas.md', content: '---\ntitle: Legolas\n---\nElfo.' },
      ],
      ids(),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const aragorn = plan.snippets.find((s) => s.title === 'Aragorn');
    const legolas = plan.snippets.find((s) => s.title === 'Legolas');
    const body = aragorn?.body as DocNode | undefined;
    const paragraph = body?.content?.[0];
    expect(paragraph?.content).toContainEqual({ type: 'mention', attrs: { id: legolas?.id } });
    // La menzione produce anche la relazione esplicita (l'importazione scrive le righe direttamente,
    // non passa da `save_snippet`, che di norma la sincronizza da sola).
    expect(plan.relations).toEqual([
      expect.objectContaining({
        source_id: aragorn?.id,
        target_id: legolas?.id,
        label: 'menziona',
        from_mention: true,
      }),
    ]);
  });

  it('un wikilink verso se stessi non crea una menzione né una relazione', () => {
    const plan = planMarkdownImport(
      'Aurelia',
      [{ name: 'aragorn.md', content: '---\ntitle: Aragorn\n---\nSono [[Aragorn]].' }],
      ids(),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.relations).toEqual([]);
    const body = plan.snippets[0]?.body as DocNode | undefined;
    const text = body?.content?.[0]?.content?.map((n) => n.text).join('');
    expect(text).toContain('Aragorn');
  });

  it('un wikilink verso un titolo assente resta testo semplice', () => {
    const plan = planMarkdownImport(
      'Aurelia',
      [{ name: 'a.md', content: 'Vedi [[Nessuno]].' }],
      ids(),
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const body = plan.snippets[0]?.body as DocNode | undefined;
    const text = body?.content?.[0]?.content?.map((n) => n.text).join('');
    expect(text).toContain('Nessuno');
  });

  it('nessun file è un errore', () => {
    expect(planMarkdownImport('Aurelia', [], ids())).toEqual({
      ok: false,
      error: expect.any(String),
    });
  });

  it('genera un mondo senza categorie né relazioni quando non ci sono wikilink', () => {
    const plan = planMarkdownImport('Aurelia', [{ name: 'a.md', content: 'x' }], ids());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.categories).toEqual([]);
    expect(plan.relations).toEqual([]);
    expect(plan.world.name).toBe('Aurelia');
  });
});
