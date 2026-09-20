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

## Tipi del database

`src/lib/supabase/database.types.ts` è generato dallo schema (`npm run db:types`, richiede `npm run db:start`) e va rigenerato a ogni migrazione.
Il client server è tipizzato con `Database`.

## Membri e ruoli

Le funzioni `add_world_member` e `transfer_world_ownership` (migrazione `20260920110000`) sono le sole vie per cercare utenti per email e
passare la proprietà: `security definer`, `search_path` vuoto, eseguibili solo da `authenticated`, con controllo di proprietà interno.
Cambio ruolo, rimozione e uscita usano direttamente le policy RLS di `world_members`.

## Categorie e campi

- **Dominio** in `src/lib/fields/fields.ts` (puro, testato): tipi di campo (`text`, `number`, `date`, `calendar_date`, `choice`,
  `snippet_ref`, `coordinates`, `image`), schema zod delle definizioni e `validateSnippetFields`. I valori di chiavi che nessuna
  categoria definisce vengono **conservati**: cambiare categoria non perde dati. I campi `required` pesano solo per gli snippet
  definitivi. La definizione dei campi sta in `categories.fields_schema` (jsonb), i valori in `snippets.fields`.
- **Preset** (`src/lib/categories/presets.ts`): sette categorie di partenza, tradotte alla creazione nella lingua dell'utente
  (`messages/*.json`, sezione `Presets`); dopo l'importazione sono categorie normali.
- Icone e colori sono cataloghi chiusi (`catalog.ts`); i colori sono token `--cat-*` con contrasto ≥ 4:1 in entrambi i temi.
- Permessi: owner ed editor scrivono, gli altri leggono (RLS, con test DB). Nota: la migrazione `20260920120000` corregge il trigger
  di immutabilità che impediva ogni UPDATE su `categories`.
- **Editor dei campi** (`src/components/fields-editor.tsx`, azioni in `categories/actions.ts`): aggiunta, modifica, riordino e
  rimozione, tutto con form nativi (senza JavaScript). La chiave di un campo (che indicizza i valori negli snippet) e il tipo non
  cambiano mai dopo la creazione; rimuovere un campo non cancella i valori già scritti. Ogni modifica si applica allo stato corrente
  della categoria (read-modify-write con controllo su `updated_at`), quindi due pagine aperte insieme non si sovrascrivono.

## Snippet

- **Corpo**: documento JSON ProseMirror in `snippets.body`, sempre sanificato con allowlist (`src/lib/snippets/body.ts`, D-014).
  Nessun HTML viene salvato o renderizzato.
- **Campi**: il form mostra i campi delle categorie selezionate (`src/lib/snippets/form.ts`); data in calendario, coordinate e
  immagine hanno editor dedicati nelle rispettive viste e qui si conservano. `required` pesa solo per gli snippet definitivi. I
  riferimenti a snippet devono puntare a uno snippet leggibile dello stesso mondo.
- **Salvataggio**: la RPC `save_snippet` aggiorna campi e categorie in un'unica transazione ed è condizionata a `updated_at`: una
  modifica fatta altrove nel frattempo dà `conflict`, senza sovrascrivere. Se il salvataggio non riesce il form (client, `useActionState`)
  ripropone quanto digitato, quindi nulla si perde. Il testo è limitato a 200.000 caratteri; il corpo non cambia se il testo non cambia.
- **Ciclo di vita**: archiviato (`archived_at`, fuori dall'elenco attivo) → cestino (`deleted_at`, visibile solo a chi può scrivere)
  → eliminato dopo 30 giorni (`private.purge_expired_snippets`, pg_cron). L'eliminazione definitiva manuale è possibile solo dal cestino.
- **Editor** (`src/components/rich-editor.tsx`, D-015): Tiptap con salvataggio automatico (`autosaveBody`) e indicatore di stato. Il
  corpo si mostra in sola lettura con `RichText`, che sanifica di nuovo e produce elementi React (mai `innerHTML`).
- **Immagini** (D-016): bucket privato `world-images` con RLS per mondo; rotte `POST /worlds/[id]/images` (verifica dei byte) e
  `GET /worlds/[id]/images/[file]` (solo membri). Nel documento sono nodi `image` con `src` interno a whitelist.
