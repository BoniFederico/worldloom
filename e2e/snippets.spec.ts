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

/** L'editor rich text sostituisce il campo di testo dopo l'idratazione. */
const editorOf = (page: Page) => page.getByRole('textbox', { name: 'Testo' });
async function typeInEditor(page: Page, text: string) {
  const editor = editorOf(page);
  await expect(page.getByRole('group', { name: 'Formattazione del testo' })).toBeVisible();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(text);
}

const noSeriousViolations = async (page: Page) => {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
};

test.describe('snippet', () => {
  test('creazione, modifica di testo e campi, salvataggio', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Elara', 'Personaggio');

    await typeInEditor(page, 'Prima riga');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Seconda <b>riga</b>');
    await page.getByLabel(/^Età/).fill('42');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet salvato.');
    await expect(editorOf(page)).toContainText('Seconda <b>riga</b>');
    await expect(page.getByLabel(/^Età/)).toHaveValue('42');
  });

  test('uno snippet definitivo richiede i campi obbligatori', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Incompleto', 'Personaggio');
    await typeInEditor(page, 'Testo da non perdere');
    await page.getByLabel('Stato').selectOption('final');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Alcuni campi non sono validi',
    );
    await expect(editorOf(page)).toContainText('Testo da non perdere');
    await expect(page.getByLabel('Stato')).toHaveValue('final');
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

    await typeInEditor(page, 'Versione A');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet salvato.');

    await typeInEditor(stale, 'Versione B');
    // L'autosave della scheda vecchia si sospende e lo dice, senza sovrascrivere nulla.
    await expect(stale.locator('.save-status')).toContainText('modificato altrove', {
      timeout: 10_000,
    });
    await stale.getByRole('button', { name: 'Salva' }).click();
    await expect(stale.getByRole('main').getByRole('alert')).toContainText('modificato altrove');
    // Il testo digitato non va perso: resta nel form.
    await expect(editorOf(stale)).toContainText('Versione B');

    await page.reload();
    await expect(editorOf(page)).toContainText('Versione A');
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
    await reader.page.goto(`/worlds/${worldId}/snippets?view=trash`);
    await expect(reader.page).toHaveURL(`/worlds/${worldId}/snippets`);
    await expect(reader.page.getByRole('button', { name: 'Crea snippet' })).toHaveCount(0);
  });

  test('salvataggio automatico con indicatore, senza premere Salva', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Automatico');
    await typeInEditor(page, 'Scritto e mai salvato a mano');
    await expect(page.locator('.save-status')).toHaveText('Modifiche non salvate');
    await expect(page.locator('.save-status')).toHaveText('Salvato', { timeout: 10_000 });
    await page.reload();
    await expect(editorOf(page)).toContainText('Scritto e mai salvato a mano');
  });

  test('Salva durante un salvataggio automatico lento non dà un falso conflitto', async ({
    browser,
  }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Rete lenta');
    // Rallenta solo le chiamate delle server action (quelle con l'header Next-Action).
    await page.route('**/*', async (route) => {
      if (route.request().headers()['next-action']) await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await typeInEditor(page, 'Scritto con la rete lenta');
    await expect(page.locator('.save-status')).toHaveText('Salvataggio…', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Snippet salvato.', { timeout: 15_000 });
    await expect(editorOf(page)).toContainText('Scritto con la rete lenta');
  });

  test('formattazione: grassetto, elenco, tabella e link', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Formattato');
    await typeInEditor(page, 'Testo in grassetto');
    await page.keyboard.press('ControlOrMeta+A');
    await page.getByRole('button', { name: 'Grassetto' }).click();
    await expect(editorOf(page).locator('strong')).toContainText('Testo in grassetto');
    await page.getByRole('button', { name: 'Elenco puntato' }).click();
    await expect(editorOf(page).locator('ul li')).toHaveCount(1);
    // Due invii escono dall'elenco: la tabella va inserita in un paragrafo, non in una voce.
    await editorOf(page).press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Inserisci tabella' }).click();
    await expect(editorOf(page).locator('table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aggiungi riga' })).toBeVisible();
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Snippet salvato.' })).toBeVisible();

    await expect(editorOf(page).locator('strong')).toContainText('Testo in grassetto');
    await expect(editorOf(page).locator('ul li')).toHaveCount(1);
    await expect(editorOf(page).locator('table th')).toHaveCount(3);
  });

  test('un link con schema non sicuro viene rifiutato', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Link');
    await typeInEditor(page, 'clicca');
    await page.keyboard.press('ControlOrMeta+A');
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await page.getByLabel('Indirizzo del link').fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Applica' }).click();
    await expect(page.getByText('Indirizzo non valido')).toBeVisible();
    await expect(editorOf(page).locator('a')).toHaveCount(0);

    await page.getByLabel('Indirizzo del link').fill('https://example.com');
    await page.getByRole('button', { name: 'Applica' }).click();
    await expect(editorOf(page).locator('a')).toHaveAttribute('href', 'https://example.com');
  });

  test('un lettore vede il testo formattato, senza HTML iniettato', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Da leggere');
    await typeInEditor(page, '<img src=x onerror=alert(1)>');
    await page.keyboard.press('ControlOrMeta+A');
    await page.getByRole('button', { name: 'Grassetto' }).click();
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Snippet salvato.' })).toBeVisible();
    const url = page.url().split('?')[0] as string;

    const reader = await newUser(browser, 'Lettore');
    await addMember(page, worldId, reader.email, 'reader');
    await reader.page.goto(url);
    await expect(reader.page.locator('.prose strong')).toHaveText('<img src=x onerror=alert(1)>');
    await expect(reader.page.locator('.prose img')).toHaveCount(0);
  });

  test('senza JavaScript il testo si modifica in un campo semplice', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Senza script');
    const ctx = await browser.newContext({
      storageState: await page.context().storageState(),
      javaScriptEnabled: false,
      locale: 'it-IT',
    });
    const plain = await ctx.newPage();
    await plain.goto(page.url().split('?')[0] as string);
    await plain.getByLabel('Testo').fill('Riga uno\n\nRiga due');
    await plain.getByRole('button', { name: 'Salva' }).click();
    await expect(plain.getByRole('status')).toHaveText('Snippet salvato.');
    await expect(plain.getByLabel('Testo')).toHaveValue('Riga uno\n\nRiga due');
    await ctx.close();
  });

  test('tag e alias: salvataggio, normalizzazione, suggerimenti e filtri', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Elara');
    await page.getByLabel('Tag', { exact: true }).fill('Magia,  Draghi, magia');
    await page.getByLabel('Alias').fill('Il Lupo Grigio\nGandalf');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet salvato.');
    await expect(page.getByLabel('Tag', { exact: true })).toHaveValue('magia, draghi');
    await expect(page.getByLabel('Alias')).toHaveValue('Il Lupo Grigio\nGandalf');

    await createSnippet(page, worldId, 'Balrog');
    await expect(page.getByText(/Già usati nel mondo: .*magia/)).toBeVisible();
    await page.getByLabel('Tag', { exact: true }).fill('fuoco');
    await page.getByLabel('Stato').selectOption('draft');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet salvato.');

    await page.goto(`/worlds/${worldId}/snippets`);
    await expect(page.getByRole('link', { name: 'Elara' })).toBeVisible();
    await expect(page.getByText('#magia #draghi')).toBeVisible();
    await page.getByLabel('Tag', { exact: true }).fill('Magia');
    await page.getByRole('button', { name: 'Filtra' }).click();
    await expect(page.getByRole('link', { name: 'Elara' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Balrog' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Azzera filtri' }).click();
    await expect(page.getByRole('link', { name: 'Balrog' })).toBeVisible();
  });

  test('filtri: stato, parametro ripetuto e caratteri speciali non rompono la pagina', async ({
    browser,
  }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Bozza uno');
    await page.getByLabel('Tag', { exact: true }).fill('alfa');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status')).toHaveText('Snippet salvato.');

    const base = `/worlds/${worldId}/snippets`;
    await page.goto(`${base}?status=final`);
    await expect(page.getByRole('link', { name: 'Bozza uno' })).toHaveCount(0);
    await page.goto(`${base}?status=draft`);
    await expect(page.getByRole('link', { name: 'Bozza uno' })).toBeVisible();

    // Parametro ripetuto: nessun errore 500, si usa il primo valore.
    const repeated = await page.goto(`${base}?tag=alfa&tag=beta&status=draft&status=final`);
    expect(repeated?.status()).toBe(200);
    await expect(page.getByRole('link', { name: 'Bozza uno' })).toBeVisible();

    // Caratteri con un significato nei filtri: rifiutati con un messaggio, mai un elenco vuoto muto.
    for (const bad of ['a{b', 'a"b', 'a}b']) {
      const response = await page.goto(`${base}?tag=${encodeURIComponent(bad)}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Tag o alias non validi',
      );
    }
  });

  test('un tag troppo lungo viene rifiutato senza perdere il resto', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Limiti');
    await page.getByLabel('Tag', { exact: true }).fill('x'.repeat(41));
    await page.getByLabel('Alias').fill('Nome alternativo');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Tag o alias non validi');
    await expect(page.getByLabel('Alias')).toHaveValue('Nome alternativo');
  });

  test('accessibilità di elenco e modifica', async ({ browser }) => {
    const { page, worldId } = await worldWithCategory(browser);
    await createSnippet(page, worldId, 'Accessibile', 'Personaggio');
    expect(await noSeriousViolations(page)).toEqual([]);
    await page.goto(`/worlds/${worldId}/snippets`);
    expect(await noSeriousViolations(page)).toEqual([]);
  });
});
