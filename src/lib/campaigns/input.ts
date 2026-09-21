import { z } from 'zod';
import { emailSchema } from '@/lib/auth/schemas';

export type CampaignRole = 'dm' | 'co_dm' | 'player' | 'observer';
export const INVITE_ROLES = ['co_dm', 'player', 'observer'] as const;
export const MAX_INVITE_DAYS = 90;
export const MAX_INVITE_USES = 100;

export const campaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000),
});

/** Ruoli che chi ha `viewer` può assegnare (a un membro o in un invito). Il DM non si assegna mai. */
export function assignableRoles(viewer: CampaignRole): CampaignRole[] {
  if (viewer === 'dm') return ['co_dm', 'player', 'observer'];
  if (viewer === 'co_dm') return ['player', 'observer'];
  return [];
}

/** Se `viewer` può cambiare il ruolo di `target` o toglierlo (stesse regole delle funzioni del database). */
export function canManageMember(viewer: CampaignRole, target: CampaignRole): boolean {
  if (viewer === 'dm') return target !== 'dm';
  if (viewer === 'co_dm') return target === 'player' || target === 'observer';
  return false;
}

export type InviteInput = {
  role: (typeof INVITE_ROLES)[number];
  email: string | null;
  days: number;
  uses: number;
};

const intInRange = (raw: string | undefined, fallback: number, min: number, max: number) => {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= min && n <= max ? n : null;
};

/** Modulo dell'invito: ruolo, email facoltativa (invito personale, un solo uso), validità in giorni e numero di usi. */
export function parseInviteForm(
  get: (name: string) => string | null | undefined,
): { ok: true; value: InviteInput } | { ok: false } {
  const role = INVITE_ROLES.find((r) => r === get('role'));
  if (!role) return { ok: false };
  const rawEmail = (get('email') ?? '').trim();
  let email: string | null = null;
  if (rawEmail) {
    const parsed = emailSchema.safeParse(rawEmail);
    if (!parsed.success) return { ok: false };
    email = parsed.data.toLowerCase();
  }
  const days = intInRange(get('days') ?? undefined, 7, 1, MAX_INVITE_DAYS);
  const uses = intInRange(get('uses') ?? undefined, 1, 1, MAX_INVITE_USES);
  if (days === null || uses === null) return { ok: false };
  return { ok: true, value: { role, email, days, uses: email ? 1 : uses } };
}

export const inviteLink = (origin: string, token: string) =>
  `${origin.replace(/\/+$/, '')}/invite/${token}`;

export type InviteStatus = 'active' | 'revoked' | 'expired' | 'used';

/** Stato di un invito: revocato, scaduto, esaurito oppure ancora valido. */
export function inviteStatus(
  invite: { revoked_at: string | null; expires_at: string; uses: number; max_uses: number },
  now: number = Date.now(),
): InviteStatus {
  if (invite.revoked_at) return 'revoked';
  if (new Date(invite.expires_at).getTime() <= now) return 'expired';
  if (invite.uses >= invite.max_uses) return 'used';
  return 'active';
}
