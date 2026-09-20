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

### D-010: Autenticazione

- Data: 2026-09-19
- Contesto: email+password con verifica e reset, OAuth (SPEC); OAuth separato in #57 perché richiede credenziali.
- Decisione: Supabase Auth con `@supabase/ssr` (cookie di sessione httpOnly, flusso PKCE). Form come server action con
  validazione zod ai confini; errori mappati a codici i18n. Password: min. 10 caratteri con maiuscole, minuscole e cifre
  (allineate in `supabase/config.toml` e `src/lib/auth/schemas.ts`). Verifica email obbligatoria. Registrazione e reset
  danno la stessa risposta per indirizzi noti e ignoti (no enumerazione). `src/proxy.ts` rinnova la sessione e protegge
  `/account`. `?next=` accetta solo percorsi interni. Rate limiting: quello di Supabase Auth (email, accessi, verifiche).
- Motivo / alternative scartate: meno codice e sicurezza gestita da un servizio già scelto (D-002); CSRF coperto dal controllo
  Origin delle server action di Next.
- Deciso da: agente

### D-011: OAuth con GitHub e URL del sito

- Data: 2026-09-20
- Contesto: #57. L'utente ha configurato GitHub OAuth in Supabase cloud; il dominio di produzione è worldloom-lemon.vercel.app.
- Decisione: pulsante "Continua con GitHub" su login e registrazione (`signInWithOAuth`, stesso callback PKCE). Il nome del
  profilo deriva da `display_name`, poi `name`, `user_name`, poi dall'email (migrazione `20260920100000`). L'URL dei link
  di auth è `SITE_URL`; in produzione su Vercel `VERCEL_PROJECT_PRODUCTION_URL` (dominio stabile), in preview `VERCEL_URL`.
- Motivo: `VERCEL_URL` in produzione è l'URL del singolo deploy, non presente nell'allow-list di Supabase.
  Consigliato comunque impostare `SITE_URL=https://worldloom-lemon.vercel.app` su Vercel (Production).
- Deciso da: agente
- Nota di configurazione (da verificare a mano su Supabase → Authentication → URL Configuration): l'allow-list dei Redirect URLs
  deve contenere solo il dominio di produzione e il pattern delle preview del progetto (`worldloom-*-<team>.vercel.app`),
  mai wildcard larghi come `https://*.vercel.app`: chi ha un proprio deploy Vercel riceverebbe il codice OAuth.

### D-012: Aggiunta dei membri per email

- Data: 2026-09-20
- Contesto: #60, membri del mondo. `auth.users` non è leggibile dai client.
- Decisione: il proprietario aggiunge un utente **già registrato** tramite `add_world_member` (security definer, solo proprietario,
  mai il ruolo owner). L'errore `user_not_found` rivela al proprietario se un'email ha un account: accettato perché serve solo a chi
  gestisce il mondo; il proprietario si trasferisce con `transfer_world_ownership`. Gli inviti a chi non ha ancora un account
  (link/email con token) arrivano con le campagne (#31).
- Deciso da: agente
- Rischio residuo accettato (review di sicurezza): `user_not_found` permette a chiunque possa creare un mondo di verificare se
  un'email ha un account, e l'utente viene aggiunto senza consenso. Risposta uniforme non risolverebbe (l'utente comparirebbe
  comunque nell'elenco). Soluzione vera: inviti con accettazione, in #31. Nel frattempo si ricorre al rate limiting di piattaforma.
- Le funzioni bloccano la riga del mondo (`for update`) prima del controllo di proprietà, per evitare autorizzazioni su stato superato.

### D-013: Chiavi dei campi e valori orfani

- Data: 2026-09-20
- Contesto: review di #14. La chiave di un campo indicizza i valori negli snippet e non cambia; rimuovere un campo non cancella i valori.
- Decisione: si può ricreare un campo con la stessa etichetta (stessa chiave): i valori orfani riaffiorano e, se il nuovo tipo non li
  ammette, `validateSnippetFields` li segnala come non validi senza perderli. Nessuna pulizia automatica dei valori alla rimozione.
- Motivo: la SPEC chiede che cambiare categoria «non perda dati»; una pulizia silenziosa sarebbe distruttiva. Valutare uno strumento
  esplicito di pulizia dei valori orfani quando esisteranno gli snippet (#15).
- Deciso da: agente

### D-014: Corpo degli snippet come documento JSON sanificato; #15 in due PR

- Data: 2026-09-20
- Contesto: #15 chiede rich text con sanificazione XSS, salvataggio automatico e cestino a 30 giorni.
- Decisione: il corpo (`snippets.body`, jsonb) è un documento in formato ProseMirror, mai HTML. Ogni scrittura passa da
  `sanitizeBody` (`src/lib/snippets/body.ts`), che ricostruisce il documento con una allowlist di nodi, marcature e attributi;
  i link ammessi sono solo `http(s):`, `mailto:` e percorsi relativi. Il rendering dovrà usare il documento, non `innerHTML`.
- L'editor sarà **Tiptap** (ProseMirror): è la libreria più diffusa, con estensioni per titoli, liste, citazioni, link, immagini,
  tabelle e menzioni (#18). Arriva nella seconda PR di #15, insieme a immagini, tabelle e salvataggio automatico. Questa prima PR
  consegna CRUD, campi tipizzati, duplicazione, archivio e cestino con un campo di testo nativo (funziona senza JavaScript). Il testo
  semplice diventa paragrafi; se il testo non cambia il documento esistente resta intatto, quindi nessuna formattazione si perde.
- Il cestino conserva 30 giorni: `private.purge_expired_snippets()` (schedulata con pg_cron se l'estensione è presente; su un
  database senza pg_cron va chiamata da uno scheduler esterno).
- Deciso da: agente
- Limite noto: finché non c'è l'editor rich text, modificare il testo di uno snippet con formattazione la appiattisce in paragrafi (il documento resta intatto se il testo non cambia). Un writer può scrivere `body` direttamente via API: il rendering deve quindi sanificare di nuovo (`sanitizeBody`) prima di mostrare.

### D-015: Editor Tiptap, salvataggio automatico e immagini in una PR a parte

- Data: 2026-09-20
- Contesto: #15, seconda parte. Dipendenze nuove: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-table` (MIT, ProseMirror).
- Decisione: l'editor è configurato con un sottoinsieme (titoli 1–3, grassetto, corsivo, codice inline, liste, citazione, link, tabelle;
  niente barrato, sottolineato, blocchi di codice, linea orizzontale). Il documento viaggia nel form come JSON e il server lo sanifica
  di nuovo: l'editor non è un confine di sicurezza. I link sono limitati a http, https, mailto e percorsi del sito (`isSafeHref`).
- Salvataggio automatico dopo 1,5 s di pausa, solo del corpo, condizionato a `updated_at`; il token nuovo passa al form, così il
  salvataggio completo non va in conflitto con quello automatico. Le richieste sono serializzate; Salva attende un autosave in corso e usa il token aggiornato. Dopo un conflitto l'autosave resta sospeso (lo dice l'indicatore) finché non si ricarica; un errore transitorio riprova alla modifica successiva. Con modifiche non salvate lasciare la pagina chiede conferma.
- Scrittura del corpo: `validateBody` restituisce il documento sanificato o `null` (input non valido, oltre 500 KB, annidamento oltre 30 livelli, tabelle oltre 200 righe o 30 celle per riga): in quel caso si rifiuta e non si scrive mai un ripiego vuoto, che cancellerebbe il corpo. `sanitizeBody` (lenient) resta per la lettura.
- Senza JavaScript (e prima dell'idratazione) il testo si modifica in un campo semplice, come prima.
- Le **immagini** richiedono Supabase Storage (bucket privato, policy per mondo, verifica del tipo reale dei file, rotta di
  lettura autenticata): arrivano nella terza PR di #15, che chiuderà l'issue.
- Deciso da: agente
