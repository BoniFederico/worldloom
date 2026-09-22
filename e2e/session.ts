import { expect, type Page } from '@playwright/test';
import { PASSWORD, linkFromEmail, uniqueEmail } from './mail';

/** Registra un utente nuovo, conferma l'email e lascia la pagina con la sessione attiva. */
export async function registerAndSignIn(page: Page, name = 'Ada Lovelace'): Promise<string> {
  const email = uniqueEmail('user');
  await page.goto('/signup');
  await page.getByLabel('Nome visualizzato').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('input[name="privacyAccepted"]').check();
  await page.getByRole('button', { name: 'Crea account' }).click();
  await expect(page.getByRole('status')).toContainText('Controlla la posta');
  await page.goto(await linkFromEmail(email));
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Il tuo account' })).toBeVisible();
  return email;
}

export async function createWorld(page: Page, name: string): Promise<string> {
  await page.goto('/worlds');
  await page.getByLabel('Nome del mondo').fill(name);
  await page.getByRole('button', { name: 'Crea mondo' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname.split('/')[2] as string;
}

/** Il proprietario aggiunge un utente registrato al mondo con il ruolo indicato. */
export async function addMember(owner: Page, worldId: string, email: string, role: string) {
  await owner.goto(`/worlds/${worldId}/members`);
  await owner.getByLabel('Email dell’utente').fill(email);
  await owner.getByLabel('Ruolo', { exact: true }).selectOption(role);
  await owner.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await expect(owner.getByRole('status')).toHaveText('Membro salvato.');
}
