import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { createWorld, registerAndSignIn } from './session';

async function newUser(browser: Browser, name: string) {
  const page = await (await browser.newContext({ locale: 'it-IT' })).newPage();
  const email = await registerAndSignIn(page, name);
  return { page, email };
}

async function createCampaign(page: Page, name: string, world?: string): Promise<string> {
  await page.goto('/campaigns');
  await page.getByLabel('Nome della campagna').fill(name);
  if (world) await page.getByLabel('Mondo collegato').selectOption({ label: world });
  await page.getByRole('button', { name: 'Crea campagna' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname.split('/')[2] as string;
}

async function join(dm: Page, guest: Page, campaign: string, role: string): Promise<void> {
  await dm.goto(`/campaigns/${campaign}`);
  await dm.getByLabel('Ruolo', { exact: true }).selectOption(role);
  await dm.getByRole('button', { name: 'Crea invito' }).click();
  await expect(dm.getByRole('status')).toHaveText('Invito creato.');
  const link = await dm.locator('input.invite-link').first().inputValue();
  await guest.goto(link);
  await guest.getByRole('button', { name: 'Accetta l’invito' }).click();
  await expect(guest.getByRole('status')).toHaveText('Sei entrato nella campagna.');
}

test.describe('sessioni', () => {
  test('il DM crea una sessione, la modifica, la collega a uno snippet e la elimina', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const worldId = await createWorld(dm.page, 'Aurelia');
    await dm.page.goto(`/worlds/${worldId}/snippets`);
    await dm.page.getByLabel('Titolo').fill('Battaglia di Aurelia');
    await dm.page.getByRole('button', { name: 'Crea snippet' }).click();
    await expect(
      dm.page.getByRole('heading', { level: 1, name: 'Battaglia di Aurelia' }),
    ).toBeVisible();

    const id = await createCampaign(dm.page, 'La Corona', 'Aurelia');
    await dm.page.goto(`/campaigns/${id}/sessions`);
    await expect(dm.page.getByText('Non ci sono ancora sessioni.')).toBeVisible();
    await dm.page.getByLabel('Titolo (facoltativo)').fill('Assedio');
    await dm.page.getByLabel('Riepilogo').fill('Il gruppo assedia la torre.');
    await dm.page.getByRole('button', { name: 'Crea la sessione' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Sessione creata.');
    await expect(dm.page.getByRole('heading', { level: 1, name: 'Assedio' })).toBeVisible();
    await expect(dm.page.getByText('Sessione 1')).toBeVisible();

    // Collega l'evento della timeline.
    await dm.page.getByLabel('Titolo dello snippet da collegare').fill('Battaglia di Aurelia');
    await dm.page.getByRole('button', { name: 'Collega' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Evento collegato.');
    await expect(dm.page.getByRole('link', { name: 'Battaglia di Aurelia' })).toBeVisible();

    // Note del DM.
    await dm.page
      .getByLabel('Visibili solo a chi gestisce la campagna (DM e co-DM).')
      .fill('Segreto tattico.');
    await dm.page.getByRole('button', { name: 'Salva le note' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Note salvate.');
    await dm.page.reload();
    await expect(
      dm.page.getByLabel('Visibili solo a chi gestisce la campagna (DM e co-DM).'),
    ).toHaveValue('Segreto tattico.');

    // Scollega l'evento.
    await dm.page.getByRole('button', { name: 'Scollega' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Evento scollegato.');
    await expect(dm.page.getByText('Nessun evento collegato.')).toBeVisible();

    // Elimina la sessione.
    await dm.page.getByLabel('Confermo l’eliminazione della sessione').check();
    await dm.page.getByRole('button', { name: 'Elimina', exact: true }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Sessione eliminata.');
    await expect(dm.page.getByText('Non ci sono ancora sessioni.')).toBeVisible();
  });

  test('un giocatore legge la sessione, scrive le proprie note private e non vede quelle di un altro né quelle del DM', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const p1 = await newUser(browser, 'Giulia');
    const p2 = await newUser(browser, 'Marco');
    const id = await createCampaign(dm.page, 'La Corona');
    await join(dm.page, p1.page, id, 'player');
    await join(dm.page, p2.page, id, 'player');

    await dm.page.goto(`/campaigns/${id}/sessions`);
    await dm.page.getByRole('button', { name: 'Crea la sessione' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Sessione creata.');
    const sessionUrl = dm.page.url();
    await dm.page
      .getByLabel('Visibili solo a chi gestisce la campagna (DM e co-DM).')
      .fill('Piano del DM.');
    await dm.page.getByRole('button', { name: 'Salva le note' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Note salvate.');

    await p1.page.goto(sessionUrl);
    // Il giocatore non vede il modulo di modifica né le note del DM.
    await expect(p1.page.getByLabel('Titolo (facoltativo)')).toHaveCount(0);
    await expect(p1.page.getByText('Visibili solo a chi gestisce la campagna')).toHaveCount(0);
    await p1.page.getByLabel('Private: solo tu le vedi, nemmeno il DM.').fill('La mia strategia.');
    await p1.page.getByRole('button', { name: 'Salva le note' }).click();
    await expect(p1.page.getByRole('status')).toHaveText('Note salvate.');
    await p1.page.reload();
    await expect(p1.page.getByLabel('Private: solo tu le vedi, nemmeno il DM.')).toHaveValue(
      'La mia strategia.',
    );

    await p2.page.goto(sessionUrl);
    await expect(p2.page.getByLabel('Private: solo tu le vedi, nemmeno il DM.')).toHaveValue('');
  });

  test('un osservatore non gestisce né scrive note; un estraneo non trova la campagna', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const obs = await newUser(browser, 'Osservatore');
    const stranger = await newUser(browser, 'Estraneo');
    const id = await createCampaign(dm.page, 'La Corona');
    await join(dm.page, obs.page, id, 'observer');
    await dm.page.goto(`/campaigns/${id}/sessions`);
    await dm.page.getByRole('button', { name: 'Crea la sessione' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Sessione creata.');
    const sessionUrl = dm.page.url();

    await obs.page.goto(sessionUrl);
    await expect(obs.page.getByLabel('Titolo (facoltativo)')).toHaveCount(0);
    await expect(obs.page.getByLabel('Private: solo tu le vedi, nemmeno il DM.')).toHaveCount(0);
    await obs.page.goto(`/campaigns/${id}/sessions`);
    await expect(obs.page.getByLabel('Titolo (facoltativo)')).toHaveCount(0);

    expect((await stranger.page.goto(sessionUrl))?.status()).toBe(404);
  });

  test('accessibilità dell’elenco e della pagina della sessione', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm.page, 'La Corona');
    await dm.page.goto(`/campaigns/${id}/sessions`);
    await dm.page.getByRole('button', { name: 'Crea la sessione' }).click();
    for (const path of [`/campaigns/${id}/sessions`, dm.page.url()]) {
      await dm.page.goto(path);
      const results = await new AxeBuilder({ page: dm.page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(serious.map((v) => `${path}: ${v.id}`)).toEqual([]);
    }
  });
});

test.describe('diario e bacheca', () => {
  test('un giocatore pubblica nel diario e in bacheca; solo l’autore o chi gestisce elimina', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const p1 = await newUser(browser, 'Giulia');
    const id = await createCampaign(dm.page, 'La Corona');
    await join(dm.page, p1.page, id, 'player');

    await p1.page.goto(`/campaigns/${id}/chronicle`);
    await p1.page.getByLabel('Nuova voce').fill('Il gruppo raggiunge la città.');
    await p1.page.getByRole('button', { name: 'Pubblica' }).click();
    await expect(p1.page.getByRole('status')).toHaveText('Voce pubblicata.');
    await expect(p1.page.getByText('Il gruppo raggiunge la città.')).toBeVisible();

    await dm.page.goto(`/campaigns/${id}/chronicle`);
    await expect(dm.page.getByText('Il gruppo raggiunge la città.')).toBeVisible();

    await p1.page.goto(`/campaigns/${id}/messages`);
    await p1.page.getByLabel('Nuovo messaggio').fill('Ci vediamo sabato?');
    await p1.page.getByRole('button', { name: 'Invia' }).click();
    await expect(p1.page.getByRole('status')).toHaveText('Messaggio inviato.');

    // Il DM può eliminare il messaggio del giocatore (moderazione); un messaggio vuoto è rifiutato dal browser (required).
    await dm.page.goto(`/campaigns/${id}/messages`);
    await dm.page.getByRole('button', { name: 'Elimina', exact: true }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Messaggio eliminato.');
    await expect(dm.page.getByText('Ci vediamo sabato?')).toHaveCount(0);
  });

  test('un osservatore legge ma non scrive; un estraneo non trova né diario né bacheca', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const obs = await newUser(browser, 'Osservatore');
    const stranger = await newUser(browser, 'Estraneo');
    const id = await createCampaign(dm.page, 'La Corona');
    await join(dm.page, obs.page, id, 'observer');
    await dm.page.goto(`/campaigns/${id}/chronicle`);
    await dm.page.getByLabel('Nuova voce').fill('Prologo della campagna.');
    await dm.page.getByRole('button', { name: 'Pubblica' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Voce pubblicata.');

    await obs.page.goto(`/campaigns/${id}/chronicle`);
    await expect(obs.page.getByText('Prologo della campagna.')).toBeVisible();
    await expect(obs.page.getByLabel('Nuova voce')).toHaveCount(0);

    expect((await stranger.page.goto(`/campaigns/${id}/chronicle`))?.status()).toBe(404);
    expect((await stranger.page.goto(`/campaigns/${id}/messages`))?.status()).toBe(404);
  });

  test('accessibilità di diario e bacheca', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm.page, 'La Corona');
    for (const path of [`/campaigns/${id}/chronicle`, `/campaigns/${id}/messages`]) {
      await dm.page.goto(path);
      const results = await new AxeBuilder({ page: dm.page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(serious.map((v) => `${path}: ${v.id}`)).toEqual([]);
    }
  });
});
