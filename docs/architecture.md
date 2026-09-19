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
