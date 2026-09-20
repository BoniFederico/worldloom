import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

async function createCategory(page: Page, worldId: string, name: string) {
  await page.goto(`/worlds/${worldId}/categories`);
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Crea categoria' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

async function createSnippet(
  page: Page,
  worldId: string,
  title: string,
  category?: string,
): Promise<string> {
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByLabel('Titolo').fill(title);
  if (category) await page.getByLabel('Categoria').selectOption({ label: category });
  await page.getByRole('button', { name: 'Crea snippet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  return page.url().split('?')[0] as string;
}

async function setup(browser: Browser) {
  const { page } = await newUser(browser, 'Autrice');
  const worldId = await createWorld(page, 'Tipi');
  await createCategory(page, worldId, 'Personaggio');
  await createCategory(page, worldId, 'Luogo');
  const elara = await createSnippet(page, worldId, 'Elara', 'Personaggio');
  const aurelia = await createSnippet(page, worldId, 'Aurelia', 'Luogo');
  const nota = await createSnippet(page, worldId, 'Nota libera');
  return { page, worldId, elara, aurelia, nota };
}

async function createType(
  page: Page,
  worldId: string,
  label: string,
  opts: { inverse?: string; source?: string; target?: string } = {},
) {
  await page.goto(`/worlds/${worldId}/relation-types`);
  await page.locator('#type-label').fill(label);
  if (opts.inverse) await page.locator('#type-inverse').fill(opts.inverse);
  if (opts.source) await page.locator('#type-source').selectOption({ label: opts.source });
  if (opts.target) await page.locator('#type-target').selectOption({ label: opts.target });
  await page.getByRole('button', { name: 'Crea tipo' }).click();
}

const noSeriousViolations = async (page: Page) => {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
};

test.describe('tipi di relazione', () => {
  test('creazione, elenco, modifica ed eliminazione', async ({ browser }) => {
    const { page, worldId } = await setup(browser);
    await createType(page, worldId, 'nato a', {
      inverse: 'luogo di nascita di',
      source: 'Personaggio',
      target: 'Luogo',
    });
    await expect(page.getByRole('status')).toHaveText('Tipo creato.');
    const item = page.locator('.relations li').first();
    await expect(item).toContainText('nato a');
    await expect(item).toContainText('luogo di nascita di');
    await expect(item).toContainText('Da: Personaggio · A: Luogo');

    await item.locator('summary').click();
    await item.locator('select[name="target"]').selectOption({ label: 'Qualsiasi categoria' });
    await item.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Tipo salvato.');
    await expect(page.locator('.relations li').first()).toContainText('A: Qualsiasi categoria');

    await page.getByRole('button', { name: /^Elimina il tipo/ }).click();
    await expect(page.getByRole('status')).toContainText('Tipo eliminato');
    await expect(page.locator('.relations li')).toHaveCount(0);
  });

  test('un’etichetta doppia (anche in maiuscolo) viene rifiutata', async ({ browser }) => {
    const { page, worldId } = await setup(browser);
    await createType(page, worldId, 'alleato di');
    await expect(page.getByRole('status')).toHaveText('Tipo creato.');
    await createType(page, worldId, 'Alleato DI');
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Esiste già un tipo');
  });

  test('i vincoli sulle categorie valgono per le relazioni con quell’etichetta', async ({
    browser,
  }) => {
    const { page, worldId, elara, aurelia, nota } = await setup(browser);
    await createType(page, worldId, 'nato a', {
      inverse: 'luogo di nascita di',
      source: 'Personaggio',
      target: 'Luogo',
    });
    await expect(page.getByRole('status')).toHaveText('Tipo creato.');

    // Rispettati: il tipo fornisce anche l'inversa.
    await page.goto(elara);
    await expect(page.locator('#rel-labels option[value="nato a"]')).toHaveCount(1);
    await page.locator('#rel-target').selectOption({ label: 'Aurelia' });
    await page.locator('#rel-label').fill('nato a');
    await page.getByRole('button', { name: 'Aggiungi relazione' }).click();
    await expect(page.getByRole('status')).toHaveText('Relazione aggiunta.');
    await page.goto(aurelia);
    await expect(page.locator('.relations .rel-label').first()).toHaveText('luogo di nascita di');

    // Destinazione di un'altra categoria: rifiutata, senza perdere quanto digitato.
    await page.goto(elara);
    await page.locator('#rel-target').selectOption({ label: 'Nota libera' });
    await page.locator('#rel-label').fill('Nato A');
    await page.locator('#rel-notes').fill('Da non perdere');
    await page.getByRole('button', { name: 'Aggiungi relazione' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'snippet di arrivo' })).toBeVisible();
    await expect(page.locator('#rel-notes')).toHaveValue('Da non perdere');

    // Origine di un'altra categoria: rifiutata.
    await page.goto(nota);
    await page.locator('#rel-target').selectOption({ label: 'Aurelia' });
    await page.locator('#rel-label').fill('nato a');
    await page.getByRole('button', { name: 'Aggiungi relazione' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'snippet di partenza' })).toBeVisible();

    // Un'etichetta senza tipo resta libera.
    await page.locator('#rel-label').fill('conosce');
    await page.getByRole('button', { name: 'Aggiungi relazione' }).click();
    await expect(page.getByRole('status')).toHaveText('Relazione aggiunta.');
  });

  test('un lettore vede i tipi ma non i controlli di modifica', async ({ browser }) => {
    const { page, worldId } = await setup(browser);
    await createType(page, worldId, 'alleato di');
    await expect(page.getByRole('status')).toHaveText('Tipo creato.');
    const reader = await newUser(browser, 'Lettore');
    await addMember(page, worldId, reader.email, 'reader');
    await reader.page.goto(`/worlds/${worldId}/relation-types`);
    await expect(reader.page.locator('.relations li').first()).toContainText('alleato di');
    await expect(reader.page.getByRole('button', { name: 'Crea tipo' })).toHaveCount(0);
    await expect(reader.page.getByText('Solo proprietari ed editor')).toBeVisible();
  });

  test('accessibilità della pagina dei tipi', async ({ browser }) => {
    const { page, worldId } = await setup(browser);
    await createType(page, worldId, 'alleato di', { inverse: 'alleato di' });
    await expect(page.getByRole('status')).toHaveText('Tipo creato.');
    await page.locator('.relations li').first().locator('summary').click();
    expect(await noSeriousViolations(page)).toEqual([]);
  });
});
