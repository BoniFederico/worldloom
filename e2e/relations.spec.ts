import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

async function createSnippet(page: Page, worldId: string, title: string): Promise<string> {
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByLabel('Titolo').fill(title);
  await page.getByRole('button', { name: 'Crea snippet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  return page.url().split('?')[0] as string;
}

async function twoSnippets(browser: Browser) {
  const { page } = await newUser(browser, 'Autrice');
  const worldId = await createWorld(page, 'Relazioni');
  const urlA = await createSnippet(page, worldId, 'Aragorn');
  const urlB = await createSnippet(page, worldId, 'Arathorn');
  return { page, worldId, urlA, urlB };
}

async function addRelation(
  page: Page,
  target: string,
  label: string,
  extra: {
    inverse?: string;
    notes?: string;
    fromYear?: string;
    toYear?: string;
    expectAdded?: boolean;
  } = {},
) {
  await page.locator('#rel-target').selectOption({ label: target });
  await page.locator('#rel-label').fill(label);
  if (extra.inverse) await page.locator('#rel-inverse').fill(extra.inverse);
  if (extra.notes) await page.locator('#rel-notes').fill(extra.notes);
  if (extra.fromYear || extra.toYear) {
    const details = page.locator('details', { hasText: 'Validità nel tempo' });
    if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
    if (extra.fromYear) await details.locator('#from_year').fill(extra.fromYear);
    if (extra.toYear) await details.locator('#to_year').fill(extra.toYear);
  }
  await page.getByRole('button', { name: 'Aggiungi relazione' }).click();
  // Si attende l'esito prima di navigare altrove: la richiesta deve finire.
  if (extra.expectAdded !== false) {
    await expect(page.getByRole('status')).toHaveText('Relazione aggiunta.');
  }
}

const noSeriousViolations = async (page: Page) => {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
};

test.describe('relazioni', () => {
  test('etichetta e inversa: in uscita e in ingresso, con note e validità', async ({ browser }) => {
    const { page, urlA, urlB } = await twoSnippets(browser);
    await page.goto(urlA);
    await addRelation(page, 'Arathorn', 'figlio di', {
      inverse: 'padre di',
      notes: 'Dopo la battaglia.',
      fromYear: '2931',
      toYear: '2933',
    });
    await expect(page.getByRole('status')).toHaveText('Relazione aggiunta.');
    const out = page.locator('.relations li').first();
    await expect(out.locator('.rel-label')).toHaveText('figlio di');
    await expect(out.getByRole('link', { name: 'Arathorn' })).toBeVisible();
    await expect(out).toContainText('Dal 2931 al 2933');
    await expect(out).toContainText('Dopo la battaglia.');

    // Dall'altro snippet la relazione si legge con l'etichetta inversa.
    await page.goto(urlB);
    const incoming = page.locator('.relations li').first();
    await expect(incoming.locator('.rel-label')).toHaveText('padre di');
    await expect(incoming.getByRole('link', { name: 'Aragorn' })).toBeVisible();
  });

  test('senza inversa, in ingresso si legge l’etichetta originale', async ({ browser }) => {
    const { page, urlA, urlB } = await twoSnippets(browser);
    await page.goto(urlA);
    await addRelation(page, 'Arathorn', 'alleato di');
    await page.goto(urlB);
    await expect(page.locator('.relations li').first()).toContainText('alleato di');
    await expect(page.locator('.relations li').first()).toContainText('questo snippet');

    await expect(page.locator('#rel-labels option[value="alleato di"]')).toHaveCount(1);
  });

  test('l’inversa già associata a un’etichetta si riusa', async ({ browser }) => {
    const { page, worldId, urlA, urlB } = await twoSnippets(browser);
    const urlC = await createSnippet(page, worldId, 'Boromir');
    await page.goto(urlA);
    await addRelation(page, 'Arathorn', 'figlio di', { inverse: 'padre di' });
    await page.goto(urlC);
    await addRelation(page, 'Arathorn', 'figlio di');
    await page.goto(urlB);
    const labels = await page.locator('.relations .rel-label').allTextContents();
    expect(labels).toEqual(['padre di', 'padre di']);
  });

  test('modifica note e validità, poi rimozione', async ({ browser }) => {
    const { page, urlA } = await twoSnippets(browser);
    await page.goto(urlA);
    await addRelation(page, 'Arathorn', 'amico di');

    const item = page.locator('.relations li').first();
    await item.locator('summary').click();
    await item.getByLabel('Note', { exact: true }).fill('Da sempre.');
    await item.locator('input[name="from_year"]').fill('10');
    await item.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Relazione salvata.');
    await expect(page.locator('.relations li').first()).toContainText('Da sempre.');
    await expect(page.locator('.relations li').first()).toContainText('Dal 10');

    await page.getByRole('button', { name: /^Rimuovi la relazione/ }).click();
    await expect(page.getByRole('status')).toHaveText('Relazione rimossa.');
    await expect(page.locator('.relations li')).toHaveCount(0);
  });

  test('errori: doppione, intervallo invertito e sé stesso, senza perdere quanto digitato', async ({
    browser,
  }) => {
    const { page, urlA } = await twoSnippets(browser);
    await page.goto(urlA);
    await addRelation(page, 'Arathorn', 'amico di');
    await expect(page.getByRole('status')).toHaveText('Relazione aggiunta.');

    await addRelation(page, 'Arathorn', 'Amico di', {
      notes: 'Da non perdere',
      expectAdded: false,
    });
    await expect(page.getByRole('alert').filter({ hasText: 'Esiste già' })).toBeVisible();
    await expect(page.locator('#rel-notes')).toHaveValue('Da non perdere');

    await page.locator('#rel-label').fill('rivale di');
    const details = page.locator('details', { hasText: 'Validità nel tempo' });
    await details.locator('summary').click();
    await details.locator('#from_year').fill('20');
    await details.locator('#to_year').fill('10');
    await page.getByRole('button', { name: 'Aggiungi relazione' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'intervallo di validità' }),
    ).toBeVisible();
  });

  test('una relazione verso uno snippet nel cestino non si mostra e torna al ripristino', async ({
    browser,
  }) => {
    const { page, urlA, urlB } = await twoSnippets(browser);
    await page.goto(urlA);
    await addRelation(page, 'Arathorn', 'amico di');
    await page.goto(urlB);
    await page.getByRole('button', { name: 'Sposta nel cestino' }).click();
    await page.goto(urlA);
    await expect(page.locator('.relations li')).toHaveCount(0);
    await page.goto(urlB);
    await page.getByRole('button', { name: 'Ripristina', exact: true }).click();
    await page.goto(urlA);
    await expect(page.locator('.relations li')).toHaveCount(1);
  });

  test('un lettore vede le relazioni ma non i controlli di modifica', async ({ browser }) => {
    const { page, worldId, urlA } = await twoSnippets(browser);
    await page.goto(urlA);
    await addRelation(page, 'Arathorn', 'amico di');
    await expect(page.getByRole('status')).toHaveText('Relazione aggiunta.');

    const reader = await newUser(browser, 'Lettore');
    await addMember(page, worldId, reader.email, 'reader');
    await reader.page.goto(urlA);
    await expect(reader.page.locator('.relations li').first()).toContainText('amico di');
    await expect(reader.page.getByRole('button', { name: 'Aggiungi relazione' })).toHaveCount(0);
    await expect(reader.page.getByText('Modifica', { exact: true })).toHaveCount(0);
  });

  test('accessibilità del pannello relazioni', async ({ browser }) => {
    const { page, urlA } = await twoSnippets(browser);
    await page.goto(urlA);
    await addRelation(page, 'Arathorn', 'amico di', { inverse: 'amico di' });
    await expect(page.getByRole('status')).toHaveText('Relazione aggiunta.');
    await page.locator('.relations li').first().locator('summary').click();
    expect(await noSeriousViolations(page)).toEqual([]);
  });
});
