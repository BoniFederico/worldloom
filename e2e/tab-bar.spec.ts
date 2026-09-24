import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createWorld, registerAndSignIn } from './session';

test.describe('barra di schede', () => {
  test('apre una scheda per ogni vista visitata, la marca attiva e la chiude', async ({ page }) => {
    await registerAndSignIn(page);
    const worldId = await createWorld(page, 'Cronache');

    await page.goto(`/worlds/${worldId}/table`);
    await page.goto(`/worlds/${worldId}/graph`);

    const bar = page.getByRole('navigation', { name: 'Schede aperte' });
    await expect(bar.getByRole('link', { name: /Tabella/ })).toBeVisible();
    const graphTab = bar.getByRole('link', { name: /Grafo/ });
    await expect(graphTab).toBeVisible();
    await expect(graphTab).toHaveAttribute('aria-current', 'page');

    // Tornare a una scheda già aperta non ne crea una seconda.
    await page.goto(`/worlds/${worldId}/table`);
    await expect(bar.getByRole('link', { name: /Tabella/ })).toHaveCount(1);

    // Chiudere la scheda attiva (l'ultima aperta) torna a quella immediatamente precedente.
    await graphTab.hover();
    await page.getByRole('button', { name: /Chiudi scheda: Grafo/ }).click();
    await expect(page).toHaveURL(new RegExp(`/worlds/${worldId}/table$`));
    await expect(bar.getByRole('link', { name: /Grafo/ })).toHaveCount(0);
  });

  test('la scheda di uno snippet mostra il suo titolo, non un’etichetta generica', async ({
    page,
  }) => {
    await registerAndSignIn(page);
    const worldId = await createWorld(page, 'Cronache');
    await page.goto(`/worlds/${worldId}/snippets`);
    await page.getByLabel('Titolo').fill('Elara');
    await page.getByRole('button', { name: 'Crea snippet' }).click();
    // La creazione porta direttamente al dettaglio del nuovo snippet.
    await expect(page.getByRole('heading', { level: 1, name: 'Elara' })).toBeVisible();

    const bar = page.getByRole('navigation', { name: 'Schede aperte' });
    await expect(bar.getByRole('link', { name: /Elara/ })).toBeVisible();
  });

  test('le schede aperte sopravvivono a un ricaricamento della pagina', async ({ page }) => {
    await registerAndSignIn(page);
    const worldId = await createWorld(page, 'Cronache');
    await page.goto(`/worlds/${worldId}/table`);
    await page.goto(`/worlds/${worldId}/graph`);

    await page.reload();
    const bar = page.getByRole('navigation', { name: 'Schede aperte' });
    await expect(bar.getByRole('link', { name: /Tabella/ })).toBeVisible();
    await expect(bar.getByRole('link', { name: /Grafo/ })).toBeVisible();
  });

  test('accessibilità della barra di schede', async ({ page }) => {
    await registerAndSignIn(page);
    const worldId = await createWorld(page, 'Cronache');
    await page.goto(`/worlds/${worldId}/table`);
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});
