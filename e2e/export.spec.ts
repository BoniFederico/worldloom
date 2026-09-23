import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

async function createSnippet(page: Page, worldId: string, title: string) {
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByLabel('Titolo').fill(title);
  await page.getByRole('button', { name: 'Crea snippet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test.describe('import ed export del mondo', () => {
  test('round trip: esporta, importa in un mondo nuovo, riesporta lo stesso file', async ({
    browser,
  }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await createWorld(page, 'Aurelia');
    await createSnippet(page, worldId, 'Elara');
    await createSnippet(page, worldId, 'Porto Verde');

    const first = await page.request.get(`/worlds/${worldId}/export`);
    expect(first.status()).toBe(200);
    expect(first.headers()['content-disposition']).toContain('aurelia.worldloom.json');
    const firstText = await first.text();
    const parsed = JSON.parse(firstText);
    expect(parsed.snippets.map((s: { title: string }) => s.title)).toEqual([
      'Elara',
      'Porto Verde',
    ]);

    await page.goto('/worlds/import');
    expect(
      await new AxeBuilder({ page })
        .analyze()
        .then((r) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')),
    ).toEqual([]);
    await page.getByLabel('File JSON').setInputFiles({
      name: 'aurelia.worldloom.json',
      mimeType: 'application/json',
      buffer: Buffer.from(firstText),
    });
    await page.getByRole('button', { name: 'Importa', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Mondo importato.');
    const newId = new URL(page.url()).pathname.split('/')[2] as string;
    expect(newId).not.toBe(worldId);

    const second = await page.request.get(`/worlds/${newId}/export`);
    expect(await second.text()).toBe(firstText);
  });

  test('round trip con categorie, tipi di relazione, relazioni e menzioni', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    const mention = (id: string) => ({ type: 'mention', attrs: { id } });
    const fixture = {
      format: 'worldloom.world',
      version: 1,
      world: { name: 'Completo' },
      categories: [
        {
          ref: 'c1',
          name: 'Luogo',
          icon: null,
          color: null,
          fieldsSchema: [],
          contentTemplate: null,
        },
        {
          ref: 'c2',
          name: 'Personaggio',
          icon: null,
          color: null,
          fieldsSchema: [{ key: 'eta', label: 'Età', type: 'number' }],
          contentTemplate: null,
        },
      ],
      snippets: [
        {
          ref: 's1',
          title: 'Elara',
          status: 'final',
          visibility: 'members',
          archived: false,
          tags: ['eroe'],
          aliases: ['La Saggia'],
          categories: ['c2'],
          fields: { eta: 42 },
          body: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Vive a ' }, mention('s2')] },
            ],
          },
          createdAt: '2026-01-01T10:00:00.000Z',
        },
        {
          ref: 's2',
          title: 'Porto Verde',
          status: 'draft',
          visibility: 'public',
          archived: true,
          tags: [],
          aliases: [],
          categories: ['c1'],
          fields: {},
          body: { type: 'doc', content: [{ type: 'paragraph' }] },
          createdAt: '2026-01-02T10:00:00.000Z',
        },
      ],
      relationTypes: [
        { label: 'abita a', inverseLabel: 'ospita', sourceCategory: 'c2', targetCategory: 'c1' },
      ],
      relations: [
        {
          source: 's1',
          target: 's2',
          label: 'abita a',
          inverseLabel: 'ospita',
          notes: 'dal 12°',
          validFrom: { calendar: 'default', year: 12 },
          validTo: null,
          fromMention: false,
          visibility: 'members',
          createdAt: '2026-01-03T10:00:00.000Z',
        },
        {
          source: 's1',
          target: 's2',
          label: 'menziona',
          inverseLabel: 'menzionato in',
          notes: '',
          validFrom: null,
          validTo: null,
          fromMention: true,
          visibility: 'members',
          createdAt: '2026-01-04T10:00:00.000Z',
        },
      ],
    };
    const text = JSON.stringify(fixture, null, 2);
    await page.goto('/worlds/import');
    await page.getByLabel('File JSON').setInputFiles({
      name: 'completo.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await page.getByRole('button', { name: 'Importa', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Mondo importato.');
    const newId = new URL(page.url()).pathname.split('/')[2] as string;
    const again = await page.request.get(`/worlds/${newId}/export`);
    expect(await again.json()).toEqual(fixture);
  });

  test('gli snippet segreti non finiscono nell’export di un lettore', async ({ browser }) => {
    const owner = await newUser(browser, 'Autrice');
    const reader = await newUser(browser, 'Lettore');
    const snippet = (ref: string, title: string, visibility: string) => ({
      ref,
      title,
      status: 'draft',
      visibility,
      archived: false,
      tags: [],
      aliases: [],
      categories: [],
      fields: {},
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
      createdAt: '2026-01-01T10:00:00.000Z',
    });
    const file = {
      format: 'worldloom.world',
      version: 1,
      world: { name: 'Segreti' },
      categories: [],
      snippets: [
        snippet('s1', 'Pubblico ai membri', 'members'),
        snippet('s2', 'Solo GM', 'secret'),
      ],
      relationTypes: [],
      relations: [],
    };
    await owner.page.goto('/worlds/import');
    await owner.page.getByLabel('File JSON').setInputFiles({
      name: 's.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    });
    await owner.page.getByRole('button', { name: 'Importa', exact: true }).click();
    await expect(owner.page.getByRole('status')).toHaveText('Mondo importato.');
    const worldId = new URL(owner.page.url()).pathname.split('/')[2] as string;
    await addMember(owner.page, worldId, reader.email, 'reader');

    const titles = async (page: Page) =>
      (
        (await (await page.request.get(`/worlds/${worldId}/export`)).json()) as {
          snippets: { title: string }[];
        }
      ).snippets.map((s) => s.title);
    expect(await titles(owner.page)).toEqual(['Pubblico ai membri', 'Solo GM']);
    expect(await titles(reader.page)).toEqual(['Pubblico ai membri']);
  });

  test('un file non valido viene rifiutato senza creare nulla', async ({ browser }) => {
    const { page } = await newUser(browser, 'Autrice');
    await page.goto('/worlds/import');
    await page.getByLabel('File JSON').setInputFiles({
      name: 'x.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"format":"altro"}'),
    });
    await page.getByRole('button', { name: 'Importa', exact: true }).click();
    await expect(page.locator('.message-error')).toContainText('Il file non è valido');
  });

  test('esporta come modello (#43): struttura senza contenuto, importabile come mondo nuovo', async ({
    browser,
  }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await createWorld(page, 'Aurelia');
    await page.goto(`/worlds/${worldId}/categories`);
    await page.getByLabel('Nome', { exact: true }).fill('Luogo');
    await page.getByRole('button', { name: 'Crea categoria' }).click();
    await expect(page.getByRole('status')).toHaveText('Categoria creata.');
    await createSnippet(page, worldId, 'Elara');

    const template = await page.request.get(`/worlds/${worldId}/export?template=1`);
    expect(template.status()).toBe(200);
    expect(template.headers()['content-disposition']).toContain('aurelia.template.worldloom.json');
    const templateText = await template.text();
    const parsed = JSON.parse(templateText);
    expect(parsed.categories.map((c: { name: string }) => c.name)).toEqual(['Luogo']);
    expect(parsed.snippets).toEqual([]);
    expect(parsed.relations).toEqual([]);

    await page.goto('/worlds/import');
    await page.getByLabel('File JSON').setInputFiles({
      name: 'aurelia.template.worldloom.json',
      mimeType: 'application/json',
      buffer: Buffer.from(templateText),
    });
    await page.getByRole('button', { name: 'Importa', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Mondo importato.');
    const newId = new URL(page.url()).pathname.split('/')[2] as string;
    expect(newId).not.toBe(worldId);

    await page.goto(`/worlds/${newId}/categories`);
    await expect(page.getByRole('link', { name: 'Luogo' })).toBeVisible();
    await page.goto(`/worlds/${newId}/snippets`);
    await expect(page.getByRole('link', { name: 'Elara' })).toHaveCount(0);
  });

  test('esporta in Markdown (#100): archivio ZIP, reimportabile con la stessa fedeltà del JSON', async ({
    browser,
  }) => {
    const { page } = await newUser(browser, 'Autrice');
    const worldId = await createWorld(page, 'Aurelia');
    await page.goto(`/worlds/${worldId}/categories`);
    await page.getByLabel('Nome', { exact: true }).fill('Luogo');
    await page.getByRole('button', { name: 'Crea categoria' }).click();
    await expect(page.getByRole('status')).toHaveText('Categoria creata.');
    await createSnippet(page, worldId, 'Elara');
    await createSnippet(page, worldId, 'Porto Verde');

    const zip = await page.request.get(`/worlds/${worldId}/export/markdown`);
    expect(zip.status()).toBe(200);
    expect(zip.headers()['content-type']).toBe('application/zip');
    expect(zip.headers()['content-disposition']).toContain('aurelia.worldloom.zip');
    const buffer = await zip.body();
    expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    await page.goto('/worlds/import');
    await page.getByLabel('Archivio .zip').setInputFiles({
      name: 'aurelia.worldloom.zip',
      mimeType: 'application/zip',
      buffer,
    });
    await page.getByRole('button', { name: 'Importa da .zip' }).click();
    await expect(page.getByRole('status')).toHaveText('Mondo importato.');
    const newId = new URL(page.url()).pathname.split('/')[2] as string;
    expect(newId).not.toBe(worldId);

    const original = await (await page.request.get(`/worlds/${worldId}/export`)).json();
    const reimported = await (await page.request.get(`/worlds/${newId}/export`)).json();
    expect(reimported.categories.map((c: { name: string }) => c.name)).toEqual(
      original.categories.map((c: { name: string }) => c.name),
    );
    expect(reimported.snippets.map((s: { title: string }) => s.title)).toEqual(
      original.snippets.map((s: { title: string }) => s.title),
    );
  });

  test('chi non è membro non può esportare; un lettore esporta solo ciò che può leggere', async ({
    browser,
  }) => {
    const owner = await newUser(browser, 'Autrice');
    const reader = await newUser(browser, 'Lettore');
    const stranger = await newUser(browser, 'Estraneo');
    const worldId = await createWorld(owner.page, 'Riservato');
    await addMember(owner.page, worldId, reader.email, 'reader');
    await createSnippet(owner.page, worldId, 'Visibile');

    expect((await stranger.page.request.get(`/worlds/${worldId}/export`)).status()).toBe(404);
    const asReader = await reader.page.request.get(`/worlds/${worldId}/export`);
    expect(asReader.status()).toBe(200);
    expect((await asReader.json()).snippets.map((s: { title: string }) => s.title)).toEqual([
      'Visibile',
    ]);
  });
});
