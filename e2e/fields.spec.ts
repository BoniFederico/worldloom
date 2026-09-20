import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

async function categoryPage(browser: Browser) {
  const { page } = await newUser(browser, 'Autrice');
  const worldId = await createWorld(page, 'Campi');
  await page.goto(`/worlds/${worldId}/categories`);
  await page.getByLabel('Nome', { exact: true }).fill('Creatura');
  await page.getByRole('button', { name: 'Crea categoria' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Creatura' })).toBeVisible();
  return { page, worldId };
}

async function addField(
  page: Page,
  label: string,
  type: string,
  extra: Record<string, string> = {},
) {
  const details = page.locator('details', { hasText: 'Aggiungi un campo' });
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  await details.getByLabel('Nome del campo').fill(label);
  await details.getByLabel('Tipo').selectOption(type);
  for (const [name, value] of Object.entries(extra)) await details.getByLabel(name).fill(value);
  await details.getByRole('button', { name: 'Aggiungi campo' }).click();
  await expect(page.getByRole('status')).toHaveText('Campo aggiunto.');
}

const noSeriousViolations = async (page: Page) => {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
};

test.describe('editor dei campi', () => {
  test('aggiunta di campi di tipo diverso, con opzioni e limiti', async ({ browser }) => {
    const { page } = await categoryPage(browser);
    await addField(page, 'Età', 'number', { Minimo: '0', Massimo: '500' });
    await addField(page, 'Stato', 'choice', { Opzioni: 'vivo\nmorto' });
    await addField(page, 'Nascita', 'calendar_date');

    const list = page.locator('.field-list');
    await expect(list.locator('.field-name', { hasText: 'Età' })).toBeVisible();
    await expect(list.getByText('Numero (0 – 500)')).toBeVisible();
    await expect(list.getByText('Scelta: vivo, morto')).toBeVisible();
    await expect(list.getByText('Data in calendario')).toBeVisible();
  });

  test('una scelta senza opzioni viene rifiutata', async ({ browser }) => {
    const { page } = await categoryPage(browser);
    const details = page.locator('details', { hasText: 'Aggiungi un campo' });
    await details.getByLabel('Nome del campo').fill('Stato');
    await details.getByLabel('Tipo').selectOption('choice');
    await details.getByRole('button', { name: 'Aggiungi campo' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Il campo non è valido');
  });

  test('modifica, riordino e rimozione', async ({ browser }) => {
    const { page } = await categoryPage(browser);
    await addField(page, 'Alfa', 'text');
    await addField(page, 'Beta', 'text');

    await page.getByRole('button', { name: 'Sposta su Beta' }).click();
    await expect(page.getByRole('status')).toHaveText('Campo spostato.');
    await expect(page.locator('.field-name').first()).toContainText('Beta');
    await expect(page.getByRole('button', { name: 'Sposta su Beta' })).toBeDisabled();

    const alfa = page.locator('.field-list > li', { hasText: 'Alfa' });
    await alfa.locator('summary').click();
    await alfa.getByLabel('Nome del campo').fill('Alfa maggiore');
    await alfa.getByLabel('Obbligatorio per gli snippet definitivi').check();
    await alfa.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Campo salvato.');
    await expect(page.locator('.field-name', { hasText: 'Alfa maggiore' })).toBeVisible();
    await expect(page.locator('.field-list').getByText('(obbligatorio)')).toBeVisible();

    const beta = page.locator('.field-list > li', { hasText: 'Beta' });
    await beta.locator('summary').click();
    await beta.getByRole('button', { name: 'Rimuovi il campo' }).click();
    await expect(page.getByRole('status')).toHaveText('Campo rimosso.');
    await expect(page.locator('.field-name', { hasText: 'Beta' })).toHaveCount(0);
  });

  test('due pagine aperte insieme: nessuna modifica va persa', async ({ browser }) => {
    const { page } = await categoryPage(browser);
    const url = page.url();
    const second = await page.context().newPage();
    await second.goto(url);

    await addField(page, 'Uno', 'text');
    // `second` è stata caricata prima di «Uno»: la sua aggiunta si applica allo stato corrente.
    await addField(second, 'Due', 'text');
    await page.goto(url);
    const list = page.locator('.field-list');
    await expect(list.locator('.field-name', { hasText: 'Uno' })).toBeVisible();
    await expect(list.locator('.field-name', { hasText: 'Due' })).toBeVisible();
  });

  test('un lettore vede i campi ma non i controlli di modifica', async ({ browser }) => {
    const { page, worldId } = await categoryPage(browser);
    await addField(page, 'Riservato', 'text');
    const reader = await newUser(browser, 'Lettore');
    await addMember(page, worldId, reader.email, 'reader');
    await reader.page.goto(`/worlds/${worldId}/categories`);
    await reader.page.getByRole('link', { name: /Creatura/ }).click();
    await expect(reader.page.locator('.field-name', { hasText: 'Riservato' })).toBeVisible();
    await expect(reader.page.getByRole('button', { name: 'Aggiungi campo' })).toHaveCount(0);
    await expect(reader.page.getByRole('button', { name: /^Sposta/ })).toHaveCount(0);
  });

  test('accessibilità dell’editor dei campi', async ({ browser }) => {
    const { page } = await categoryPage(browser);
    await addField(page, 'Stato', 'choice', { Opzioni: 'a\nb' });
    await page.locator('.field-list > li', { hasText: 'Stato' }).locator('summary').click();
    expect(await noSeriousViolations(page)).toEqual([]);
  });
});

test('un campo rimosso da un’altra scheda non dà un finto successo', async ({ browser }) => {
  const { page } = await categoryPage(browser);
  await addField(page, 'Effimero', 'text');
  await addField(page, 'Stabile', 'text');
  const stale = await page.context().newPage();
  await stale.goto(page.url());

  const item = page.locator('.field-list > li', { hasText: 'Effimero' });
  await item.locator('summary').click();
  await item.getByRole('button', { name: 'Rimuovi il campo' }).click();
  await expect(page.getByRole('status')).toHaveText('Campo rimosso.');

  await stale.getByRole('button', { name: 'Sposta giù Effimero' }).click();
  await expect(stale.getByRole('main').getByRole('alert')).toContainText('Il campo non esiste più');
});
