import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { registerAndSignIn } from './session';

test.describe('importazione da Markdown/Obsidian e CSV', () => {
  test('due file Markdown con un wikilink creano due snippet collegati', async ({ page }) => {
    await registerAndSignIn(page, 'Autrice');
    await page.goto('/worlds/import');
    expect(
      await new AxeBuilder({ page })
        .analyze()
        .then((r) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')),
    ).toEqual([]);

    await page.locator('#md-name').fill('Aurelia MD');
    await page.locator('#md-files').setInputFiles([
      {
        name: 'aragorn.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('---\ntitle: Aragorn\ntags: [eroe]\n---\nAmico di [[Legolas]].'),
      },
      {
        name: 'legolas.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('---\ntitle: Legolas\n---\nUn elfo.'),
      },
    ]);
    await page.getByRole('button', { name: 'Importa da Markdown' }).click();
    await expect(page.getByRole('status')).toHaveText('Mondo importato.');
    const worldId = new URL(page.url()).pathname.split('/')[2] as string;

    await page.goto(`/worlds/${worldId}/snippets`);
    await expect(page.getByRole('link', { name: 'Aragorn', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Legolas', exact: true })).toBeVisible();

    const res = await page.request.get(`/worlds/${worldId}/export`);
    const data = JSON.parse(await res.text());
    const aragorn = data.snippets.find((s: { title: string }) => s.title === 'Aragorn');
    const legolas = data.snippets.find((s: { title: string }) => s.title === 'Legolas');
    expect(aragorn.tags).toEqual(['eroe']);
    expect(
      data.relations.some(
        (r: { source: string; target: string; fromMention: boolean }) =>
          r.source === aragorn.ref && r.target === legolas.ref && r.fromMention,
      ),
    ).toBe(true);
  });

  test('un CSV crea uno snippet per riga con i campi dalle colonne', async ({ page }) => {
    await registerAndSignIn(page, 'Autrice');
    await page.goto('/worlds/import');
    await page.locator('#csv-name').fill('Aurelia CSV');
    await page.locator('#csv-category').fill('Personaggi');
    await page.locator('#csv-file').setInputFiles({
      name: 'personaggi.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('titolo,ruolo\nElara,maga\nBruno,fabbro'),
    });
    await page.getByRole('button', { name: 'Importa da CSV' }).click();
    await expect(page.getByRole('status')).toHaveText('Mondo importato.');
    const worldId = new URL(page.url()).pathname.split('/')[2] as string;

    await page.goto(`/worlds/${worldId}/snippets`);
    await expect(page.getByRole('link', { name: 'Elara', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bruno', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Elara', exact: true }).click();
    await expect(page.getByLabel('ruolo')).toHaveValue('maga');
  });
});
