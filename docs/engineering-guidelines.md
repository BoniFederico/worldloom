# Linee guida di ingegneria

## Qualità del codice
- Linter e formatter automatici, eseguiti in pre-commit (husky + lint-staged) e in CI.
- Tipizzazione forte (TypeScript `strict` o equivalente). Niente `any` non motivato.
- Funzioni piccole, nomi espliciti, niente codice morto. Commenti solo per il "perché".
- Dipendenze minime e motivate; nessuna libreria per una funzione di 5 righe.

## Test
- Piramide: molti unit, alcuni integration, pochi ma mirati e2e.
- TDD di default: prima il test che fallisce.
- Ogni bug fixato ha un test di regressione.
- Coverage minima: 80% sulle righe di logica di dominio (non è un obiettivo da gonfiare).
- **Playwright** (se c'è una UI web):
  - flussi critici (happy path + errori);
  - screenshot regression (`toHaveScreenshot`) su mobile 390x844 e desktop 1440x900;
  - accessibilità con `@axe-core/playwright` (zero violazioni serious/critical);
  - selettori per ruolo/label, niente attese fisse, test indipendenti tra loro;
  - baseline generati su Linux in CI, non su Windows.
- Test deterministici: niente dipendenza da rete esterna, orologio o casualità non controllati.

## Git e PR
- Trunk-based: `main` sempre rilasciabile, branch di vita breve, una PR per issue.
- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`).
- PR piccole (indicativamente meno di 400 righe di diff), descrizione con contesto, come è stato testato, `Closes #N`.
- Squash merge, history lineare.

## Documentazione
- `README.md`: cos'è, come installare, avviare, testare, deployare.
- `docs/architecture.md`: componenti, flussi, scelte principali.
- `docs/DECISIONS.md`: una voce (ADR breve) per decisione non ovvia.
- `CHANGELOG.md`: generato da release-please, non a mano.

## Requisiti non funzionali (default, salvo diversa indicazione in SPEC)
- Accessibilità WCAG 2.2 AA.
- Performance web: LCP < 2.5s, CLS < 0.1 su connessione 4G simulata.
- Sicurezza: nessun segreto nel repo, validazione input al confine del sistema, dipendenze aggiornate (Dependabot), CodeQL attivo, header di sicurezza per app web.
- Osservabilità minima: errori loggati con contesto, nessun dato personale nei log.

## Definition of Done
Vedi `CLAUDE.md`.
