import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

async function worldWithCategory(browser: Browser) {
  const { page } = await newUser(browser, 'Autrice');
  const worldId = await createWorld(page, 'Snippet');
  await page.goto(`/worlds/${worldId}/categories`);
  await page.getByLabel('Nome', { exact: true }).fill('Personaggio');
  await page.getByRole('button', { name: 'Crea categoria' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Personaggio' })).toBeVisible();
  const details = page.locator('details', { hasText: 'Aggiungi un campo' });
  await details.getByLabel('Nome del campo').fill('Età');
  await details.getByLabel('Tipo').selectOption('number');
  await details.getByLabel('Minimo').fill('0');
  await details.getByLabel('Obbligatorio per gli snippet definitivi').check();
  await details.getByRole('button', { name: 'Aggiungi campo' }).click();
  await expect(page.getByRole('status')).toHaveText('Campo aggiunto.');
  return { page, worldId };
}

async function createSnippet(page: Page, worldId: string, title: string, category?: string) {
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByLabel('Titolo').fill(title);
  if (category) await page.getByLabel('Categoria').selectOption({ label: category });
  await page.getByRole('button', { name: 'Crea snippet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Snippet creato.');
}

const noSeriousViolations = async (page: Page) => {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
};

test.describe('snippet', () => {
  test('creazione, modifica di testo e campi, salvataggio', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Elara', 'Personaggio');

    await page.getByLabel('Testo').fill('Prima riga\n\nSeconda <b>riga</b>');
    await page.getByLabel(/^Età/).fill('42');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet salvato.');
    await expect(page.getByLabel('Testo')).toHaveValue('Prima riga\n\nSeconda <b>riga</b>');
    await expect(page.getByLabel(/^Età/)).toHaveValue('42');
  });

  test('uno snippet definitivo richiede i campi obbligatori', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Incompleto', 'Personaggio');
    await page.getByLabel('Stato').selectOption('final');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Alcuni campi non sono validi',
    );
    await expect(page.getByLabel(/^Età/)).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('Stato').selectOption('final');
    await page.getByLabel(/^Età/).fill('30');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet salvato.');
  });

  test('un valore fuori dai limiti del campo viene rifiutato', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Negativo', 'Personaggio');
    // Il browser blocca già -5 (min=0): si aggira per provare anche il controllo lato server.
    await page.getByLabel(/^Età/).evaluate((el: HTMLInputElement) => {
      el.removeAttribute('min');
      el.form?.setAttribute('novalidate', '');
    });
    await page.getByLabel(/^Età/).fill('-5');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Alcuni campi non sono validi',
    );
  });

  test('duplica, archivia, cestina e ripristina', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Originale', 'Personaggio');

    await page.getByRole('button', { name: 'Duplica' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Originale (copia)' })).toBeVisible();

    await page.getByRole('button', { name: 'Archivia' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet archiviato.');
    await expect(page.getByRole('link', { name: /Originale \(copia\)/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Archiviati' }).click();
    await expect(page.getByRole('link', { name: /Originale \(copia\)/ })).toBeVisible();

    await page.getByRole('link', { name: 'Originale (copia)' }).click();
    await page.getByRole('button', { name: 'Sposta nel cestino' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet spostato nel cestino.');

    await page.getByRole('link', { name: 'Cestino' }).click();
    await expect(
      page.locator('.world-list li span', { hasText: /^Originale \(copia\)$/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Ripristina/ }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet ripristinato.');
  });

  test('eliminazione definitiva solo dal cestino e con conferma', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Da eliminare');
    await page.getByRole('button', { name: 'Sposta nel cestino' }).click();
    await page.getByRole('link', { name: 'Cestino' }).click();

    await page.getByRole('button', { name: /^Elimina definitivamente/ }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Spunta la conferma');

    await page.getByLabel(/^Confermo/).check();
    await page.getByRole('button', { name: /^Elimina definitivamente/ }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet eliminato definitivamente.');
    await expect(page.getByText('Da eliminare')).toHaveCount(0);
  });

  test('due schede: la seconda modifica non sovrascrive la prima', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Contesa');
    const stale = await page.context().newPage();
    await stale.goto(page.url());

    await page.getByLabel('Testo').fill('Versione A');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet salvato.');

    await stale.getByLabel('Testo').fill('Versione B');
    await stale.getByRole('button', { name: 'Salva' }).click();
    await expect(stale.getByRole('main').getByRole('alert')).toContainText('modificato altrove');

    await page.reload();
    await expect(page.getByLabel('Testo')).toHaveValue('Versione A');
  });

  test('un lettore vede gli snippet ma non può modificarli né vede il cestino', async ({
    browser,
  }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Pubblico interno');
    const reader = await newUser(browser, 'Lettore');
    await addMember(page, worldId, reader.email, 'reader');

    await reader.page.goto(`/worlds/${worldId}/snippets`);
    await reader.page.getByRole('link', { name: /Pubblico interno/ }).click();
    await expect(
      reader.page.getByRole('heading', { level: 1, name: 'Pubblico interno' }),
    ).toBeVisible();
    await expect(reader.page.getByRole('button', { name: 'Salva' })).toHaveCount(0);
    await expect(reader.page.getByRole('button', { name: 'Sposta nel cestino' })).toHaveCount(0);
    await reader.page.goto(`/worlds/${worldId}/snippets`);
    await expect(reader.page.getByRole('link', { name: 'Cestino' })).toHaveCount(0);
    await expect(reader.page.getByRole('button', { name: 'Crea snippet' })).toHaveCount(0);
  });

  test('accessibilità di elenco e modifica', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Accessibile', 'Personaggio');
    expect(await noSeriousViolations(page)).toEqual([]);
    await page.goto(`/worlds/${worldId}/snippets`);
    expect(await noSeriousViolations(page)).toEqual([]);
  });
});
