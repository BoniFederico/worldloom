import { expect } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

type Kind = 'signup' | 'recovery';

async function findLink(to: string, kind: Kind): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  const { messages = [] } = (await res.json()) as { messages?: { ID: string }[] };
  for (const { ID } of messages) {
    const { Text } = (await (await fetch(`${MAILPIT}/api/v1/message/${ID}`)).json()) as {
      Text: string;
    };
    const links = Text.match(/https?:\/\/\S+\/auth\/v1\/verify\S*/g) ?? [];
    const link = links.find((l) => l.includes(`type=${kind}`));
    if (link) return link.replace(/[)>\].,]+$/, '');
  }
  return '';
}

/** Attende l'email di tipo `kind` inviata a `to` (Mailpit locale) e ne restituisce il link. */
export async function linkFromEmail(to: string, kind: Kind = 'signup'): Promise<string> {
  let link = '';
  await expect
    .poll(async () => (link = await findLink(to, kind)), {
      message: `email ${kind} per ${to}`,
      timeout: 15_000,
    })
    .not.toBe('');
  return link;
}

export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;

export const PASSWORD = 'Valida12345';
