import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '@/lib/fields/fields';
import type { Calendar } from '@/lib/calendars/calendar';
import { EDITABLE_TYPES, mergeFieldInput } from './form';

const defs: FieldDefinition[] = [
  { key: 'nome', label: 'Nome', type: 'text' },
  { key: 'eta', label: 'Età', type: 'number' },
  { key: 'nascita', label: 'Nascita', type: 'date' },
  { key: 'stato', label: 'Stato', type: 'choice', options: ['vivo', 'morto'] },
  { key: 'luogo', label: 'Luogo', type: 'snippet_ref' },
  { key: 'pos', label: 'Posizione', type: 'coordinates' },
  { key: 'fondazione', label: 'Fondazione', type: 'calendar_date' },
];

const calendar: Calendar = {
  months: [
    { name: 'Alba', days: 20 },
    { name: 'Zenit', days: 20 },
  ],
  weekdays: [],
  eras: [{ name: 'Seconda Era', start: 100 }],
  epochWeekday: 0,
};
const calendars = new Map([['cal-1', calendar]]);

const form = (values: Record<string, string>) => (name: string) => values[name];

describe('mergeFieldInput', () => {
  it('converte i valori del form per tipo', () => {
    const input = mergeFieldInput(
      defs,
      {},
      form({ 'f:nome': 'Elara', 'f:eta': '42', 'f:nascita': '2024-02-29', 'f:stato': 'vivo' }),
    );
    expect(input).toMatchObject({ nome: 'Elara', eta: 42, nascita: '2024-02-29', stato: 'vivo' });
  });

  it('un valore vuoto sovrascrive quello esistente (il campo si svuota)', () => {
    const input = mergeFieldInput(defs, { nome: 'Vecchio' }, form({ 'f:nome': '' }));
    expect(input.nome).toBe('');
  });

  it('un numero non valido resta non valido invece di sparire', () => {
    const input = mergeFieldInput(defs, {}, form({ 'f:eta': 'abc' }));
    expect(Number.isNaN(input.eta)).toBe(true);
  });

  it('conserva i valori dei tipi non modificabili da questo form e le chiavi orfane', () => {
    const existing = { pos: { x: 0.5, y: 0.5 }, vecchio: 'x' };
    const input = mergeFieldInput(defs, existing, form({ 'f:nome': 'A' }));
    expect(input.pos).toEqual({ x: 0.5, y: 0.5 });
    expect(input.vecchio).toBe('x');
  });

  it('un campo assente dal form non tocca il valore esistente', () => {
    const input = mergeFieldInput(defs, { nome: 'Resta' }, form({}));
    expect(input.nome).toBe('Resta');
  });

  it('elenca i tipi modificabili', () => {
    expect(EDITABLE_TYPES).toEqual([
      'text',
      'number',
      'date',
      'calendar_date',
      'choice',
      'snippet_ref',
    ]);
  });

  describe('data in calendario', () => {
    const date = (extra: Record<string, string> = {}) =>
      form({
        'f:fondazione:calendar': 'cal-1',
        'f:fondazione:era': 'Seconda Era',
        'f:fondazione:year': '12',
        'f:fondazione:month': '2',
        'f:fondazione:day': '7',
        ...extra,
      });

    it('compone il valore dai campi del calendario', () => {
      const input = mergeFieldInput(defs, {}, date(), calendars);
      expect(input.fondazione).toEqual({
        calendar: 'cal-1',
        year: 111,
        month: 2,
        day: 7,
        era: 'Seconda Era',
      });
    });

    it('campi vuoti svuotano il valore', () => {
      const input = mergeFieldInput(
        defs,
        { fondazione: { calendar: 'cal-1', year: 1, month: 1, day: 1 } },
        date({
          'f:fondazione:era': '',
          'f:fondazione:year': '',
          'f:fondazione:month': '',
          'f:fondazione:day': '',
        }),
        calendars,
      );
      expect(input.fondazione).toBe('');
    });

    it('un giorno inesistente o un calendario sconosciuto restano non validi', () => {
      const bad = mergeFieldInput(defs, {}, date({ 'f:fondazione:day': '21' }), calendars);
      expect(bad.fondazione).toEqual({ invalid: true });
      const unknown = mergeFieldInput(
        defs,
        {},
        date({ 'f:fondazione:calendar': 'altro' }),
        calendars,
      );
      expect(unknown.fondazione).toEqual({ invalid: true });
    });

    it('se il calendario del valore non esiste più i campi vuoti non cancellano la data', () => {
      const existing = { fondazione: { calendar: 'eliminato', year: 3, month: 1, day: 1 } };
      const empty = date({
        'f:fondazione:era': '',
        'f:fondazione:year': '',
        'f:fondazione:month': '',
        'f:fondazione:day': '',
      });
      expect(mergeFieldInput(defs, existing, empty, calendars).fondazione).toEqual(
        existing.fondazione,
      );
      // Con un valore digitato la data si sostituisce.
      expect(mergeFieldInput(defs, existing, date(), calendars).fondazione).toMatchObject({
        calendar: 'cal-1',
        year: 111,
      });
    });

    it('se il form non contiene il campo il valore esistente resta', () => {
      const existing = { fondazione: { calendar: 'cal-1', year: 3, month: 1, day: 1 } };
      expect(mergeFieldInput(defs, existing, form({}), calendars).fondazione).toEqual(
        existing.fondazione,
      );
    });
  });
});
