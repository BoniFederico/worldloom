import { describe, expect, it } from 'vitest';
import { parseVisibilityForm } from './input';

const A = '5b6e1c1e-8a8e-4c53-9d0e-0f4f4fbb4b8e';
const B = '9c1a2f3e-1b2c-4d5e-8f60-0a1b2c3d4e5f';

const form = (values: Record<string, string | string[]>) =>
  [
    (name: string) => {
      const v = values[name];
      return Array.isArray(v) ? v[0] : v;
    },
    (name: string) => {
      const v = values[name];
      return Array.isArray(v) ? v : v ? [v] : [];
    },
  ] as const;

const parse = (values: Record<string, string | string[]>, allowed: string[] = []) => {
  const [get, getAll] = form(values);
  return parseVisibilityForm(get, getAll, allowed);
};

describe('parseVisibilityForm', () => {
  it('livello valido senza destinatari', () => {
    expect(parse({ level: 'secret' })).toEqual({
      ok: true,
      value: { level: 'secret', users: [], fields: {}, fieldUsers: {}, note: '', session: null },
    });
  });

  it('«shared» richiede destinatari validi e senza doppioni', () => {
    expect(parse({ level: 'shared' }).ok).toBe(false);
    expect(parse({ level: 'shared', users: 'non-uuid' }).ok).toBe(false);
    const r = parse({ level: 'shared', users: [A, B, A] });
    expect(r.ok && r.value.users).toEqual([A, B]);
  });

  it('livelli inventati e troppi destinatari sono rifiutati', () => {
    expect(parse({ level: 'segretissimo' }).ok).toBe(false);
    expect(parse({}).ok).toBe(false);
    const many = Array.from(
      { length: 101 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(parse({ level: 'shared', users: many }).ok).toBe(false);
  });

  it('livelli dei campi: solo chiavi ammesse, solo secret/shared/members', () => {
    const r = parse(
      { level: 'members', 'field:segreto': 'secret', 'field:altro': 'secret', 'field:vuoto': '' },
      ['segreto', 'vuoto'],
    );
    expect(r.ok && r.value.fields).toEqual({ segreto: 'secret' });
    expect(parse({ level: 'members', 'field:segreto': 'public' }, ['segreto']).ok).toBe(false);
  });

  it('un campo condiviso ha i suoi destinatari: non ereditati dallo snippet né da un altro campo', () => {
    expect(parse({ level: 'members', 'field:s': 'shared' }, ['s']).ok).toBe(false);
    // I destinatari dello snippet non bastano per il campo.
    expect(parse({ level: 'shared', users: A, 'field:s': 'shared' }, ['s']).ok).toBe(false);
    const r = parse(
      {
        level: 'shared',
        users: A,
        'field:s': 'shared',
        'users:s': B,
        'field:t': 'shared',
        'users:t': [A, B],
      },
      ['s', 't'],
    );
    expect(r.ok && r.value.users).toEqual([A]);
    expect(r.ok && r.value.fieldUsers).toEqual({ s: [B], t: [A, B] });
    // Destinatari di un campo non condiviso, o di uno snippet non condiviso, vengono ignorati.
    const ignored = parse({ level: 'secret', users: A, 'field:s': 'secret', 'users:s': B }, ['s']);
    expect(ignored.ok && ignored.value.users).toEqual([]);
    expect(ignored.ok && ignored.value.fieldUsers).toEqual({});
    expect(parse({ level: 'members', 'field:s': 'shared', 'users:s': 'no' }, ['s']).ok).toBe(false);
  });

  it('nota e sessione: nota entro 500 caratteri, sessione un uuid', () => {
    const r = parse({ level: 'public', note: '  Sessione 3 \r\n', session: A });
    expect(r.ok && r.value).toMatchObject({ note: 'Sessione 3', session: A });
    expect(parse({ level: 'public', note: 'x'.repeat(501) }).ok).toBe(false);
    expect(parse({ level: 'public', session: 'boh' }).ok).toBe(false);
  });
});
