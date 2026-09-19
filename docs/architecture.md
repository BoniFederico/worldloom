# Architettura

Stato: scaffold iniziale. Questo documento cresce con le funzionalità.

## Componenti

- **Web app**: Next.js (App Router), TypeScript strict, React Server Components dove possibile.
- **Dati**: Supabase (Postgres con RLS, Auth, Storage, Realtime). Schema gestito da migrazioni SQL versionate.
- **Hosting**: Vercel per l'app (preview per PR), Supabase per i dati.

## Principi

- **Nessun concetto cablato**: categorie, campi, statistiche e tipi di relazione sono dati configurabili dall'utente.
- **Sicurezza a livello dati**: l'isolamento per mondo e la visibilità per elemento (segreto/condiviso/pubblico) sono imposti da
  RLS e da funzioni lato server; ricerca, grafo, mappe ed export leggono attraverso le stesse regole. Nessun filtraggio solo client.
- **Confini validati**: input validato ai confini del sistema; rich text sanificato.
- **Design**: solo token da `docs/design-system.md`.

## Struttura del repo

- `src/app`: route, layout, API (`/api/health`).
- `src/lib`: logica di dominio pura, testata con Vitest (coverage ≥ 80%).
- `e2e`: test Playwright (flussi, axe; screenshot su Linux).
- `docs`: piano, decisioni, linee guida, design system.

## Qualità

Pre-commit: lint-staged. commit-msg: commitlint. CI (`ci`): lint, typecheck, test, build, e2e. CodeQL e release-please attivi.

## Schema dati e sicurezza (migrazione `20260919120000_core_schema`)

- Tabelle: `profiles`, `worlds`, `world_members`, `categories`, `snippets`, `snippet_categories`, `relations`. Campi
  personalizzati e corpo in `jsonb`; la validazione tipizzata dei campi vive nel livello applicativo (issue #14).
- **Isolamento per mondo nel dato**: chiavi esterne composite `(world_id, id)` rendono impossibile collegare snippet,
  categorie o relazioni di mondi diversi. RLS attiva su tutte le tabelle.
- **Ruoli**: `owner` (uno solo per mondo, indice univoco), `editor`, `commenter`, `reader`. Solo il proprietario gestisce i membri
  e non può creare altri proprietari. Le funzioni di autorizzazione stanno nello schema `private` (non esposto come API).
- **Visibilità** (`secret`/`shared`/`members`/`public`) su snippet e relazioni, valutata da `private.can_read`. `shared`
  (giocatori scelti) resta chiusa ai non-editor fino a #32. Una relazione è leggibile solo se lo sono anche i suoi estremi.
- Cestino: `deleted_at` valorizzato nasconde lo snippet a chi non può scrivere.
- **Test**: `npm run test:db` esegue `db-tests/` contro Postgres reale (`DATABASE_URL`, default Supabase locale), simulando
  `anon`/`authenticated` con claim JWT. Copre casi negativi: cross-mondo, escalation di ruolo, IDOR, segreti al lettore.

## Autenticazione

Supabase Auth via `@supabase/ssr`: sessione in cookie, rinnovata da `src/proxy.ts`. Server action in
`src/app/auth/actions.ts`, callback PKCE in `src/app/auth/callback`. Le pagine `/login`, `/signup`, `/forgot-password`,
`/reset-password` funzionano senza JavaScript; `/account` è protetta. Le email locali si leggono su Mailpit
(http://127.0.0.1:54324). Gli e2e usano sempre il Supabase locale (`playwright.config.ts`). Dettagli in D-010.
