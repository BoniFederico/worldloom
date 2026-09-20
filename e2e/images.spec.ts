import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

// PNG 1x1 valido.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

async function snippetPage(browser: Browser) {
  const { page } = await newUser(browser, 'Autrice');
  const worldId = await createWorld(page, 'Immagini');
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByLabel('Titolo').fill('Con immagine');
  await page.getByRole('button', { name: 'Crea snippet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Con immagine' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Formattazione del testo' })).toBeVisible();
  return { page, worldId };
}

async function upload(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
  alt = '',
) {
  await page.getByRole('button', { name: 'Inserisci immagine' }).click();
  await page.getByLabel(/^File immagine/).setInputFiles(file);
  if (alt) await page.getByLabel('Descrizione dell’immagine').fill(alt);
  await page.getByRole('button', { name: 'Carica e inserisci' }).click();
}

const editor = (page: Page) => page.getByRole('textbox', { name: 'Testo' });

test.describe('immagini negli snippet', () => {
  test('carica, inserisce, salva e mostra un’immagine a un lettore', async ({ browser }) => {
    const { page, worldId } = await snippetPage(browser);
    await upload(page, { name: 'mappa.png', mimeType: 'image/png', buffer: PNG }, 'Una mappa');
    const img = editor(page).locator('img');
    await expect(img).toHaveAttribute('alt', 'Una mappa');
    const src = (await img.getAttribute('src')) as string;
    expect(src).toMatch(new RegExp(`^/worlds/${worldId}/images/[0-9a-f-]{36}\.png$`));

    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Snippet salvato.' })).toBeVisible();
    const url = page.url().split('?')[0] as string;

    const reader = await newUser(browser, 'Lettore');
    await addMember(page, worldId, reader.email, 'reader');
    await reader.page.goto(url);
    const shown = reader.page.locator('.prose img');
    await expect(shown).toHaveAttribute('alt', 'Una mappa');
    await expect
      .poll(() => shown.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
      .toBe(1);
  });

  test('un estraneo non può leggere l’immagine (404) e un lettore non può caricarne', async ({
    browser,
  }) => {
    const { page, worldId } = await snippetPage(browser);
    await upload(page, { name: 'a.png', mimeType: 'image/png', buffer: PNG });
    const src = (await editor(page).locator('img').getAttribute('src')) as string;

    const stranger = await newUser(browser, 'Estraneo');
    expect((await stranger.page.request.get(src)).status()).toBe(404);

    const reader = await newUser(browser, 'Lettore');
    await addMember(page, worldId, reader.email, 'reader');
    expect((await reader.page.request.get(src)).status()).toBe(200);
    const response = await reader.page.request.post(`/worlds/${worldId}/images`, {
      multipart: { file: { name: 'b.png', mimeType: 'image/png', buffer: PNG } },
    });
    expect(response.status()).toBe(403);
  });

  test('un file che non è un’immagine viene rifiutato, anche con estensione e tipo finti', async ({
    browser,
  }) => {
    const { page } = await snippetPage(browser);
    await upload(page, {
      name: 'finto.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    });
    await expect(page.locator('#image-panel').getByRole('alert')).toContainText(
      'Formato non supportato',
    );
    await expect(editor(page).locator('img')).toHaveCount(0);
  });

  test('un’immagine incollata da un altro sito non entra nel testo', async ({ browser }) => {
    const { page } = await snippetPage(browser);
    await editor(page).click();
    await page.evaluate(() => {
      const target = document.querySelector('#body-editor') as HTMLElement;
      const data = new DataTransfer();
      data.setData('text/html', '<p>ciao</p><img src="https://evil.test/x.png">');
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    });
    await expect(editor(page).locator('img')).toHaveCount(0);
  });

  test('il server scarta un’immagine con src esterno anche se arriva via API', async ({
    browser,
  }) => {
    const { page } = await snippetPage(browser);
    await page.evaluate(() => {
      const input = document.querySelector('input[name="body_json"]') as HTMLInputElement;
      input.value = JSON.stringify({
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'https://evil.test/track.png', alt: 'x' } }],
      });
    });
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Snippet salvato.' })).toBeVisible();
    await expect(page.locator('img[src^="https://evil.test"]')).toHaveCount(0);
  });

  test('accessibilità del pannello immagine', async ({ browser }) => {
    const { page } = await snippetPage(browser);
    await page.getByRole('button', { name: 'Inserisci immagine' }).click();
    const result = await new AxeBuilder({ page }).analyze();
    expect(
      result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
    ).toEqual([]);
  });
});
