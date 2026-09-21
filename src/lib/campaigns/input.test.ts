import { describe, expect, it } from 'vitest';
import {
  assignableRoles,
  campaignSchema,
  canManageMember,
  inviteLink,
  inviteStatus,
  parseInviteForm,
} from './input';

const form = (values: Record<string, string | undefined>) => (name: string) => values[name];

describe('campaignSchema', () => {
  it('nome obbligatorio e limitato, descrizione facoltativa', () => {
    expect(campaignSchema.safeParse({ name: '  La Corona ', description: '' }).data?.name).toBe(
      'La Corona',
    );
    expect(campaignSchema.safeParse({ name: '   ', description: '' }).success).toBe(false);
    expect(campaignSchema.safeParse({ name: 'a'.repeat(121), description: '' }).success).toBe(
      false,
    );
    expect(campaignSchema.safeParse({ name: 'x', description: 'd'.repeat(2001) }).success).toBe(
      false,
    );
  });
});

describe('parseInviteForm', () => {
  it('predefiniti: 7 giorni, un uso, nessuna email', () => {
    expect(parseInviteForm(form({ role: 'player' }))).toEqual({
      ok: true,
      value: { role: 'player', email: null, days: 7, uses: 1 },
    });
  });

  it('email normalizzata; usi e giorni entro i limiti', () => {
    expect(
      parseInviteForm(form({ role: 'observer', email: ' Ada@Example.COM ', days: '30' })),
    ).toEqual({
      ok: true,
      value: { role: 'observer', email: 'ada@example.com', days: 30, uses: 1 },
    });
    expect(parseInviteForm(form({ role: 'player', days: '30', uses: '5' }))).toEqual({
      ok: true,
      value: { role: 'player', email: null, days: 30, uses: 5 },
    });
  });

  it('rifiuta il ruolo DM, ruoli inventati, email non valide e numeri fuori scala', () => {
    for (const bad of [
      { role: 'dm' },
      { role: 'owner' },
      { role: '' },
      { role: 'player', email: 'non-una-email' },
      { role: 'player', days: '0' },
      { role: 'player', days: '91' },
      { role: 'player', days: '1.5' },
      { role: 'player', uses: '0' },
      { role: 'player', uses: '101' },
      { role: 'player', uses: 'molti' },
    ]) {
      expect(parseInviteForm(form(bad)).ok).toBe(false);
    }
  });

  it("un invito legato a un'email vale una volta sola", () => {
    const r = parseInviteForm(form({ role: 'player', email: 'a@b.it', uses: '10' }));
    expect(r.ok && r.value.uses).toBe(1);
  });
});

describe('ruoli', () => {
  it('il DM assegna tre ruoli, il co-DM due, gli altri nessuno', () => {
    expect(assignableRoles('dm')).toEqual(['co_dm', 'player', 'observer']);
    expect(assignableRoles('co_dm')).toEqual(['player', 'observer']);
    expect(assignableRoles('player')).toEqual([]);
    expect(assignableRoles('observer')).toEqual([]);
  });

  it('chi può gestire quale membro', () => {
    expect(canManageMember('dm', 'co_dm')).toBe(true);
    expect(canManageMember('dm', 'dm')).toBe(false);
    expect(canManageMember('co_dm', 'player')).toBe(true);
    expect(canManageMember('co_dm', 'co_dm')).toBe(false);
    expect(canManageMember('co_dm', 'dm')).toBe(false);
    expect(canManageMember('player', 'observer')).toBe(false);
  });
});

describe('inviteLink', () => {
  it("compone l'indirizzo assoluto, senza doppie barre", () => {
    expect(inviteLink('https://worldloom.app/', 'abc')).toBe('https://worldloom.app/invite/abc');
    expect(inviteLink('http://localhost:3000', 'abc')).toBe('http://localhost:3000/invite/abc');
  });
});

describe('inviteStatus', () => {
  const base = { revoked_at: null, expires_at: '2026-10-01T00:00:00Z', uses: 0, max_uses: 2 };
  const now = Date.parse('2026-09-21T00:00:00Z');
  it('valido, scaduto, esaurito o revocato (la revoca prevale)', () => {
    expect(inviteStatus(base, now)).toBe('active');
    expect(inviteStatus({ ...base, expires_at: '2026-09-21T00:00:00Z' }, now)).toBe('expired');
    expect(inviteStatus({ ...base, uses: 2 }, now)).toBe('used');
    expect(inviteStatus({ ...base, uses: 2, revoked_at: '2026-09-20T00:00:00Z' }, now)).toBe(
      'revoked',
    );
  });
});
