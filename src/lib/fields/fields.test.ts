import { describe, expect, it } from 'vitest';
import {
  fieldDefinitionSchema,
  fieldsSchema,
  keyFromLabel,
  validateSnippetFields,
  validateValue,
  type FieldDefinition,
} from './fields';

const def = (over: Partial<FieldDefinition> & Pick<FieldDefinition, 'type'>): FieldDefinition =>
  ({ key: 'campo', label: 'Campo', ...over }) as FieldDefinition;

describe('fieldDefinitionSchema', () => {
  it('accetta una definizione valida', () => {
    expect(fieldDefinitionSchema.safeParse(def({ type: 'text' })).success).toBe(true);
  });

  it.each(['Campo', '1campo', 'ha spazi', '', 'x'.repeat(41)])('rifiuta la chiave %j', (key) => {
    expect(fieldDefinitionSchema.safeParse(def({ type: 'text', key })).success).toBe(false);
  });

  it('richiede opzioni univoche per una scelta e le vieta altrove', () => {
    expect(fieldDefinitionSchema.safeParse(def({ type: 'choice' })).success).toBe(false);
    expect(
      fieldDefinitionSchema.safeParse(def({ type: 'choice', options: ['a', 'a'] })).success,
    ).toBe(false);
    expect(
      fieldDefinitionSchema.safeParse(def({ type: 'choice', options: ['vivo', 'morto'] })).success,
    ).toBe(true);
    expect(fieldDefinitionSchema.safeParse(def({ type: 'text', options: ['a'] })).success).toBe(
      false,
    );
  });

  it('accetta min/max solo per i numeri e con min ≤ max', () => {
    expect(fieldDefinitionSchema.safeParse(def({ type: 'number', min: 1, max: 5 })).success).toBe(
      true,
    );
    expect(fieldDefinitionSchema.safeParse(def({ type: 'number', min: 6, max: 5 })).success).toBe(
      false,
    );
    expect(fieldDefinitionSchema.safeParse(def({ type: 'text', min: 1 })).success).toBe(false);
  });
});

describe('fieldsSchema', () => {
  it('rifiuta chiavi duplicate', () => {
    const r = fieldsSchema.safeParse([def({ type: 'text' }), def({ type: 'number' })]);
    expect(r.success).toBe(false);
  });
  it('accetta una lista vuota', () => {
    expect(fieldsSchema.safeParse([]).success).toBe(true);
  });
});

describe('validateValue', () => {
  it('testo: stringa entro il limite', () => {
    expect(validateValue(def({ type: 'text' }), 'ciao')).toEqual({ ok: true, value: 'ciao' });
    expect(validateValue(def({ type: 'text' }), 42).ok).toBe(false);
    expect(validateValue(def({ type: 'text' }), 'x'.repeat(10_001)).ok).toBe(false);
  });

  it('numero: finito e nei limiti', () => {
    const d = def({ type: 'number', min: 1, max: 30 });
    expect(validateValue(d, 10)).toEqual({ ok: true, value: 10 });
    expect(validateValue(d, 0).ok).toBe(false);
    expect(validateValue(d, 31).ok).toBe(false);
    expect(validateValue(d, Number.NaN).ok).toBe(false);
    expect(validateValue(d, '10').ok).toBe(false);
  });

  it('data: ISO reale', () => {
    const d = def({ type: 'date' });
    expect(validateValue(d, '2026-02-28').ok).toBe(true);
    expect(validateValue(d, '2026-02-30').ok).toBe(false);
    expect(validateValue(d, '28/02/2026').ok).toBe(false);
  });

  it('data in calendario custom: struttura con anno intero', () => {
    const d = def({ type: 'calendar_date' });
    expect(validateValue(d, { calendar: 'cal-1', year: -120, month: 3, day: 9 }).ok).toBe(true);
    expect(validateValue(d, { calendar: 'cal-1', year: 1.5, month: 3, day: 9 }).ok).toBe(false);
    expect(validateValue(d, { year: 1 }).ok).toBe(false);
  });

  it('scelta: solo un’opzione definita', () => {
    const d = def({ type: 'choice', options: ['vivo', 'morto'] });
    expect(validateValue(d, 'vivo').ok).toBe(true);
    expect(validateValue(d, 'disperso').ok).toBe(false);
  });

  it('riferimento a snippet: uuid', () => {
    const d = def({ type: 'snippet_ref' });
    expect(validateValue(d, '3f2b8c1e-6d4a-4b7e-9c1a-2f5d8e7a9b10').ok).toBe(true);
    expect(validateValue(d, 'non-uuid').ok).toBe(false);
  });

  it('coordinate: x e y in [0, 1], mappa opzionale', () => {
    const d = def({ type: 'coordinates' });
    expect(validateValue(d, { x: 0.25, y: 0.75 }).ok).toBe(true);
    expect(
      validateValue(d, { x: 0.5, y: 0.5, map: '3f2b8c1e-6d4a-4b7e-9c1a-2f5d8e7a9b10' }).ok,
    ).toBe(true);
    expect(validateValue(d, { x: 1.2, y: 0.5 }).ok).toBe(false);
    expect(validateValue(d, { x: 0.5 }).ok).toBe(false);
  });

  it('immagine: percorso relativo senza traversal', () => {
    const d = def({ type: 'image' });
    expect(validateValue(d, { path: 'worlds/abc/mappa.png', alt: 'Mappa' }).ok).toBe(true);
    expect(validateValue(d, { path: '../etc/passwd' }).ok).toBe(false);
    expect(validateValue(d, { path: '/assoluto.png' }).ok).toBe(false);
    expect(validateValue(d, { path: 'https://evil.test/x.png' }).ok).toBe(false);
  });
});

describe('validateSnippetFields', () => {
  const defs = [
    def({ key: 'eta', label: 'Età', type: 'number', min: 0, required: true }),
    def({ key: 'nota', label: 'Nota', type: 'text' }),
  ];

  it('restituisce gli errori per campo e i valori validi', () => {
    const r = validateSnippetFields(defs, { eta: -3, nota: 'ok' }, { enforceRequired: false });
    expect(r.errors).toEqual({ eta: 'invalid' });
    expect(r.values).toEqual({ nota: 'ok' });
  });

  it('i campi obbligatori pesano solo se richiesto (stato definitivo)', () => {
    expect(validateSnippetFields(defs, {}, { enforceRequired: false }).errors).toEqual({});
    expect(validateSnippetFields(defs, {}, { enforceRequired: true }).errors).toEqual({
      eta: 'required',
    });
  });

  it('valori vuoti (null, stringa vuota) equivalgono a assenti', () => {
    const r = validateSnippetFields(defs, { eta: '', nota: null }, { enforceRequired: false });
    expect(r.errors).toEqual({});
    expect(r.values).toEqual({});
  });

  it('conserva i valori di campi che la categoria non definisce (cambio categoria senza perdita)', () => {
    const r = validateSnippetFields(
      defs,
      { eta: 30, vecchio: 'resta', altro: { a: 1 } },
      {
        enforceRequired: false,
      },
    );
    expect(r.errors).toEqual({});
    expect(r.values).toEqual({ eta: 30, vecchio: 'resta', altro: { a: 1 } });
  });

  it('con più categorie unisce i campi e non duplica le chiavi', () => {
    const r = validateSnippetFields(
      [...defs, def({ key: 'nota', label: 'Nota bis', type: 'text' })],
      { nota: 'x' },
      { enforceRequired: false },
    );
    expect(r.values).toEqual({ nota: 'x' });
  });
});

describe('keyFromLabel', () => {
  it('normalizza accenti, spazi e simboli', () => {
    expect(keyFromLabel('Età del personaggio')).toBe('eta_del_personaggio');
    expect(keyFromLabel('  Punti-ferita (PF) ')).toBe('punti_ferita_pf');
  });
  it('prefissa i valori che non iniziano con una lettera e taglia a 40', () => {
    expect(keyFromLabel('3 lune')).toBe('campo_3_lune');
    expect(keyFromLabel('a'.repeat(60))).toHaveLength(40);
  });
  it('evita le collisioni con le chiavi esistenti', () => {
    expect(keyFromLabel('Nome', ['nome'])).toBe('nome_2');
    expect(keyFromLabel('Nome', ['nome', 'nome_2'])).toBe('nome_3');
  });
  it('etichetta senza caratteri utili → chiave di ripiego', () => {
    expect(keyFromLabel('???')).toBe('campo');
  });
});
