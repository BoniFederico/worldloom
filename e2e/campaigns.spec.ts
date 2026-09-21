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

/** Crea un invito dal modulo della pagina della campagna e ne restituisce il link (il primo valido dell'elenco). */
async function makeInvite(
  page: Page,
  campaignId: string,
  opts: { role?: string; email?: string; uses?: string } = {},
): Promise<string> {
  await page.goto(`/campaigns/${campaignId}`);
  if (opts.role) await page.getByLabel('Ruolo', { exact: true }).selectOption(opts.role);
  if (opts.email) await page.getByLabel('Solo per questa email (facoltativa)').fill(opts.email);
  if (opts.uses) await page.getByLabel('Numero di usi').fill(opts.uses);
  await page.getByRole('button', { name: 'Crea invito' }).click();
  await expect(page.getByRole('status')).toHaveText('Invito creato.');
  const link = await page.locator('input.invite-link').first().inputValue();
  expect(link).toMatch(/\/invite\/[0-9a-f]{64}$/);
  return link;
}

const memberRow = (page: Page, name: string | RegExp) =>
  page
    .locator('table.members')
    .first()
    .locator('tr', { has: page.getByRole('rowheader', { name }) });

test.describe('campagne e inviti', () => {
  test('il DM crea una campagna, invita un giocatore con un link e lo vede tra i membri', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const guest = await newUser(browser, 'Giocatore');
    await createWorld(dm.page, 'Aurelia');
    const id = await createCampaign(dm.page, 'La Corona', 'Aurelia');
    await expect(dm.page.getByText('Mondo: Aurelia')).toBeVisible();
    await expect(memberRow(dm.page, /Direttrice/)).toContainText('DM');

    const link = await makeInvite(dm.page, id, { role: 'player' });

    // Chi apre il link vede nome e ruolo, e aderisce solo con un'azione esplicita.
    await guest.page.goto(link);
    await expect(
      guest.page.getByText('Sei stato invitato a «La Corona» come Giocatore.'),
    ).toBeVisible();
    await guest.page.getByRole('button', { name: 'Accetta l’invito' }).click();
    await expect(guest.page.getByRole('status')).toHaveText('Sei entrato nella campagna.');
    await expect(guest.page.getByRole('heading', { level: 1, name: 'La Corona' })).toBeVisible();
    // Il giocatore non vede né gli inviti né la gestione, ma può uscire.
    await expect(guest.page.getByRole('heading', { name: 'Inviti' })).toHaveCount(0);
    await expect(guest.page.getByRole('button', { name: 'Elimina campagna' })).toHaveCount(0);
    await expect(guest.page.getByRole('button', { name: 'Esci dalla campagna' })).toBeVisible();

    await dm.page.goto(`/campaigns/${id}`);
    await expect(memberRow(dm.page, /Giocatore/)).toContainText('Giocatore');
    // Il link a un solo uso è esaurito.
    await expect(dm.page.getByText('Esaurito')).toBeVisible();

    // Il giocatore vede la campagna nell'elenco; un estraneo no.
    await guest.page.goto('/campaigns');
    await expect(guest.page.getByRole('link', { name: 'La Corona' })).toBeVisible();
    const stranger = await newUser(browser, 'Estraneo');
    await stranger.page.goto('/campaigns');
    await expect(stranger.page.getByRole('link', { name: 'La Corona' })).toHaveCount(0);
    expect((await stranger.page.goto(`/campaigns/${id}`))?.status()).toBe(404);
  });

  test('un invito legato a un’email vale solo per quell’account; la revoca lo annulla', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const chosen = await newUser(browser, 'Prescelto');
    const other = await newUser(browser, 'Altro');
    const late = await newUser(browser, 'Tardivo');
    const id = await createCampaign(dm.page, 'Ombre');

    const link = await makeInvite(dm.page, id, { role: 'observer', email: chosen.email });
    await other.page.goto(link);
    await expect(other.page.locator('p[role="alert"]')).toContainText('Questo invito non è valido');
    await expect(other.page.getByRole('button', { name: 'Accetta l’invito' })).toHaveCount(0);

    await chosen.page.goto(link);
    await chosen.page.getByRole('button', { name: 'Accetta l’invito' }).click();
    await expect(chosen.page.getByRole('status')).toHaveText('Sei entrato nella campagna.');
    await expect(memberRow(chosen.page, /Prescelto/)).toContainText('Osservatore');

    // Un link aperto, revocato prima dell'uso, non vale più.
    const open = await makeInvite(dm.page, id, { role: 'player' });
    await dm.page
      .getByRole('button', { name: /Revoca/ })
      .first()
      .click();
    await expect(dm.page.getByRole('status')).toHaveText('Invito revocato.');
    await late.page.goto(open);
    await expect(late.page.locator('p[role="alert"]')).toContainText('Questo invito non è valido');
    // Un token inventato dà lo stesso messaggio.
    await late.page.goto(`/invite/${'a'.repeat(64)}`);
    await expect(late.page.locator('p[role="alert"]')).toContainText('Questo invito non è valido');
  });

  test('ruoli: il DM promuove un co-DM, che non può creare co-DM né toccare il DM; uscita', async ({
    browser,
  }) => {
    const dm = await newUser(browser, 'Direttrice');
    const aide = await newUser(browser, 'Aiutante');
    const player = await newUser(browser, 'Pedina');
    const id = await createCampaign(dm.page, 'Ruoli');

    const l1 = await makeInvite(dm.page, id, { role: 'player' });
    await aide.page.goto(l1);
    await aide.page.getByRole('button', { name: 'Accetta l’invito' }).click();
    const l2 = await makeInvite(dm.page, id, { role: 'player' });
    await player.page.goto(l2);
    await player.page.getByRole('button', { name: 'Accetta l’invito' }).click();
    await expect(player.page.getByRole('status')).toHaveText('Sei entrato nella campagna.');

    await dm.page.goto(`/campaigns/${id}`);
    await dm.page.getByLabel('Ruolo di Aiutante').selectOption('co_dm');
    await memberRow(dm.page, /Aiutante/)
      .getByRole('button', { name: 'Salva' })
      .click();
    await expect(dm.page.getByRole('status')).toHaveText('Ruolo salvato.');
    await expect(dm.page.getByLabel('Ruolo di Aiutante')).toHaveValue('co_dm');

    // Il co-DM gestisce inviti e giocatori, ma non può assegnare il ruolo di co-DM né toccare il DM o un altro co-DM.
    await aide.page.goto(`/campaigns/${id}`);
    await expect(aide.page.getByRole('heading', { name: 'Inviti' })).toBeVisible();
    const inviteRoles = await aide.page
      .getByLabel('Ruolo', { exact: true })
      .locator('option')
      .allInnerTexts();
    expect(inviteRoles).toEqual(['Giocatore', 'Osservatore']);
    await expect(aide.page.getByRole('button', { name: /Rimuovi Direttrice/ })).toHaveCount(0);
    await expect(aide.page.getByLabel('Ruolo di Direttrice')).toHaveCount(0);
    await expect(aide.page.getByRole('button', { name: 'Elimina campagna' })).toHaveCount(0);
    const options = await aide.page.getByLabel('Ruolo di Pedina').locator('option').allInnerTexts();
    expect(options).toEqual(['Giocatore', 'Osservatore']);
    await aide.page.getByLabel('Ruolo di Pedina').selectOption('observer');
    await memberRow(aide.page, /Pedina/)
      .getByRole('button', { name: 'Salva' })
      .click();
    await expect(aide.page.getByRole('status')).toHaveText('Ruolo salvato.');

    // Il giocatore esce; il DM non ha il pulsante e può eliminare.
    await player.page.goto(`/campaigns/${id}`);
    await player.page.getByRole('button', { name: 'Esci dalla campagna' }).click();
    await expect(player.page.getByRole('status')).toHaveText('Sei uscito dalla campagna.');
    await expect(player.page.getByRole('link', { name: 'Ruoli' })).toHaveCount(0);
    await dm.page.goto(`/campaigns/${id}`);
    await expect(dm.page.getByRole('button', { name: 'Esci dalla campagna' })).toHaveCount(0);
    await expect(memberRow(dm.page, /Pedina/)).toHaveCount(0);

    await dm.page.getByLabel(/Confermo: eliminare la campagna/).check();
    await dm.page.getByRole('button', { name: 'Elimina campagna' }).click();
    await expect(dm.page.getByRole('status')).toHaveText('Campagna eliminata.');
    expect((await aide.page.goto(`/campaigns/${id}`))?.status()).toBe(404);
  });

  test('senza accesso l’invito rimanda al login; dati non validi e accessibilità', async ({
    browser,
  }) => {
    const anon = await (await browser.newContext({ locale: 'it-IT' })).newPage();
    await anon.goto(`/invite/${'b'.repeat(64)}`);
    await expect(anon).toHaveURL(/\/login\?next=%2Finvite%2F/);

    const dm = await newUser(browser, 'Direttrice');
    const id = await createCampaign(dm.page, 'Controlli');
    await dm.page.goto(`/campaigns/${id}`);
    // Il browser bloccherebbe il valore fuori scala: si toglie il limite per provare il controllo del server.
    await dm.page.locator('#invite-days').evaluate((el: HTMLInputElement) => {
      el.max = '';
      el.value = '91';
    });
    await dm.page.getByRole('button', { name: 'Crea invito' }).click();
    await expect(dm.page.locator('p[role="alert"]')).toContainText('Controlla l’invito');

    await makeInvite(dm.page, id, { role: 'observer' });
    const serious = (await new AxeBuilder({ page: dm.page }).analyze()).violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });
});
