import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createWorld, registerAndSignIn } from './session';

async function createSnippet(page: Page, worldId: string, title: string): Promise<string> {
  await page.goto(`/worlds/${worldId}/snippets`);
  await page.getByLabel('Titolo').fill(title);
  await page.getByRole('button', { name: 'Crea snippet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  return page.url().split('?')[0] as string;
}

type ExportedSnippet = { ref: string; title: string };
type ExportedWorld = { snippets: ExportedSnippet[]; relations: unknown[] };

/**
 * L'interfaccia di modifica di una relazione impedisce di per sé un intervallo invertito (stesso controllo di
 * `isTemporalAnomaly`, fatto lato form): l'unico modo realistico per farne comparire uno è un file importato da
 * fuori (#21), che non ripassa da quel controllo. Si simula qui: si esporta un mondo, si inserisce a mano una
 * relazione con l'intervallo invertito nel file, e si reimporta.
 */
async function importWorldWithRelations(
  page: Page,
  worldId: string,
  buildRelations: (refOf: (title: string) => string) => unknown[],
): Promise<string> {
  const res = await page.request.get(`/worlds/${worldId}/export`);
  const data = JSON.parse(await res.text()) as ExportedWorld;
  const refOf = (title: string) => {
    const found = data.snippets.find((s) => s.title === title);
    if (!found) throw new Error(`snippet non trovato nell'export: ${title}`);
    return found.ref;
  };
  data.relations = buildRelations(refOf);

  await page.goto('/worlds/import');
  await page.getByLabel('File JSON').setInputFiles({
    name: 'mondo.worldloom.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await page.getByRole('button', { name: 'Importa', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Mondo importato.');
  return new URL(page.url()).pathname.split('/')[2] as string;
}

test.describe('controllo di coerenza', () => {
  test('segnala intervalli invertiti, relazioni senza inversa e snippet isolati', async ({
    browser,
  }) => {
    const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
    await registerAndSignIn(page, 'Autrice');
    const worldId = await createWorld(page, 'Aurelia');
    await createSnippet(page, worldId, 'Aragorn');
    await createSnippet(page, worldId, 'Arathorn');
    await createSnippet(page, worldId, 'Isolato');

    const newId = await importWorldWithRelations(page, worldId, (ref) => [
      {
        source: ref('Aragorn'),
        target: ref('Arathorn'),
        label: 'erede di',
        inverseLabel: null,
        notes: '',
        // Stesso anno, mese invertito: il database (e l'export) lo accettano perché controllano solo l'anno.
        validFrom: { calendar: 'default', year: 1200, month: 6 },
        validTo: { calendar: 'default', year: 1200, month: 2 },
        fromMention: false,
        visibility: 'members',
        createdAt: new Date().toISOString(),
      },
      {
        source: ref('Aragorn'),
        target: ref('Arathorn'),
        label: 'conosce',
        inverseLabel: null,
        notes: '',
        validFrom: null,
        validTo: null,
        fromMention: false,
        visibility: 'members',
        createdAt: new Date().toISOString(),
      },
    ]);

    await page.goto(`/worlds/${newId}/coherence`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Controllo di coerenza' }),
    ).toBeVisible();

    await expect(
      page.getByRole('heading', { name: 'Intervalli di validità invertiti' }),
    ).toBeVisible();
    await expect(page.locator('#temporal-findings')).toContainText('Aragorn — erede di → Arathorn');

    await expect(
      page.getByRole('heading', { name: 'Relazioni senza etichetta inversa' }),
    ).toBeVisible();
    // Entrambe le relazioni non hanno un'etichetta inversa: la prima compare qui *anche* se compare già sopra.
    await expect(page.locator('#missing-inverse-findings')).toContainText(
      'Aragorn — erede di → Arathorn',
    );
    await expect(page.locator('#missing-inverse-findings')).toContainText(
      'Aragorn — conosce → Arathorn',
    );

    await expect(page.getByRole('heading', { name: 'Snippet senza relazioni' })).toBeVisible();
    await expect(page.locator('#orphan-findings')).toContainText('Isolato');
  });

  test('una relazione con etichetta inversa non compare tra quelle senza', async ({ browser }) => {
    const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
    await registerAndSignIn(page, 'Autrice');
    const worldId = await createWorld(page, 'Aurelia');
    const urlAragorn = await createSnippet(page, worldId, 'Aragorn');
    await createSnippet(page, worldId, 'Arathorn');
    await page.goto(urlAragorn);
    await page.locator('#rel-target').selectOption({ label: 'Arathorn' });
    await page.locator('#rel-label').fill('genitore di');
    await page.locator('#rel-inverse').fill('figlio di');
    await page.getByRole('button', { name: 'Aggiungi relazione' }).click();
    await expect(page.getByRole('status')).toHaveText('Relazione aggiunta.');

    await page.goto(`/worlds/${worldId}/coherence`);
    await expect(page.getByText('Tutte le relazioni hanno un’etichetta inversa.')).toBeVisible();
  });

  test('accessibilità del report', async ({ browser }) => {
    const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
    await registerAndSignIn(page, 'Autrice');
    const worldId = await createWorld(page, 'Aurelia');
    await createSnippet(page, worldId, 'Solo');
    await page.goto(`/worlds/${worldId}/coherence`);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious.map((v) => v.id)).toEqual([]);
  });
});
