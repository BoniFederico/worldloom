import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  await registerAndSignIn(page, name);
  return page;
}

async function createCampaign(page: Page, name: string): Promise<string> {
  await page.goto('/campaigns');
  await page.getByLabel('Nome della campagna').fill(name);
  await page.getByRole('button', { name: 'Crea campagna' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname.split('/')[2] as string;
}

async function join(dm: Page, guest: Page, campaign: string, role: 'player' | 'observer') {
  await dm.goto(`/campaigns/${campaign}`);
  await dm.getByLabel('Ruolo', { exact: true }).selectOption(role);
  await dm.getByRole('button', { name: 'Crea invito' }).click();
  await expect(dm.getByRole('status')).toHaveText('Invito creato.');
  const link = await dm.locator('input.invite-link').first().inputValue();
  await guest.goto(link);
  await guest.getByRole('button', { name: 'Accetta l’invito' }).click();
  await expect(guest.getByRole('status')).toHaveText('Sei entrato nella campagna.');
}

async function useD20(dm: Page, campaign: string) {
  await dm.goto(`/campaigns/${campaign}/stats`);
  await dm.getByRole('button', { name: 'Usa lo schema «Fantasy d20»' }).click();
  await expect(dm.getByRole('status')).toHaveText('Schema sostituito.');
}

/** Totale di un tiro, letto dalla riga «Totale: N» della cronologia. */
function parseTotal(text: string): number {
  const m = /Totale:\s*(-?\d+(?:\.\d+)?)/.exec(text);
  if (!m) throw new Error(`formato tiro inatteso: ${text}`);
  return Number(m[1]);
}

/** Il risultato di un singolo dado (un solo termine, es. «1d20 → [14] = 14»). */
function parseSingleDie(text: string): number {
  const m = /\[(\d+)\]/.exec(text);
  if (!m) throw new Error(`formato tiro inatteso: ${text}`);
  return Number(m[1]);
}

test.describe('tiratore di dadi', () => {
  test('notazione standard: somma dadi e modificatore, visibile nello storico condiviso', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');

    await dm.goto(`/campaigns/${id}/dice`);
    await dm.getByLabel('Notazione').fill('2d6+3');
    await dm.getByRole('button', { name: 'Tira' }).click();
    await expect(dm.getByRole('status')).toHaveText('Tiro registrato.');

    const entry = dm.locator('.chronicle-list li').first();
    await expect(entry).toContainText('2d6+3');
    const total = parseTotal(await entry.innerText());
    expect(total).toBeGreaterThanOrEqual(5); // 2 (min) + 3
    expect(total).toBeLessThanOrEqual(15); // 12 (max) + 3
  });

  test('vantaggio e svantaggio: si tira due volte, si mostra anche il tentativo scartato', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');

    await dm.goto(`/campaigns/${id}/dice`);
    await dm.getByLabel('Notazione').fill('1d20');
    await dm.getByLabel('Modalità').selectOption('advantage');
    await dm.getByRole('button', { name: 'Tira' }).click();
    await expect(dm.getByRole('status')).toHaveText('Tiro registrato.');

    const entry = dm.locator('.chronicle-list li').first();
    await expect(entry).toContainText('Vantaggio');
    await expect(entry).toContainText('Scartato');
  });

  test('formula con le statistiche di un personaggio', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const p1 = await newUser(browser, 'Giulia');
    const id = await createCampaign(dm, 'La Corona');
    await useD20(dm, id);
    await join(dm, p1, id, 'player');

    await p1.goto(`/campaigns/${id}/characters`);
    await p1.getByLabel('Nome', { exact: true }).fill('Lyra');
    await p1.getByRole('button', { name: 'Crea la scheda' }).click();
    await expect(p1.getByRole('status')).toHaveText('Scheda creata.');
    await p1.getByLabel('Destrezza', { exact: true }).fill('16');
    await p1.getByRole('button', { name: 'Salva la scheda' }).click();
    await expect(p1.getByRole('status')).toHaveText('Scheda salvata.');

    // Mod. Destrezza di 16 = floor((16-10)/2) = 3.
    await p1.goto(`/campaigns/${id}/dice`);
    await p1.getByLabel('Notazione').fill('1d20+dex_mod');
    await p1.getByLabel('Personaggio').selectOption({ label: 'Lyra' });
    await p1.getByRole('button', { name: 'Tira' }).click();
    await expect(p1.getByRole('status')).toHaveText('Tiro registrato.');

    const entry = p1.locator('.chronicle-list li').first();
    await expect(entry).toContainText('Lyra');
    const text = await entry.innerText();
    expect(parseTotal(text)).toBe(parseSingleDie(text) + 3);
  });

  test('un tiro privato lo vede solo chi gestisce la campagna', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const p1 = await newUser(browser, 'Giulia');
    const id = await createCampaign(dm, 'La Corona');
    await join(dm, p1, id, 'player');

    await dm.goto(`/campaigns/${id}/dice`);
    await dm.getByLabel('Notazione').fill('1d100');
    await dm.getByLabel('Tiro privato (solo chi gestisce la campagna lo vede)').check();
    await dm.getByRole('button', { name: 'Tira' }).click();
    await expect(dm.getByRole('status')).toHaveText('Tiro registrato.');
    await expect(dm.locator('.chronicle-list li')).toHaveCount(1);
    await expect(dm.locator('.chronicle-list')).toContainText('privato');

    await p1.goto(`/campaigns/${id}/dice`);
    await expect(p1.getByText('Non è ancora stato tirato nessun dado.')).toBeVisible();
  });

  test('accessibilità della pagina dei dadi', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm, 'La Corona');
    await dm.goto(`/campaigns/${id}/dice`);
    await dm.getByLabel('Notazione').fill('1d20');
    await dm.getByRole('button', { name: 'Tira' }).click();
    await expect(dm.getByRole('status')).toHaveText('Tiro registrato.');
    const results = await new AxeBuilder({ page: dm }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious.map((v) => v.id)).toEqual([]);
  });
});
