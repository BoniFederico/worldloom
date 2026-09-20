import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

test.describe('membri del mondo', () => {
  test('il proprietario aggiunge un lettore, che vede il mondo ma non lo gestisce', async ({
    browser,
  }) => {
    const owner = await newUser(browser, 'Proprietaria');
    const guest = await newUser(browser, 'Ospite');
    const worldId = await createWorld(owner.page, 'Condiviso');
    await addMember(owner.page, worldId, guest.email.toUpperCase(), 'reader');
    await expect(owner.page.getByRole('cell', { name: 'Lettore' })).toBeVisible();

    await guest.page.goto('/worlds');
    await expect(guest.page.getByRole('link', { name: 'Condiviso' })).toBeVisible();
    await guest.page.goto(`/worlds/${worldId}/members`);
    await expect(guest.page.getByRole('heading', { name: 'Aggiungi un membro' })).toBeHidden();
    await expect(guest.page.getByRole('cell', { name: 'Lettore' })).toBeVisible();
    const settings = await guest.page.goto(`/worlds/${worldId}/settings`);
    expect(settings?.status()).toBe(404);
  });

  test('un email sconosciuto dà un errore chiaro', async ({ browser }) => {
    const owner = await newUser(browser, 'Proprietaria');
    const worldId = await createWorld(owner.page, 'Solitario');
    await owner.page.goto(`/worlds/${worldId}/members`);
    await owner.page.getByLabel('Email dell’utente').fill('nessuno@example.test');
    await owner.page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
    await expect(owner.page.getByRole('main').getByRole('alert')).toContainText(
      'Nessun account con questa email',
    );
  });

  test('cambio ruolo, rimozione e uscita', async ({ browser }) => {
    const owner = await newUser(browser, 'Proprietaria');
    const guest = await newUser(browser, 'Ospite');
    const other = await newUser(browser, 'Altro');
    const worldId = await createWorld(owner.page, 'Squadra');
    await addMember(owner.page, worldId, guest.email, 'reader');
    await addMember(owner.page, worldId, other.email, 'commenter');

    await owner.page.getByLabel('Ruolo di Ospite').selectOption('editor');
    await owner.page
      .getByRole('row', { name: /Ospite/ })
      .getByRole('button', { name: 'Salva' })
      .click();
    await expect(owner.page.getByRole('status')).toHaveText('Membro salvato.');
    await guest.page.goto(`/worlds/${worldId}`);
    await expect(guest.page.getByText('Editor', { exact: true })).toBeVisible();

    await owner.page.getByRole('button', { name: 'Rimuovi Altro' }).click();
    await expect(owner.page.getByRole('status')).toHaveText('Membro rimosso.');
    const gone = await other.page.goto(`/worlds/${worldId}`);
    expect(gone?.status()).toBe(404);

    await guest.page.goto(`/worlds/${worldId}/members`);
    await guest.page.getByRole('button', { name: 'Esci dal mondo' }).click();
    await expect(guest.page.getByRole('status')).toHaveText('Hai lasciato il mondo.');
    const left = await guest.page.goto(`/worlds/${worldId}`);
    expect(left?.status()).toBe(404);
  });

  test('un editor non vede i controlli di gestione dei membri', async ({ browser }) => {
    const owner = await newUser(browser, 'Proprietaria');
    const editor = await newUser(browser, 'Editor');
    const worldId = await createWorld(owner.page, 'Protetto');
    await addMember(owner.page, worldId, editor.email, 'editor');

    await editor.page.goto(`/worlds/${worldId}/members`);
    await expect(editor.page.getByRole('button', { name: 'Aggiungi', exact: true })).toBeHidden();
    await expect(editor.page.getByRole('button', { name: /^Rimuovi/ })).toHaveCount(0);
  });

  test('trasferimento di proprietà', async ({ browser }) => {
    const owner = await newUser(browser, 'Proprietaria');
    const heir = await newUser(browser, 'Erede');
    const worldId = await createWorld(owner.page, 'Eredità');
    await addMember(owner.page, worldId, heir.email, 'reader');

    await owner.page.getByRole('button', { name: 'Trasferisci la proprietà' }).click();
    await expect(owner.page.getByRole('main').getByRole('alert')).toContainText(
      'Spunta la conferma',
    );
    await owner.page.getByLabel('Confermo il trasferimento della proprietà').check();
    await owner.page.getByRole('button', { name: 'Trasferisci la proprietà' }).click();
    await expect(owner.page.getByRole('status')).toHaveText('Proprietà trasferita.');

    await heir.page.goto(`/worlds/${worldId}/settings`);
    await expect(heir.page.getByRole('heading', { name: 'Impostazioni' })).toBeVisible();
    const denied = await owner.page.goto(`/worlds/${worldId}/settings`);
    expect(denied?.status()).toBe(404);
  });

  test('accessibilità della pagina membri', async ({ browser }) => {
    const owner = await newUser(browser, 'Proprietaria');
    const guest = await newUser(browser, 'Ospite');
    const worldId = await createWorld(owner.page, 'Accessibile');
    await addMember(owner.page, worldId, guest.email, 'reader');
    const { violations } = await new AxeBuilder({ page: owner.page }).analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});
