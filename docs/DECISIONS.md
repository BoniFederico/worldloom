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

### D-016: Immagini dei mondi su Supabase Storage

- Data: 2026-09-20
- Contesto: #15, immagini nel testo. Serviranno anche a mappe e campi immagine (#28).
- Decisione: bucket privato `world-images` (5 MB, solo PNG/JPEG/WebP/GIF), percorso `<world_id>/<uuid>.<ext>`. Le policy su
  `storage.objects` dicono: scrive chi può scrivere nel mondo, legge chi è membro; il nome deve avere esattamente quel formato.
  Il caricamento passa da `POST /worlds/[id]/images`, che decide il tipo dai byte iniziali (mai da nome o Content-Type) e rifiuta
  SVG e tutto il resto; la lettura da `GET /worlds/[id]/images/[file]`, con la sessione dell'utente (un estraneo riceve 404) e
  intestazioni `nosniff` + `sandbox`. Nel documento l'immagine è un nodo con `src` interno a whitelist: URL esterni e `data:` sono scartati
  dalla sanificazione, e le immagini incollate da altri siti non entrano nell'editor.
- Garanzie e limiti (dalla review): il rifiuto di SVG e di tutto ciò che non è un'immagine vale per la rotta di caricamento; chi ha
  un JWT da editor può anche scrivere direttamente sull'API Storage (il bucket controlla solo dimensione e MIME dichiarato), ma la
  lettura passa dalla rotta, che forza tipo, `nosniff` e `sandbox`. **La lettura non tiene conto della visibilità degli snippet**: un
  lettore può scaricare (o elencare, via Storage) le immagini di uno snippet a lui nascosto. Da chiudere con #32, legando l'immagine
  allo snippet. Limite di 4 MiB (sotto i 4,5 MB delle funzioni Vercel). Cache privata di un'ora: una revoca non è immediata.
- Limiti noti: nessuna eliminazione dei file orfani né miniature (arriveranno con la gestione dello spazio); la visibilità
  pubblica delle immagini (wiki, #42) richiederà di rivedere la lettura, oggi solo per i membri.
- Deciso da: agente

### D-017: Relazioni: validità nel tempo, inversa riusata, tipi in una PR a parte

- Data: 2026-09-20
- Contesto: #17. La SPEC vuole etichetta libera e inversa, note, intervallo di validità e tipi di relazione con vincoli.
- Decisione: la validità è `{calendar, year, month?, day?}` con `calendar = 'default'` finché non esistono i calendari (#26, che
  li mapperà); l'anno è obbligatorio, il giorno richiede il mese, la fine non precede l'inizio (controllato da app e da CHECK).
  Senza etichetta inversa si riusa l'ultima associata alla stessa etichetta nel mondo. Un doppione (stessa coppia e stessa
  etichetta, senza badare alle maiuscole) è rifiutato da un indice unico. In ingresso senza inversa si mostra l'etichetta
  originale con la frase rovesciata («Aragorn alleato di questo snippet»).
- **Tipi di relazione** (`relation_types`): etichetta unica per mondo, inversa e, facoltativamente, categoria di origine e di destinazione.
  Se l'etichetta di una relazione coincide con quella di un tipo (senza badare alle maiuscole) valgono i suoi vincoli, applicati da
  un trigger (quindi anche a chi scrive via API) che fornisce anche l'inversa se manca; le etichette senza tipo restano libere. I vincoli
  si controllano quando la relazione viene scritta: cambiare in seguito le categorie di uno snippet non tocca le relazioni esistenti.
  Eliminando una categoria il relativo vincolo decade, il tipo resta.
- Deciso da: agente

### D-018: Menzioni (@) come relazioni

- Data: 2026-09-20
- Contesto: #18. La SPEC dice «menzione = relazione», con alias riconosciuti e backlink.
- Decisione: `@` nell'editor propone gli snippet per titolo e alias (l'alias trovato è indicato); la menzione è un nodo `mention`
  che nel database contiene **solo l'id** (il titolo non si salva mai: rivelerebbe a chi legge anche uno snippet che non può vedere;
  editor e lettura lo risolvono con i permessi di chi guarda, altrimenti «snippet non disponibile»). Al salvataggio (completo o automatico) il database sincronizza le relazioni: per ogni snippet menzionato una
  relazione «menziona» (inversa «menzionato in») marcata `from_mention`; se la menzione sparisce dal testo, sparisce anche quella
  relazione. Le relazioni fatte a mano non si toccano, e quelle da menzione non sono soggette ai vincoli dei tipi. Si ignorano
  se stessi, snippet di altri mondi e snippet nel cestino. I backlink («Menzionato in») sono le relazioni `from_mention` in ingresso;
  il pannello relazioni le esclude per non duplicarle. La lettura mostra il titolo attuale dello snippet citato.
- Difese: `from_mention` è valido solo con le etichette fisse «menziona»/«menzionato in» e non si cambia dopo la creazione (niente
  scorciatoie per aggirare i vincoli dei tipi via API); al massimo 200 menzioni per documento (rifiutato in scrittura, mai troncato);
  duplicare uno snippet ricrea le sue relazioni da menzione.
- Limiti noti: la relazione da menzione ha la visibilità di default (`members`) indipendentemente da quella degli estremi, quindi
  un backlink tra due snippet pubblici non è visibile agli anonimi; ripristinare dal cestino uno snippet citato non ricrea la
  relazione finché il testo non viene risalvato; oltre 500 snippet i menzionabili sono i primi 500 per titolo (poi la ricerca, #19).
- Alias: si riconoscono nei suggerimenti di `@`; non c'è (ancora) il collegamento automatico del testo libero agli alias.
- Le etichette «menziona»/«menzionato in» sono salvate in italiano: le viste (#25) dovranno localizzarle usando `from_mention`.
- Elenco dei menzionabili: caricato alla prima `@` (fino a 500 snippet) e filtrato in locale; oltre, lo sostituisce la ricerca (#19).
- Nota tecnica: gli `attrs` di ProseMirror non sono oggetti semplici e la serializzazione delle server action li sostituiva con un
  segnaposto; il documento inviato dall'editor è quindi una copia via JSON.
- Deciso da: agente

### D-019: Ricerca full-text in Postgres, con la visibilità nella RLS

- Data: 2026-09-20
- Contesto: #19. La SPEC chiede ricerca istantanea (< 200 ms con 5.000 snippet), filtri per categoria, tag, campi e relazioni,
  Ctrl/Cmd+K, e che la visibilità sia decisa lato server.
- Decisione: `snippets.search` (tsvector) e `body_text` sono mantenuti da un trigger: titolo e alias peso A, tag B, testo C
  (i nodi `text` del documento; le menzioni non hanno testo, quindi non indicizzano titoli altrui). Configurazione
  `simple_unaccent`: senza badare a maiuscole e accenti, nessuno stemming (l'app è multilingua it/en). Le parole cercate diventano
  prefissi (`eda` trova «Edaline»); dal testo dell'utente arrivano alla query solo lettere e cifre, quindi nessun operatore.
  `search_snippets` è `security invoker`: gira con i permessi di chi chiama e la RLS di `snippets` decide cosa si vede (segreti e
  condivisi restano chiusi ai non scrittori); il filtro per relazione passa dalla RLS delle relazioni, quindi non rivela
  relazioni verso snippet non leggibili. Estratti con marcatori `<<…>>` che l'interfaccia trasforma in `<mark>` (mai HTML).
- Prestazioni: la policy `snippets_read` chiamava `private.can_read` una volta per riga e, non essendo `@@` «leakproof», Postgres
  la valutava su tutte le righe del mondo prima di usare l'indice (3.000 snippet ≈ 200 ms). Riscritta con sottoquery non correlate
  (`private.member_worlds()` / `writer_worlds()`, valutate una volta per query), stessa semantica verificata dai test RLS:
  ora 40–90 ms su 3.000 snippet, con test di regressione (soglia 200 ms) e verifica dell'uso dell'indice GIN.
- Interfaccia: pagina `/worlds/[id]/search` (GET, funziona senza JavaScript) con filtri; comando rapido nel layout del mondo
  (`<dialog>` modale, combobox/listbox, Ctrl/Cmd+K, voce «ricerca completa»).
- Limiti noti: i filtri sui campi sono per uguaglianza di testo (non intervalli); i valori dei campi non sono indicizzati nel testo;
  i risultati sono al massimo 50 (30 nell'API per default), senza paginazione; l'alias trovato nelle menzioni (`@`) usa ancora
  l'elenco locale (#18) e non questa ricerca.
- Deciso da: agente

### D-020: Cronologia versioni con fusione delle modifiche ravvicinate

- Data: 2026-09-20
- Contesto: #20. Il salvataggio automatico scatta ogni 1,5 s di pausa: una versione per ogni salvataggio riempirebbe la cronologia di rumore.
- Decisione: `snippet_versions` è scritta solo da un trigger (`security definer`) che, quando cambiano titolo, testo, campi, tag, alias o stato,
  registra una versione; se l'ultima è dello stesso autore, ha meno di 10 minuti e non è un ripristino, la aggiorna invece di crearne una nuova.
  Si conservano le ultime 100 versioni per snippet. Archivio, cestino e visibilità non creano versioni. Nessuno scrive né cancella
  direttamente; la lettura è solo di chi può scrivere nel mondo (i lettori non vedono contenuti precedenti, che potrebbero essere segreti).
- Ripristino: `restore_snippet_version(snippet, versione, updated_at)` (security invoker, condizionata a `updated_at` come il salvataggio) riporta
  il contenuto e registra una nuova versione con `restored_from`; il ripristino non si fonde mai. Il confronto è con la versione precedente
  (righe del testo, tag, alias, campi, titolo, stato).
- Limiti noti: le categorie e le relazioni non fanno parte della versione (il ripristino invece riallinea le relazioni da menzione, ricavando gli id dal documento lato server); dopo un ripristino le categorie restano quelle attuali; le menzioni nel confronto non mostrano il titolo;
  le versioni sono cancellate con lo snippet.
- Deciso da: agente

### D-021: Export/import JSON del mondo (formato v1)

- Data: 2026-09-21
- Contesto: #21. L'export deve rispettare i permessi e il round trip deve essere identico.
- Decisione: formato `worldloom.world` v1 documentato in `docs/export-format.md`. L'export legge con la sessione dell'utente (la RLS
  filtra), senza id né date di esportazione, con riferimenti ordinali e chiavi jsonb in ordine alfabetico (Postgres le riordina: scoperto
  dal test e2e del round trip). L'import è un `POST` multipart a `/api/worlds/import` (controllo Origin, tetto di 4 MB con lunghezza
  dichiarata) che crea un mondo nuovo, valida con zod, sanifica i corpi con `validateBody` e in caso di errore elimina il mondo creato.
- Dalla review: tipi di relazione inseriti dopo le relazioni (mondi validi restano reimportabili); immagini scartate in importazione;
  `fields` ≤ 100.000 caratteri; `contentTemplate` solo nullo; pulizia in `try/catch` con log. Nessun limite di importazioni per utente
  (rischio di costo/DB accettato per ora; da rivedere in #46 insieme al rate limiting).
- Limiti: non atomico lato database (compensazione con eliminazione del mondo); cestino, cronologia, membri, immagini escluse.
  L'export Markdown e l'import da Markdown/Obsidian/CSV restano in #43.
- Deciso da: agente

### D-022: Seed di demo e dati sintetici in SQL

- Data: 2026-09-21
- Contesto: #22. Serve un mondo di esempio, un login demo e dati per le prove di prestazione (5.000 snippet, 20.000 relazioni).
- Decisione: tutto in `supabase/seed.sql` (SQL puro, ids deterministici, `generate_series`), quindi `supabase db reset` popola tutto in circa
  30 s. Utente demo `demo@worldloom.test` / `Demo-Worldloom-1` (solo sviluppo locale: password pubblica, il seed non gira mai su cloud, dove si usa
  `db push`). Il seed è rieseguibile e verificato da un test DB che lo esegue in una transazione annullata (dati, proprietà, coerenza delle menzioni,
  ricerca < 200 ms sui 5.000 snippet) e da un e2e di login demo. La campagna di esempio arriverà con le campagne (#31).
- Dalla review: il seed si interrompe (`raise exception`) se il segreto JWT del database non è quello di default di Supabase CLI, quindi anche
  `db push --include-seed` o `db reset --linked` su un progetto cloud non creano l'utente demo (test incluso); la ricerca è misurata come
  mediana di 5 esecuzioni (< 300 ms). Non lanciare `test:db` ed e2e insieme in locale: il seed dei test blocca le righe demo durante la transazione.
- Deciso da: agente

### D-023: Viste salvate (modello, condivisione, link stabile)

- Data: 2026-09-21
- Contesto: #23. Una vista è «filtri + tipo + configurazione» (SPEC); i tipi grafici arrivano nelle issue #24–#30.
- Decisione: tabella `saved_views` (`kind` fra list/table/graph/timeline/map/tree/kanban, `filters` e `config` jsonb ≤ 10.000 caratteri,
  `shared`). Il link stabile è `/worlds/<mondo>/views/<id>`. Una vista salva **cosa** mostrare, mai i dati: i risultati si calcolano a ogni
  apertura con la sessione di chi guarda, quindi condividere una vista non può rivelare contenuti che il destinatario non può leggere
  (regola SPEC su viste ed export). `shared` = visibile a tutti i membri del mondo, altrimenti solo a chi l'ha creata; la crea chi può
  scrivere (owner/editor); la modificano ed eliminano il creatore e il proprietario; `world_id`, `created_by` e `kind` sono immutabili.
  `anon` non ha alcun permesso sulla tabella. Oggi è renderizzato il tipo `list` (i filtri della ricerca full-text di D-019, salvati con
  `filtersOf`/`paramsOfFilters`: i filtri letti dal database passano dallo stesso parsing e limiti della query string); gli altri tipi
  mostrano «disponibile presto» finché non arriva il loro renderer, che leggerà `config` con un proprio schema zod.
- Dalla review: la condivisione (`shared`) la cambia solo il creatore; il proprietario può rinominare o eliminare la vista di un altro ma non
  renderla privata (non la vedrebbe più e la RLS rifiuterebbe l'aggiornamento): il form non mostra la casella e l'azione aggiorna solo il nome.
- Limiti noti: nessuna vista personale per chi non scrive (lettori e commentatori); il proprietario non vede le viste private altrui
  (può però eliminarle); il nome di una vista condivisa è visibile a tutti i membri anche se i suoi risultati non lo sono.
- Deciso da: agente

### D-024: Vista tabella

- Data: 2026-09-21
- Contesto: #24. Colonne dai campi, ordinamento, filtri, raggruppamenti, viste salvate, accessibile da tastiera.
- Decisione: pagina `/worlds/<id>/table` (form GET, funziona senza JavaScript) e tipo di vista `table` in `saved_views` (D-023): `filters` come nella
  ricerca e `config` = `{columns, sort:{by,dir}, group}` validato da `parseTableConfig` (colonne fisse `title|status|tags|categories|updated` o
  `field:<chiave>`, al massimo 12, il titolo c'è sempre; ogni input ostile ricade sui valori predefiniti). I dati si leggono direttamente da
  `snippets` con la sessione dell'utente (RLS), fino a 500 righe (con avviso se ce ne sono altre); `search_snippets` non serve perché limita a 100.
  Filtri supportati: categoria, tag, stato, valore di un campo (uguaglianza senza badare alle maiuscole, `ilike` con caratteri speciali
  neutralizzati) e archivio; la ricerca nel testo e il filtro per relazione restano nella pagina di ricerca. Ordinamento e raggruppamento sono
  funzioni pure (`sortRows`, `groupRows`): i numeri si ordinano come numeri, i vuoti vanno sempre in fondo, a parità vale il titolo; per
  categoria uno snippet compare in ogni sua categoria.
- Accessibilità: `<table>` reale con didascalia, `scope`, `aria-sort`, intestazioni ordinabili come link (Tab + Invio, senza JavaScript), regione
  scorrevole focalizzabile. Sulla vista salvata l'ordinamento dalle intestazioni vale solo per la visita (non modifica la vista).
- Dalla review: le date del calendario si ordinano (e si raggruppano) in ordine cronologico, non per giorno; un `sort` non valido su una vista
  salvata non ne sostituisce l'ordinamento. Oltre le 500 righe la tabella contiene le 500 più recenti (per `updated_at`) e ordinamento e
  raggruppamento lavorano solo su quelle.
- Limiti: niente paginazione oltre le 500 righe; nessuna modifica in-cell; ordinamento per data «calendario personalizzato» (#26) da rifinire.
- Deciso da: agente

### D-025: Vista grafo (SVG sul server, dati da una funzione SQL)

- Data: 2026-09-21
- Contesto: #25. Filtri per categoria ed etichetta, profondità dal nodo, fluidità con 5.000 nodi e 20.000 relazioni, alternativa tabellare accessibile.
- Decisione: `public.graph_data(mondo, centro, profondità, etichetta, categoria, menzioni, max nodi)` (security invoker: la RLS decide cosa si
  vede, quindi uno snippet segreto non compare a un lettore né con le sue relazioni) restituisce nodi e archi già ridotti. Senza centro sceglie
  gli snippet con più relazioni; con un centro, i nodi entro 0–4 passi (relazioni in entrambe le direzioni, ricerca ricorsiva). Tetto di 300
  nodi (500 in SQL) con avviso di troncamento: il disegno resta leggibile e la risposta veloce (verificato sui dati di prova: test DB < 1,5 s).
  Il disegno è un `<svg>` prodotto sul server con un layout a forze deterministico (Fruchterman–Reingold con repulsione a raggio finito, area
  proporzionale a √nodi, nessun elemento casuale): nessuna libreria di grafi nel browser (SPEC: viste curate, coerenti col design system).
  Ogni nodo è un link che ricentra il grafo (Tab + Invio, senza JavaScript); l'alternativa accessibile è una tabella di tutte le relazioni con
  link agli snippet (più gli snippet senza relazioni visibili). Etichetta e categoria filtrano come nella ricerca (l'etichetta anche
  nella forma inversa, senza badare alle maiuscole); le relazioni da menzione si possono nascondere.
- Viste salvate: tipo `graph` con `config` `{center, depth, label, category, mentions}` passato da `parseGraphConfig` (stessi limiti della query
  string); ricentrare da una vista salvata apre il grafo libero senza modificarla.
- Dalla review: gli archi sono al massimo 2.000 (`edges_truncated`, con avviso); gli snippet nel cestino non sono nodi e non fanno da ponte
  nella ricerca dal centro né contano nel grado; ordinamento degli archi totale (deterministico).
- Limiti: niente zoom/pan interattivo né trascinamento dei nodi (il browser può ingrandire l'SVG; sopra i 300 nodi bisogna restringere o
  scegliere un centro); il layout si ricalcola a ogni richiesta (O(iterazioni × nodi²), < 100 ms a 300 nodi); il filtro per categoria toglie
  anche i nodi intermedi di altre categorie (il vicinato è calcolato prima del filtro).
- Deciso da: agente

### D-026: Calendari personalizzati

- Data: 2026-09-21
- Contesto: #26. Mesi, giorni, ere e anni definiti dall'utente, campo data in calendario custom, conversione testata; base per la timeline (#27).
- Decisione: tabella `calendars` per mondo (nome univoco senza badare alle maiuscole, `definition` jsonb validato dall'app con zod; RLS: leggono i
  membri, scrivono proprietari ed editor). Modello (`src/lib/calendars/calendar.ts`): mesi (nome, giorni), giorni della settimana facoltativi, ere
  (nome, anno di inizio) e un solo anno «lungo» periodico (ogni N anni un mese ha giorni in più; multipli di N, anno 0 compreso). Le date sono
  terne {anno, mese, giorno} con anno **assoluto** intero (esiste l'anno 0, i negativi sono «prima»); il numero di giorno dall'origine
  (anno 0, mese 1, giorno 1) è la base per ordinare e confrontare, in forma chiusa per gli anni lunghi (con una correzione di uno o due anni sulla stima). Le ere sono etichette: l'anno
  nell'era si conta da 1 (`anno assoluto = inizio + anno − 1`). Il valore del campo `calendar_date` è
  `{calendar: <id>, year, month, day, era?}`; l'era è solo per la lettura.
- Editor: nella pagina dello snippet il campo ha calendario (se ce n'è più d'uno), era, anno, mese (scelta tra quelli del calendario) e giorno;
  i campi vuoti cancellano la data; un giorno inesistente o un calendario di un altro mondo diventa `{invalid: true}` e il salvataggio
  segnala l'errore mantenendo quanto digitato. La gestione dei calendari è a testo (una riga per mese o era: «nome, numero») perché funziona
  senza JavaScript ed è esportabile a mano.
- Se un calendario viene eliminato le date restano nello snippet (si mostrano in forma numerica) e non blocca i salvataggi: i campi vuoti non le cancellano. Un campo obbligatorio di questo tipo non blocca lo stato definitivo finché il mondo non ha calendari.
- Modificare un calendario non riscrive le date già salvate: se un mese o un giorno non esiste più, il salvataggio dello snippet segnala l'errore e la data va rivista. L'anno nell'era deve essere ≥ 1.
- Limiti: un solo anno lungo per calendario (niente regole tipo «ogni 100 anni no»); niente mesi intercalari o settimane a lunghezza variabile;
  l'export/import JSON non porta ancora i calendari (i valori data importati restano nello snippet ma puntano a un calendario che non
  esiste nel nuovo mondo); la tabella (#24) non ordina ancora per questo tipo di campo (lo farà la timeline con il numero di giorno).
- Deciso da: agente

### D-027: Vista timeline

- Data: 2026-09-21
- Contesto: #27. Corsie per categoria o tag, eventi puntuali e a intervallo, zoom, filtri, alternativa testuale; usa i calendari di D-026.
- Decisione: pagina `/worlds/<id>/timeline` (form GET, funziona senza JavaScript) e tipo di vista `timeline` in `saved_views` (D-023) con
  `config` `{calendar, start, end, lane, category, tag, related, zoom, center}` passato da `parseTimelineConfig`. Gli eventi sono gli snippet
  con un campo «data in calendario» di **inizio** e, se scelto, un secondo campo di **fine** (intervallo); una fine prima dell'inizio o non
  valida rende l'evento puntuale. Si mostra un calendario alla volta (le date in altri calendari non si possono confrontare: sono contate
  e segnalate). Il disegno è un `<svg>` prodotto sul server (nessuna libreria nel browser): la disposizione (`src/lib/timeline/layout.ts`,
  pura e testata) calcola finestra, tacche della scala, corsie e righe senza sovrapposizioni.
- Zoom: il livello 0 mostra tutti gli eventi con un margine del 5%; ogni livello (fino a 8) dimezza la finestra (minimo 10 giorni) attorno a un
  centro (numero di giorno). Zoom e spostamento sono link normali (`?zoom=&center=`), quindi funzionano da tastiera e senza JavaScript; gli
  eventi fuori finestra sono contati e restano nella tabella. Scala: tacche in anni (passo 1-2-5×10^k), poi mesi (fino a ~45 giorni di finestra
  in su), poi giorni; gli anni mostrano l'era (D-026).
- Corsie: per categoria (la prima in ordine alfabetico; «senza categoria» in fondo) o per tag (l'evento compare in ogni sua corsia); al massimo
  30 corsie. Filtri: categoria, tag e «collegato a» (titolo di uno snippet: mostra lui e gli snippet legati da una relazione, in entrambi i versi).
- Permessi: i dati si leggono con la sessione di chi guarda (RLS): uno snippet segreto non compare a un lettore, né in una vista condivisa.
- Alternativa accessibile: tabella cronologica ordinata per numero di giorno (non per testo) con inizio, fine e corsia; ogni evento del disegno è
  un link con etichetta parlante ("titolo, da … a …").
- Limiti: al massimo 500 eventi (avviso); «collegato a» considera al massimo 150 snippet (lui e i primi collegati); un solo campo di inizio e uno di fine per volta; niente trascinamento né zoom con la rotella; le relazioni
  con intervallo di validità (`valid_from/valid_to`) non sono ancora eventi; le etichette non evitano ogni sovrapposizione tra corsie vicine.
- Deciso da: agente

### D-028: Mappe, pin e percorsi

- Data: 2026-09-21
- Contesto: #28. Immagini di mappa (anche più livelli), pin sugli snippet-luogo, mappe annidate, percorsi, nessun servizio a pagamento.
- Decisione: tre tabelle (`maps`, `map_pins`, `map_routes`) con RLS: leggono i membri, scrivono proprietari ed editor. Le immagini usano il bucket
  `world-images` di D-016; la mappa conserva solo il nome del file (formato controllato dal database). Il caricamento passa da un modulo che
  fa POST a `/worlds/<id>/maps/upload` (funziona senza JavaScript) e riusa i controlli delle immagini degli snippet, ora in
  `src/lib/images/upload.ts`: Origin, lunghezza dichiarata, tipo dai byte (niente SVG), nome casuale. I pin usano coordinate **relative** (0–1 sui due
  assi: valgono a qualunque dimensione) e non il campo `coordinates` degli snippet, perché uno stesso luogo può comparire su più mappe. Una mappa
  può «raffigurare» uno snippet-luogo (`maps.snippet_id`): un pin su quel luogo, da qualunque altra mappa, apre la sua mappa (mappe annidate
  regione → città → dungeon); altrimenti apre lo snippet. Un percorso è un elenco ordinato da 2 a 30 pin della stessa mappa (controllato da un trigger);
  eliminare un pin lo toglie dai percorsi e un percorso che resta con meno di 2 tappe sparisce.
- Permessi: un pin si legge solo se si legge lo snippet (la policy interroga `snippets` con la RLS di chi legge): un luogo segreto non compare a un
  lettore né come pin né nella tabella. Anche una mappa che raffigura un luogo nascosto e un percorso con una tappa nascosta non si
  vedono (policy di lettura; dalla review). Gli snippet nel cestino non compaiono.
- Interfaccia: l'immagine con i pin come link sovrapposti in percentuale e i percorsi in un SVG sopra, senza librerie; tabella alternativa dei pin
  (posizione, mappa collegata) e elenco dei percorsi con le tappe. Per chi scrive, un clic sulla mappa compila la posizione del nuovo pin
  (le percentuali si scrivono anche a mano: alternativa da tastiera e senza JavaScript). Filtro per categoria dei pin.
- Limiti: il filtro per **periodo** della SPEC non c'è (i pin non hanno date); niente spostamento dei pin (si tolgono e si rimettono), rinomina
  della mappa né zoom/pan dell'immagine (il browser può ingrandire); fino a 8 tappe nel modulo del percorso; niente eliminazione dei file
  inutilizzati (come D-016); le mappe non sono ancora nell'export JSON né nelle viste salvate; la lettura dell'immagine resta per tutti i membri (D-016).
- Deciso da: agente

### D-029: Albero genealogico e gerarchia da un'etichetta di relazione

- Data: 2026-09-21
- Contesto: #29. Una gerarchia generata da un'etichetta scelta dall'utente, con gestione dei cicli e alternativa testuale.
- Decisione: pagina `/worlds/<id>/tree` (form GET, senza JavaScript) e tipo di vista `tree` in `saved_views` (D-023) con `config`
  `{label, dir, root}`. Una relazione «A padre di B» mette A sopra B; l'etichetta si cerca sia come etichetta sia come inversa (una relazione
  «B figlio di A» con inversa «padre di» dà lo stesso albero), senza badare a maiuscole e spazi. Le relazioni da menzione sono escluse. Si può partire da
  uno snippet (titolo) e scegliere discendenti o antenati (archi invertiti). Nessun dato nella vista: si legge con i permessi di chi guarda (RLS).
- Cicli e più genitori (`src/lib/tree/build.ts`, pura e testata): le radici sono gli snippet senza genitori; un nodo con più genitori è espanso una sola
  volta e le altre volte compare come rimando («già mostrato sopra»); un ciclo si ferma quando torna su un antenato (segnato «ciclo»), quindi il calcolo
  termina sempre; un ciclo senza radice parte dal primo snippet per titolo. L'attraversamento è iterativo (catene lunghe non fanno traboccare lo stack);
  tetto di 500 nodi con avviso.
- Interfaccia e accessibilità: l'albero è una lista annidata (`ul` in `ul`), quindi la struttura è già il testo e un lettore di schermo annuncia i livelli;
  le linee sono decorazione CSS; ogni nome è un link allo snippet. Nessuna libreria.
- Lettura: il servizio taglia in silenzio a 1000 righe per richiesta (`max_rows`), quindi relazioni e titoli si leggono a pagine (`src/lib/supabase/pages.ts`,
  con test oltre le 1000 righe); tetto di 5.000 relazioni per etichetta e per verso e 10.000 titoli, con avviso se le relazioni lo raggiungono. Il confronto
  dell'etichetta ignora le maiuscole e comprime gli spazi multipli scritti nel modulo, ma non normalizza tabulazioni o spazi speciali già salvati; con
  più snippet omonimi come radice si sceglie quello che ha relazioni con l'etichetta; una relazione simmetrica (etichetta uguale all'inversa, come
  «fratello di») forma un ciclo per ogni coppia e va vista come tale. L'ordine alfabetico usa sempre le regole dell'italiano.
- Limiti: una sola etichetta per albero (niente
  alberi misti); niente disegno a nodi e linee orizzontale; la radice si sceglie per titolo esatto, non da un elenco.
- Deciso da: agente

### D-030: Bacheca kanban per stato o campo a scelta

- Data: 2026-09-21
- Contesto: #30. Una bacheca a colonne per trame e bozze, con spostamento accessibile e salvataggio come vista.
- Decisione: pagina `/worlds/<id>/kanban` (form GET) e tipo di vista `kanban` in `saved_views` (D-023) con `config` `{by, category}`. `by` è `status`
  (bozza / definitivo) oppure la chiave di un campo di tipo «scelta» di una categoria. Colonne: «senza valore» in testa, poi le opzioni nell'ordine del
  campo, poi una colonna per ogni valore rimasto orfano (opzione rimossa dopo l'inserimento), non usabile come destinazione. Con un campo entrano solo gli
  snippet di una categoria che lo definisce (se lo stesso campo è in più categorie, le opzioni si uniscono); per lo stato, tutti. Non archiviati né nel cestino.
  Nessun dato nella vista: si legge con i permessi di chi guarda (RLS), quindi gli snippet segreti non compaiono al lettore.
- Spostamento: ogni card ha un modulo «Sposta in» (select + pulsante), che funziona da tastiera, con lettori di schermo e senza JavaScript; il
  trascinamento (`KanbanDnd`, HTML5) è solo un'aggiunta che imposta la destinazione nello stesso modulo e lo invia. La server action `moveCard` usa le
  stesse regole del salvataggio (`planMove`, pura e testata): solo opzioni esistenti; passare a «definitivo» o togliere un valore a uno snippet definitivo
  richiede i campi obbligatori. Scrive con una condizione su `updated_at` (mai sovrascrive una modifica più recente: errore «conflitto»), e passa dalla
  cronologia versioni come ogni modifica. Nessuna migrazione: la RLS di `snippets` già limita l'aggiornamento a chi può scrivere.
- Limiti: al massimo 500 snippet (avviso); la vista salvata è di sola lettura (per spostare si apre la bacheca); il trascinamento non funziona al tocco
  (si usa il modulo); l'ordine nelle colonne è alfabetico, non si ordina a mano; le card non mostrano altri campi.
- Deciso da: agente

### D-031: Campagne, ruoli e inviti

- Data: 2026-09-21
- Contesto: #31. Una campagna con DM, co-DM, giocatori e osservatori, legata a un mondo oppure autonoma, con inviti via link o email.
- Decisione: tabelle `campaigns`, `campaign_members`, `campaign_invites` (migrazione `20260921140000_campaigns.sql`), RLS come per i mondi, con la scrittura dei
  membri solo tramite funzioni `security definer` (che bloccano la riga della campagna, come D-012). Chi crea è il DM (uno solo per campagna, indice univoco,
  non cambia e non esce: elimina la campagna). Il DM assegna co-DM, giocatore, osservatore; il co-DM gestisce (ruolo, rimozione, inviti) solo giocatori e
  osservatori, e solo fra loro: nessuna escalation, nessun invito per DM. Il mondo collegato è facoltativo, deve essere uno di cui si fa parte e lo cambia solo il DM
  (trigger); se il mondo sparisce la campagna diventa autonoma. Chi condivide una campagna vede i nomi profilo degli altri membri.
- Inviti: un link `/invite/<token>` con token di 256 bit generato dal database (il client non lo sceglie né tocca i contatori: privilegi di colonna), validità
  da 1 a 90 giorni e da 1 a 100 usi; con un'email l'invito vale una volta sola e solo per quell'account (confronto senza maiuscole). Il token è una credenziale al portatore:
  lo leggono solo DM e co-DM (il co-DM non vede gli inviti per co-DM). Chi apre il link (serve l'accesso) vede nome e ruolo solo se l'invito vale per lui; ogni motivo di
  non validità (inesistente, scaduto, revocato, esaurito, per un altro account) dà lo stesso messaggio, e l'adesione è un'azione esplicita (POST), mai l'apertura del link.
  Chi è già membro non consuma un uso. Il gruppo D-012 (aggiunta per email senza consenso dei mondi) resta com'è: le campagne usano solo inviti con accettazione.
- Email: l'app non invia email (nessun servizio a pagamento da configurare): «invito via email» significa un invito legato a quell'indirizzo, che il DM consegna copiando il link.
- Rafforzamenti dalla review: l'invito personale vale una volta sola anche dall'API (vincolo), si riscatta solo con un'email confermata, e l'eliminazione di un mondo
  collegato (azione di chiave esterna, che il trigger lascia passare) rende autonoma la campagna di un altro DM.
- Limiti noti: un membro rimosso può rientrare con un link a più usi ancora valido (il DM lo revoca); gli inviti creati da un co-DM retrocesso restano validi finché non
  li si revoca; il token compare anche nell'indirizzo di login (`next`) di chi non ha ancora l'accesso, con validità e revoca a limitarne il rischio; nessun rate limiting
  applicativo su anteprima e adesione (256 bit casuali rendono inutile indovinare il token; il limite di piattaforma arriva con #46); nessun trasferimento del ruolo di DM; i membri di una campagna non ottengono ancora accesso ai contenuti del mondo collegato (arriva con #32, visibilità e rivelazione);
  niente notifiche degli inviti (#37); l'elenco delle campagne non è paginato.
- Deciso da: agente

### D-032: Visibilità per elemento e rivelazione

- Data: 2026-09-21
- Contesto: #32. Quattro livelli (segreto = solo DM, giocatori scelti, tutti i membri, pubblico) su snippet, relazioni, pin e campi; rivelazione registrata e legabile a una
  sessione; nessun dato nascosto deve mai partire dal server. Migrazione `20260921150000_visibility.sql`.
- Chi è il «DM» e chi il «giocatore»: nel mondo, chi scrive (proprietario ed editor) è il lato DM e vede tutto; lettori e commentatori sono i giocatori. Le campagne (D-031) non
  danno ancora accesso ai contenuti del mondo: per condividere con un giocatore, questi deve essere membro del mondo (lettore o commentatore).
- Modello: la lettura la decide la RLS, quindi ricerca, grafo, timeline, mappe, albero, bacheca, tabella ed export (tutti con la sessione di chi guarda) si adeguano da soli.
  `snippets_read` e `relations_read` gestiscono anche `shared` (destinatari in `visibility_shares`, con chiave esterna composita sui membri del mondo: chi esce perde le
  condivisioni; eliminare l'elemento le cancella con un trigger). I pin hanno un livello proprio (`map_pins.visibility`, predefinito «tutti i membri» come prima) oltre al
  vincolo di vedere lo snippet; percorsi e mappe restano nascosti se una tappa lo è.
- Campi: i valori dei campi segreti o condivisi **non stanno in `snippets.fields`** ma in `snippet_restricted_fields` (RLS propria). Un trigger toglie da `fields` ogni chiave
  che ha una riga riservata, quindi nessuna scrittura (salvataggio, ripristino di versione, import) la può far tornare nella colonna pubblica. Le viste che mostrano i valori
  li uniscono con `loadRestricted`/`withRestricted` (con la RLS di chi guarda: il DM li vede tutti, un giocatore solo quelli condivisi con lui): pagina dello snippet, tabella,
  bacheca, export. Un campo non è mai più visibile dello snippet: «tutti i membri» e «pubblico» sono lo stato normale, quindi per i campi i livelli sono segreto, giocatori
  scelti e «come lo snippet».
- Cambi di livello: solo `set_visibility` (security definer, solo chi scrive, atomica, con blocco della riga; un trigger rifiuta ogni scrittura diretta di `visibility` su snippet,
  relazioni e pin, e i valori riservati si aggiornano ma non si cancellano né cambiano livello se non da lì; dalla review): cambia livello, sostituisce i destinatari, sposta il valore del
  campo tra la colonna e la tabella riservata, e scrive `visibility_log` (chi, quando, da/a, destinatari, nota, `session_id` facoltativo, `is_reveal`). È una rivelazione quando
  l'elemento diventa visibile a qualcuno che prima non lo vedeva (anche aggiungere un destinatario). La tabella delle sessioni arriva con #36, che aggiunge la chiave esterna.
  Il registro lo leggono chi scrive e i destinatari di una rivelazione; nessuno lo modifica.
- Immagini (chiude il limite di D-016): un giocatore legge un file solo se è usato da qualcosa che vede (mappa, testo o campo di uno snippet leggibile: `can_read_image`,
  security invoker); altrimenti 404. Chi scrive legge tutto.
- Export/import: `fieldVisibility` per snippet (vedi `docs/export-format.md`); un valore riservato rientra come segreto del nuovo mondo, mai nella colonna pubblica.
- Interfaccia: sezione «Visibilità e rivelazioni» nella pagina dello snippet (livello, giocatori scelti, livello di ogni campo, nota, registro), modulo per ogni relazione e
  per ogni pin; senza JavaScript. Chi non scrive vede i campi leggibili dello snippet in un elenco.
- Modulo dello snippet: i destinatari dello snippet e quelli di ogni campo «giocatori scelti» sono liste separate (mai ereditati: un semplice Salva non allarga l'accesso a un
  campo già condiviso con altri). Le chiamate sono ordinate in modo sicuro: prima si restringono i campi, poi si cambia lo snippet, per ultimo si allargano i campi «come lo snippet»;
  se una chiamata fallisce a metà, resta almeno la restrizione precedente. La nota del registro la leggono anche i destinatari di una rivelazione (lo dice il modulo).
- Limiti: un campo riservato non compare nella timeline né nei filtri
  per valore (le loro query lavorano sulla colonna pubblica: nessuna fuga, ma neanche per il DM); duplicare uno snippet non copia i campi riservati; il ripristino di una
  versione non riporta i campi riservati; la visibilità dei campi non copre le immagini nei campi; il livello «pubblico» prepara la wiki (#42) ma non la pubblica; nessun
  filtro per livello negli elenchi; la sessione si lega solo via API finché non esiste la pagina delle sessioni (#36); `can_read_image` scandisce i testi degli snippet per ogni immagine di un giocatore (risposte con
  cache di un'ora, non misurato su mondi molto grandi); un cambio di livello aggiorna `updated_at` dello snippet (un modulo di modifica già aperto darà «conflitto»); per un campo
  la rivelazione è registrata come tale anche se lo snippet resta segreto; la chiave di un campo non è validata contro le categorie (solo per chi scrive).
- Deciso da: agente

### D-033: Schema di statistiche e interprete di formule (libreria pura)

- Data: 2026-09-21
- Contesto: #33. Base delle schede (#34), della migrazione (#35), del tiratore di dadi (#39) e dell'iniziativa (#40). Nessuna tabella né interfaccia in questa issue: è una
  libreria in `src/lib/stats/` (formato in `docs/stats-schema.md`), quindi nessuna migrazione.
- Decisione: lo schema è un documento JSON `schemaVersion: 1` con `attributes`, `derived`, `resources` (`pool`), `lists`, `text`, `layout`; la forma è validata con Zod
  (`strictObject`: i campi sconosciuti sono errori) e descritta da un JSON Schema draft-07 (`stats.schema.json`), controllato nei test con `ajv` (nuova dipendenza di sviluppo,
  già presente come dipendenza indiretta) sugli stessi preset e sugli stessi errori strutturali. La semantica (chiavi uniche, formule, riferimenti, cicli, layout) sta in `schema.ts`.
- Errori «con riga e campo»: un parser JSON proprio (`json-locate.ts`) registra riga e colonna di ogni valore e di ogni chiave; gli errori portano `code` stabile, `path` (`derived[0].formula`),
  `field`, `line`, `column`, `detail` e, per le formule, `index`. I messaggi per l'utente sono compito dell'interfaccia (catalogo it/en), non del validatore.
- Interprete: nessun `eval`/`Function`. Lexer + parser a precedenze → albero → valutatore con budget (formula ≤ 500 caratteri, 120 nodi, profondità 32, 2.000 passi, 20 ms). Variabili solo dallo
  scope (una `Map`; per un oggetto `Object.hasOwn`), funzioni da un elenco chiuso, booleani 1/0, nessun accesso a globali. Un test di robustezza lancia migliaia di stringhe casuali.
- Visibilità dei nomi: le formule vedono attributi e derivati; le risorse correnti no (evita cicli e dipendenze dallo stato). `<risorsa>_max` è un nome riservato per usi futuri.
  I nomi delle funzioni non sono chiavi valide.
- Un errore di valutazione su una scheda concreta non blocca il resto: quella voce vale `null` e l'errore viene riportato.
- Preset: d20, punteggi a percentuale, pool di dadi, narrativo a tratti (`presets.ts`); ognuno è valido e si calcola senza errori (test).
- Limiti noti: il dado non fa parte delle formule (arriva con il tiratore, #39); niente tipi booleano/scelta tra gli attributi; l'`index` di un errore di formula è nella formula (non
  ricalcolato sulla colonna del JSON quando la stringa contiene escape); nessuna anteprima o interfaccia finché non c'è la scheda (#34).
- Deciso da: agente
