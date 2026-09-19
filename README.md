# Worldloom

SaaS per scrittori, worldbuilder e dungeon master: scrivi snippet con categoria, collegali con relazioni dal nome libero e
guarda lo stesso mondo come timeline, mappa, grafo, albero genealogico o tabella. Sopra il nucleo, un livello campagne con
visibilità per elemento e schede personaggio configurabili.

Specifica: [SPEC.md](SPEC.md) · Piano: [docs/PLAN.md](docs/PLAN.md) · Architettura: [docs/architecture.md](docs/architecture.md) ·
Decisioni: [docs/DECISIONS.md](docs/DECISIONS.md)

## Requisiti

Node LTS (20+), npm. Per lo stack locale completo servirà Docker Desktop (Supabase locale, vedi D-005).

## Comandi

| Comando                               | Cosa fa                                                   |
| ------------------------------------- | --------------------------------------------------------- |
| `npm ci`                              | installa le dipendenze                                    |
| `npm run dev`                         | avvia l'app su http://localhost:3000                      |
| `npm run lint` / `typecheck` / `test` | ESLint + Prettier, TypeScript, Vitest                     |
| `npm run test:db`                     | test di integrazione DB/RLS (richiede `npm run db:start`) |
| `npm run build`                       | build di produzione                                       |
| `npx playwright install chromium`     | una tantum, browser per gli e2e                           |
| `npm run test:e2e`                    | e2e Playwright (build + server su :3100)                  |

Le baseline degli screenshot (test taggati `@screenshot`) si generano solo su Linux: `gh workflow run update-snapshots.yml --ref <branch>`, poi push per rilanciare la CI.

## Flusso di lavoro

Trunk-based: un branch per issue, PR con `Closes #N`, squash merge dopo CI verde. Commit in Conventional Commits.
Configurazione solo da variabili d'ambiente (vedi `.env.example`). Codice non licenziato: tutti i diritti riservati.

## Database locale (Supabase)

Con Docker Desktop attivo: `npm run db:start` avvia Postgres, Auth, Storage e API in locale (API su http://127.0.0.1:54321,
DB su porta 54322). `npm run db:reset` riapplica migrazioni e seed, `npm run db:stop` ferma tutto. Le chiavi locali le stampa
`npx supabase status`; copiale in `.env.local` (mai nel repo). Studio, Mailpit e i servizi di log sono esclusi per risparmiare RAM.
