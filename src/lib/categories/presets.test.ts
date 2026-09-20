import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import it_ from '../../../messages/it.json';
import { CATEGORY_COLORS, CATEGORY_ICONS, categoryInputSchema } from './catalog';
import { PRESETS, buildPreset, type PresetText } from './presets';

const catalogs = { it: it_.Presets, en: en.Presets } as const;

function textFor(locale: keyof typeof catalogs): PresetText {
  return {
    text(key) {
      const value = key
        .split('.')
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown> | undefined)?.[part],
          catalogs[locale],
        );
      if (typeof value !== 'string')
        throw new Error(`Messaggio mancante: Presets.${key} (${locale})`);
      return value;
    },
  };
}

describe('preset di categorie', () => {
  it('coprono i sette preset della specifica', () => {
    expect(PRESETS.map((p) => p.id)).toEqual([
      'character',
      'place',
      'event',
      'chapter',
      'item',
      'faction',
      'rule',
    ]);
  });

  it.each(['it', 'en'] as const)('ogni preset è valido e tradotto (%s)', (locale) => {
    for (const preset of PRESETS) {
      const built = buildPreset(preset, textFor(locale));
      expect(categoryInputSchema.safeParse(built).success).toBe(true);
      expect(built.fields.length).toBeGreaterThan(0);
    }
  });

  it('usa solo icone e colori del catalogo', () => {
    for (const p of PRESETS) {
      expect(CATEGORY_ICONS).toContain(p.icon);
      expect(CATEGORY_COLORS).toContain(p.color);
    }
  });

  it('le scelte hanno opzioni con etichette tradotte e univoche', () => {
    const built = buildPreset(PRESETS[0]!, textFor('it'));
    const status = built.fields.find((f) => f.key === 'status');
    expect(status?.options).toEqual(['Vivo', 'Morto', 'Disperso', 'Sconosciuto']);
  });

  it('fallisce in modo esplicito se manca una traduzione', () => {
    expect(() =>
      buildPreset(PRESETS[0]!, {
        text: () => {
          throw new Error('manca');
        },
      }),
    ).toThrow('manca');
  });
});
