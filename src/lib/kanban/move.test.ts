import { describe, expect, it } from 'vitest';
import type { FieldDefinition } from '@/lib/fields/fields';
import { planMove } from './move';

const stato: FieldDefinition = {
  key: 'stato',
  label: 'Stato',
  type: 'choice',
  options: ['Idea', 'In corso', 'Fatto'],
};
const titolo: FieldDefinition = { key: 'nota', label: 'Nota', type: 'text', required: true };

const base = { status: 'draft', fields: { stato: 'Idea' } as Record<string, unknown> };

describe('planMove per campo a scelta', () => {
  it("imposta un'opzione valida senza toccare gli altri campi", () => {
    const r = planMove({
      ...base,
      fields: { stato: 'Idea', altro: 1 },
      by: 'stato',
      to: 'Fatto',
      defs: [stato],
    });
    expect(r).toEqual({ ok: true, patch: { fields: { stato: 'Fatto', altro: 1 } } });
  });

  it("rifiuta un'opzione che non esiste e un campo che non è a scelta", () => {
    expect(planMove({ ...base, by: 'stato', to: 'Boh', defs: [stato] })).toEqual({
      ok: false,
      error: 'invalid_target',
    });
    expect(planMove({ ...base, by: 'nota', to: 'x', defs: [titolo] })).toEqual({
      ok: false,
      error: 'unknown_field',
    });
    expect(planMove({ ...base, by: 'stato', to: 'Fatto', defs: [] })).toEqual({
      ok: false,
      error: 'unknown_field',
    });
  });

  it('svuotare toglie il valore; se è obbligatorio e lo snippet è definitivo, no', () => {
    expect(planMove({ ...base, by: 'stato', to: '', defs: [stato] })).toEqual({
      ok: true,
      patch: { fields: {} },
    });
    const required = { ...stato, required: true };
    expect(planMove({ ...base, by: 'stato', to: '', defs: [required] })).toEqual({
      ok: true,
      patch: { fields: {} },
    });
    expect(planMove({ ...base, status: 'final', by: 'stato', to: '', defs: [required] })).toEqual({
      ok: false,
      error: 'required',
    });
  });

  it('accetta un’opzione di un’altra categoria che definisce lo stesso campo', () => {
    const altra: FieldDefinition = { ...stato, options: ['Idea', 'Sospeso'] };
    const r = planMove({ ...base, by: 'stato', to: 'Sospeso', defs: [stato, altra] });
    expect(r).toEqual({ ok: true, patch: { fields: { stato: 'Sospeso' } } });
  });
});

describe('planMove per stato', () => {
  it('passa tra bozza e definitivo', () => {
    expect(planMove({ ...base, by: 'status', to: 'final', defs: [stato] })).toEqual({
      ok: true,
      patch: { status: 'final' },
    });
    expect(planMove({ ...base, status: 'final', by: 'status', to: 'draft', defs: [] })).toEqual({
      ok: true,
      patch: { status: 'draft' },
    });
    expect(planMove({ ...base, by: 'status', to: 'boh', defs: [] })).toEqual({
      ok: false,
      error: 'invalid_target',
    });
    expect(planMove({ ...base, by: 'status', to: '', defs: [] })).toEqual({
      ok: false,
      error: 'invalid_target',
    });
  });

  it('diventare definitivo richiede i campi obbligatori, come il salvataggio', () => {
    expect(planMove({ ...base, by: 'status', to: 'final', defs: [titolo] })).toEqual({
      ok: false,
      error: 'required',
    });
    expect(
      planMove({ ...base, fields: { nota: 'ok' }, by: 'status', to: 'final', defs: [titolo] }).ok,
    ).toBe(true);
  });

  it('un valore non valido (opzione rimossa) non si confonde con un campo mancante', () => {
    const r = planMove({
      ...base,
      fields: { stato: 'Vecchio' },
      by: 'status',
      to: 'final',
      defs: [stato],
    });
    expect(r).toEqual({ ok: false, error: 'invalid_fields' });
  });
});
