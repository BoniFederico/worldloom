import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PASSWORD, linkFromEmail, uniqueEmail } from './mail';

async function signUp(page: Page, email: string, name = 'Ada Lovelace') {
  await page.goto('/signup');
  await page.getByLabel('Nome visualizzato').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Crea account' }).click();
  await expect(page.getByRole('status')).toContainText('Controlla la posta');
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Accedi' }).click();
}

test.describe('autenticazione con email e password', () => {
  test('registrazione, verifica email e accesso', async ({ page }) => {
    const email = uniqueEmail('signup');
    await signUp(page, email);

    await signIn(page, email, PASSWORD);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Conferma prima l’indirizzo',
    );

    await page.goto(await linkFromEmail(email));
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Il tuo account' })).toBeVisible();
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole('button', { name: 'Esci' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?next=%2Faccount/);
  });

  test('credenziali errate mostrano un errore senza rivelare se l’account esiste', async ({
    page,
  }) => {
    await signIn(page, uniqueEmail('ghost'), PASSWORD);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText('Email o password errate.');
  });

  test('una password debole viene rifiutata', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('Nome visualizzato').fill('Ada');
    await page.getByLabel('Email').fill(uniqueEmail('weak'));
    await page.getByLabel('Password', { exact: true }).fill('corta');
    await page.getByRole('button', { name: 'Crea account' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('non sono validi');
  });

  test('reimpostazione della password dal link email', async ({ page }) => {
    const email = uniqueEmail('reset');
    await signUp(page, email);
    await page.goto(await linkFromEmail(email));
    await page.goto('/account');
    await page.getByRole('button', { name: 'Esci' }).click();

    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Invia il link' }).click();
    await expect(page.getByRole('status')).toContainText('Se l’indirizzo è registrato');

    const resetLink = await linkFromEmail(email, 'recovery');
    await page.goto(resetLink);
    await page.goto('/reset-password');
    await page.getByLabel('Nuova password').fill('NuovaPassword99');
    await page.getByRole('button', { name: 'Salva la password' }).click();
    await expect(page.getByRole('status')).toHaveText('Password aggiornata.');

    await page.getByRole('button', { name: 'Esci' }).click();
    await signIn(page, email, 'NuovaPassword99');
    await expect(page).toHaveURL('/');
  });

  test('il reset per un indirizzo sconosciuto dà la stessa risposta', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(uniqueEmail('nobody'));
    await page.getByRole('button', { name: 'Invia il link' }).click();
    await expect(page.getByRole('status')).toContainText('Se l’indirizzo è registrato');
  });

  test('next non permette redirect esterni', async ({ page }) => {
    const email = uniqueEmail('redir');
    await signUp(page, email);
    await page.goto(await linkFromEmail(email));
    await page.goto('/login?next=https%3A%2F%2Fevil.test');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Accedi' }).click();
    await expect(page).toHaveURL('/');
  });
});

for (const path of ['/login', '/signup', '/forgot-password']) {
  test(`${path}: nessuna violazione grave di accessibilità`, async ({ page }) => {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
}

for (const path of ['/login', '/signup']) {
  test(`${path}: il pulsante GitHub porta all’autorizzazione di Supabase`, async ({ page }) => {
    await page.goto(path);
    const request = page.waitForRequest((r) => r.url().includes('/auth/v1/authorize'));
    await page.getByRole('button', { name: 'Continua con GitHub' }).click();
    const url = new URL((await request).url());
    expect(url.searchParams.get('provider')).toBe('github');
    // Il ritorno deve puntare al callback dell'app, mai a un host preso dalla richiesta.
    expect(url.searchParams.get('redirect_to')).toBe('http://localhost:3100/auth/callback');
  });
}
