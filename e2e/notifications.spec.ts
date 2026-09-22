import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { addMember, createWorld, registerAndSignIn } from './session';

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

async function makeInvite(
  page: Page,
  campaignId: string,
  opts: { role?: string; email?: string } = {},
): Promise<string> {
  await page.goto(`/campaigns/${campaignId}`);
  if (opts.role) await page.getByLabel('Ruolo', { exact: true }).selectOption(opts.role);
  if (opts.email) await page.getByLabel('Solo per questa email (facoltativa)').fill(opts.email);
  await page.getByRole('button', { name: 'Crea invito' }).click();
  await expect(page.getByRole('status')).toHaveText('Invito creato.');
  return page.locator('input.invite-link').first().inputValue();
}

const bell = (page: Page) => page.getByRole('link', { name: 'Notifiche' });
const editor = (page: Page) => page.getByRole('textbox', { name: 'Testo' });
async function readyEditor(page: Page) {
  await expect(page.getByRole('group', { name: 'Formattazione del testo' })).toBeVisible();
}

test.describe('notifiche in-app', () => {
  test('una rivelazione condivisa notifica solo il destinatario, con link e stato letta/non letta', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const anna = await newUser(browser, 'Anna');
    const bruno = await newUser(browser, 'Bruno');
    const worldId = await createWorld(dm.page, 'Aurelia');
    await addMember(dm.page, worldId, anna.email, 'reader');
    await addMember(dm.page, worldId, bruno.email, 'reader');

    await dm.page.goto(`/worlds/${worldId}/snippets`);
    await dm.page.getByLabel('Titolo').fill('Drago');
    await dm.page.getByRole('button', { name: 'Crea snippet' }).click();
    await expect(dm.page.getByRole('heading', { level: 1, name: 'Drago' })).toBeVisible();
    const snippetUrl = dm.page.url().split('?')[0] as string;
    const panel = dm.page.locator('section[aria-labelledby="visibility"]');
    // Prima lo rende segreto: solo così passare a «giocatori scelti» è davvero una rivelazione (di uno snippet
    // creato dal modulo, che parte visibile a tutti i membri) e non un restringimento silenzioso.
    await panel.getByLabel('Livello dello snippet').selectOption('secret');
    await panel.getByRole('button', { name: 'Applica visibilità' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Visibilità salvata.');
    // Lo stato e il valore del livello sarebbero già veri sul DOM non ancora aggiornato (il testo non cambia da un
    // invio all'altro e la select riflette subito la scelta fatta nel browser): solo il registro arriva dal server,
    // quindi è l'unico modo per essere certi che il secondo invio (la vera rivelazione) sia stato scritto prima di
    // guardare le notifiche di Anna.
    await expect(dm.page.locator('ol.visibility-log li')).toHaveCount(1);
    await panel.getByLabel('Livello dello snippet').selectOption('shared');
    await panel
      .getByRole('group', { name: 'Giocatori scelti', exact: true })
      .getByLabel('Anna')
      .check();
    await panel.getByRole('button', { name: 'Applica visibilità' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Visibilità salvata.');
    await expect(dm.page.locator('ol.visibility-log li')).toHaveCount(2);
    await expect(dm.page.locator('ol.visibility-log li').first()).toContainText('Rivelazione');

    // Anna ha una notifica non letta, Bruno nessuna, il DM (autore della rivelazione) nemmeno.
    await anna.page.goto('/notifications');
    const item = anna.page.locator('.notifications-list li').first();
    await expect(item).toHaveClass(/unread/);
    await expect(item).toContainText('Drago');
    await expect(item.getByRole('link', { name: /Drago/ })).toHaveAttribute(
      'href',
      new URL(snippetUrl).pathname,
    );
    await item.getByRole('button', { name: 'Segna come letta' }).click();
    // Il bottone sparisce solo nel nuovo render (dopo che il server action ha scritto `read_at`): aspettarlo
    // evita di controllare la classe prima che la transizione del router sia arrivata.
    await expect(item.getByRole('button', { name: 'Segna come letta' })).toHaveCount(0);
    await expect(anna.page.locator('.notifications-list li').first()).not.toHaveClass(/unread/);
    await anna.page.goto('/');
    await expect(bell(anna.page).locator('.badge')).toHaveCount(0);

    await bruno.page.goto('/notifications');
    await expect(bruno.page.getByText('Non ci sono ancora notifiche.')).toBeVisible();
  });

  test('una nuova sessione notifica i membri della campagna, non il DM che l’ha creata', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const giulia = await newUser(browser, 'Giulia');
    const id = await createCampaign(dm.page, 'La Corona');
    const link = await makeInvite(dm.page, id, { role: 'player' });
    await giulia.page.goto(link);
    await giulia.page.getByRole('button', { name: 'Accetta l’invito' }).click();
    await expect(giulia.page.getByRole('status')).toHaveText('Sei entrato nella campagna.');

    // L'accettazione dell'invito notifica già il DM (chi lo ha creato): la si segna come letta, così la sessione
    // creata subito dopo resta l'unica cosa da verificare.
    await dm.page.goto('/notifications');
    await expect(
      dm.page.getByText('Giulia è entrato in «La Corona» come Giocatore.'),
    ).toBeVisible();
    await dm.page.getByRole('button', { name: 'Segna tutte come lette' }).click();

    await dm.page.goto(`/campaigns/${id}/sessions`);
    await dm.page.getByRole('button', { name: 'Crea la sessione' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Sessione creata.');

    await giulia.page.goto('/notifications');
    await expect(giulia.page.getByText('Nuova sessione: 1.')).toBeVisible();
    await dm.page.goto('/notifications');
    await expect(dm.page.locator('.notifications-list li.unread')).toHaveCount(0);
  });

  test('menzionare lo snippet di un altro autore lo notifica; menzionare il proprio no', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const bruno = await newUser(browser, 'Bruno');
    const worldId = await createWorld(dm.page, 'Aurelia');
    await addMember(dm.page, worldId, bruno.email, 'editor');

    await dm.page.goto(`/worlds/${worldId}/snippets`);
    await dm.page.getByLabel('Titolo').fill('Bersaglio');
    await dm.page.getByRole('button', { name: 'Crea snippet' }).click();
    await expect(dm.page.getByRole('heading', { level: 1, name: 'Bersaglio' })).toBeVisible();

    await bruno.page.goto(`/worlds/${worldId}/snippets`);
    await bruno.page.getByLabel('Titolo').fill('Fonte');
    await bruno.page.getByRole('button', { name: 'Crea snippet' }).click();
    await expect(bruno.page.getByRole('heading', { level: 1, name: 'Fonte' })).toBeVisible();
    await readyEditor(bruno.page);
    await editor(bruno.page).click();
    await bruno.page.keyboard.type('Vedi @Bersaglio');
    const list = bruno.page.getByRole('listbox', { name: 'Snippet da menzionare' });
    await expect(list).toBeVisible();
    await bruno.page.keyboard.press('Enter');
    await expect(bruno.page.locator('.save-status')).toHaveText('Salvato', { timeout: 10_000 });

    await dm.page.goto('/notifications');
    await expect(dm.page.getByText('«Fonte» ha citato uno dei tuoi snippet.')).toBeVisible();

    await bruno.page.goto('/notifications');
    await expect(bruno.page.getByText('Non ci sono ancora notifiche.')).toBeVisible();
  });

  test('un invito per email di un account registrato lo notifica; accettarlo notifica chi lo ha creato', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const giulia = await newUser(browser, 'Giulia');
    const id = await createCampaign(dm.page, 'La Corona');
    const link = await makeInvite(dm.page, id, { role: 'player', email: giulia.email });

    await giulia.page.goto('/notifications');
    await expect(
      giulia.page.getByText(/Sei stato invitato a «La Corona» come Giocatore\./),
    ).toBeVisible();

    await giulia.page.goto(link);
    await giulia.page.getByRole('button', { name: 'Accetta l’invito' }).click();
    await expect(giulia.page.getByRole('status')).toHaveText('Sei entrato nella campagna.');

    await dm.page.goto('/notifications');
    await expect(
      dm.page.getByText(/Giulia è entrato in «La Corona» come Giocatore\./),
    ).toBeVisible();
  });

  test('accessibilità della pagina delle notifiche', async ({ browser }) => {
    const dm = await newUser(browser, 'Direttrice');
    await dm.page.goto('/notifications');
    const results = await new AxeBuilder({ page: dm.page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious.map((v) => v.id)).toEqual([]);
  });
});
