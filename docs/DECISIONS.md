# Decisioni

> Una voce per decisione (risposte dell'utente incluse). Non richiedere due volte la stessa cosa.

## Formato

### D-000: Titolo

- Data:
- Contesto:
- Decisione:
- Motivo / alternative scartate:
- Deciso da: utente | agente

## Voci

### D-001: Palette e stile "Cartografo"

- Data: 2026-09-19
- Contesto: la SPEC chiede 2 proposte di palette al kickoff (A "Cartografo", B "Tavolo da gioco").
- Decisione: **A · Cartografo**. Dettagli e token in `docs/design-system.md`.
- Motivo / alternative scartate: tono calmo da atlante moderno, adatto alla scrittura lunga; B (rosso garanza) scartata.
- Deciso da: utente

### D-002: Stack e hosting

- Data: 2026-09-19
- Contesto: stack a libera scelta; hosting con piano gratuito per la demo.
- Decisione: **Next.js (App Router) + TypeScript strict + Supabase** (Postgres, Auth, Storage, Realtime). Hosting app su Vercel
  (preview per PR), dati su Supabase. Isolamento per mondo con Row Level Security. Migrazioni SQL versionate (Supabase CLI),
  tipi generati dallo schema, validazione con Zod, contratto API tipizzato (OpenAPI generato dagli schemi Zod).
  Test unitari Vitest, e2e Playwright, i18n con next-intl (it/en).
- Motivo / alternative scartate: meno codice per auth/storage/realtime, RLS nativa per il requisito di multi-tenancy a livello dati.
  Scartati Neon+Better Auth (più integrazione manuale) e server Node su Fly/Railway (piano gratuito limitato).
- Deciso da: utente (Supabase), agente (dettagli)

### D-003: Licenza

- Data: 2026-09-19
- Contesto: repo pubblico, licenza da scegliere.
- Decisione: **nessuna licenza** (tutti i diritti riservati). Nessun file LICENSE; `"license": "UNLICENSED"` e `private: true` in package.json.
- Motivo / alternative scartate: MIT e AGPL-3.0 scartate dall'utente.
- Deciso da: utente

### D-004: Repository

- Data: 2026-09-19
- Contesto: il remote `origin` esisteva già.
- Decisione: `BoniFederico/worldloom`, pubblico. Eseguito `scripts/setup-repo.sh`: ruleset `main-protection` attivo, solo squash merge, auto-merge.
- Motivo: repo pubblico, quindi ruleset e CodeQL disponibili senza piano a pagamento.
- Deciso da: agente

### D-005: Sviluppo locale con Docker

- Data: 2026-09-19
- Contesto: Docker non è installato sulla macchina di sviluppo; la SPEC richiede l'avvio locale in un comando.
- Decisione: `supabase start` (Supabase CLI, richiede Docker) per lo stack locale, più `docker-compose.yml` se serve per servizi accessori.
  L'utente installa Docker Desktop (issue `needs-human`). Fino ad allora: test unitari di dominio senza DB, test DB in CI
  con Postgres reale (service container).
- Motivo / alternative scartate: PGlite scartato dall'utente come strategia primaria.
- Deciso da: utente

### D-006: Gestore pacchetti e strumenti

- Data: 2026-09-19
- Decisione: **npm** (già usato dalla CI del kit), Node LTS. ESLint (flat config) + Prettier, Vitest, Playwright (Chromium),
  husky + lint-staged + commitlint. Font self-hosted via `next/font` (Source Serif 4, Schibsted Grotesk), icone Lucide.
- Motivo: la CI del kit usa `npm ci`; nessuna ragione per cambiare.
- Deciso da: agente

### D-007: Monetizzazione

- Data: 2026-09-19
- Decisione: nessuna integrazione di pagamento ora (COULD). I limiti d'uso saranno configurazione. Va chiesto all'utente prima di iniziare.
- Deciso da: agente

### D-008: Ordine di sviluppo

- Data: 2026-09-19
- Decisione: infrastruttura (CI, e2e base, DB/RLS, auth) → nucleo snippet/relazioni → viste → campagne/visibilità → SHOULD.
  La visibilità per elemento è progettata in RLS fin dallo schema iniziale, non aggiunta dopo.
- Deciso da: agente

### D-009: i18n senza prefisso di lingua nell'URL

- Data: 2026-09-19
- Contesto: it/en al lancio, link stabili per le viste condivise (SPEC).
- Decisione: next-intl senza routing per locale: la lingua viene dal cookie `locale`, altrimenti da Accept-Language, default `it`.
  Il tema (`system|light|dark`) sta nel cookie `theme` e viene applicato lato server su `<html data-theme>` (nessun flash).
  I selettori sono form con server action, quindi funzionano anche senza JavaScript.
- Motivo / alternative scartate: gli URL delle viste restano identici per tutti i lettori; il prefisso `/it` `/en` sarà
  valutato per la wiki pubblica (SEO, #42).
- Deciso da: agente
