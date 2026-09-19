---
name: playwright-e2e
description: Use when adding or changing UI in a web project, or when writing/fixing Playwright tests. Covers config, stable selectors, screenshot regression, axe accessibility checks and the Linux-baseline rule.
---

# Playwright e2e per questo kit

## Setup (una volta, in scaffolding)
- `npm i -D @playwright/test @axe-core/playwright` e `npx playwright install chromium`.
- `playwright.config.ts`:
  - `testDir: "e2e"`, `fullyParallel: true`, `retries: process.env.CI ? 2 : 0`, `forbidOnly: !!process.env.CI`;
  - `webServer` che avvia l'app (`npm run dev` o `npm run preview`) con `reuseExistingServer: !process.env.CI`;
  - `use: { baseURL, trace: "on-first-retry", screenshot: "only-on-failure" }`;
  - due progetti: `desktop` (1440x900) e `mobile` (390x844); aggiungi lo schema colore scuro con `colorScheme: "dark"` solo se il tema dark esiste;
  - `expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } }`.
- Script npm: `test:e2e` (`playwright test`), `test:e2e:update` (`playwright test --update-snapshots`).

## Cosa scrivere per ogni schermata/flusso
1. **Flusso**: happy path + almeno un errore (validazione, rete giù, vuoto).
2. **Screenshot**: `await expect(page).toHaveScreenshot("nome.png", { fullPage: true })` a stato stabile (dati fissati, animazioni disabilitate con `animations: "disabled"`, contenuti dinamici mascherati con `mask`).
3. **A11y**:
   ```ts
   import AxeBuilder from "@axe-core/playwright";
   const { violations } = await new AxeBuilder({ page }).analyze();
   expect(violations.filter(v => ["serious", "critical"].includes(v.impact ?? ""))).toEqual([]);
   ```
4. **Tastiera**: il flusso principale è completabile con solo Tab/Enter, e il focus è visibile.

## Regole
- Selettori: `getByRole`, `getByLabel`, `getByText`. Niente CSS/XPath fragili; `data-testid` solo se non c'è alternativa.
- Mai `waitForTimeout`. Usa le asserzioni con auto-wait (`expect(locator).toBeVisible()`).
- Test indipendenti: nessuno stato condiviso, dati creati dentro il test.
- Niente rete esterna reale: `page.route` per mockare.

## Baseline degli screenshot: regola Linux
Le baseline dipendono dal sistema operativo. **Si generano e si committano solo da Linux** (stesso ambiente della CI).
- Su Windows non generare/committare baseline con `--update-snapshots`.
- Genera con Docker: `docker run --rm -v "${PWD}:/work" -w /work mcr.microsoft.com/playwright:v1.<versione>-jammy npx playwright test --update-snapshots` (allinea la versione a quella in `package.json`), oppure in WSL.
- Alternativa senza Docker: workflow CI manuale (`workflow_dispatch`) che esegue `test:e2e:update` e apre una PR con le nuove baseline.
- Se non puoi generare baseline Linux, non aggiungere test `toHaveScreenshot`: apri un'issue `needs-human` e procedi con test di flusso e a11y.

## Revisione visiva
Dopo l'esecuzione, apri gli screenshot generati (`Read` sulle immagini) e confrontali con `docs/design-system.md`: allineamenti, contrasto, gerarchia, stati vuoto/loading/errore. Segnala i difetti prima di aprire la PR.
