import { expect, test } from '@playwright/test';

// Dati di `supabase/seed.sql` (creati da `supabase db reset` e da `supabase start` su un database nuovo).
test.describe('dati di demo', () => {
  test('login demo, mondo di esempio con menzioni e prova di carico', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('demo@worldloom.test');
    await page.getByLabel('Password', { exact: true }).fill('Demo-Worldloom-1');
    await page.getByRole('button', { name: 'Accedi' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));

    await page.goto('/worlds');
    await expect(page.getByRole('link', { name: 'Aurelia (demo)' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Prova di carico/ })).toBeVisible();

    await page.getByRole('link', { name: 'Aurelia (demo)' }).click();
    await page.getByRole('link', { name: 'Snippet', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Elara Venti' })).toBeVisible();
    await page.getByRole('link', { name: 'Elara Venti' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Elara Venti' })).toBeVisible();
    // Le menzioni nel testo e i backlink dello snippet citato.
    await expect(page.getByText('Porto Verde').first()).toBeVisible();
  });

  test('la ricerca nella prova di carico trova risultati con 5.000 snippet', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('demo@worldloom.test');
    await page.getByLabel('Password', { exact: true }).fill('Demo-Worldloom-1');
    await page.getByRole('button', { name: 'Accedi' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto('/worlds');
    await page.getByRole('link', { name: /Prova di carico/ }).click();
    await page.waitForURL(/\/worlds\/[0-9a-f-]{36}$/);
    const worldUrl = new URL(page.url()).pathname;

    await page.goto(`${worldUrl}/search?q=aldera`);
    await expect(page.getByRole('link', { name: /Elemento \d{4} Aldera/ }).first()).toBeVisible();
  });

  test('il grafo della prova di carico mostra i 300 nodi più collegati e si ricentra', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('demo@worldloom.test');
    await page.getByLabel('Password', { exact: true }).fill('Demo-Worldloom-1');
    await page.getByRole('button', { name: 'Accedi' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto('/worlds');
    await page.getByRole('link', { name: /Prova di carico/ }).click();
    await page.waitForURL(/\/worlds\/[0-9a-f-]{36}$/);
    const worldUrl = new URL(page.url()).pathname;

    await page.goto(`${worldUrl}/graph`);
    await expect(page.locator('svg.graph a.graph-node')).toHaveCount(300);
    await expect(page.getByText(/Mostrati i 300 nodi più collegati/)).toBeVisible();

    // Ricentrare su un nodo: il vicinato a 2 passi (4 archi per nodo) resta sotto il tetto e il grafo si ridisegna.
    // Con 300 nodi i cerchi si sfiorano: si ricentra da tastiera (fuoco + Invio), come farebbe chi non usa il mouse.
    await page.locator('svg.graph a.graph-node').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Grafo centrato su/)).toBeVisible();
    expect(await page.locator('svg.graph a.graph-node').count()).toBeGreaterThan(5);
  });
});
