# Piano di sviluppo

> Mantenuto dall'agente. Rispecchia le issue GitHub. Aggiornalo a ogni task chiuso.

## Stato

- Fase: M1 completata (#15–#22); M2 in corso: #23–#30 chiuse (viste salvate, tabella, grafo, calendari, timeline, mappe, albero, kanban); M3: #31–#41 chiuse (campagne e inviti, visibilità e rivelazione, statistiche, schede, migrazione, sessioni/diario/bacheca, notifiche in-app, collaborazione in tempo reale, tiratore di dadi, tracker di iniziativa, controllo di coerenza); M4 in corso: #42 chiusa (wiki pubblica del mondo); #43 chiusa (import da Markdown/Obsidian/CSV, D-043; modelli condivisibili, D-046); #44 chiusa (GDPR); #45 parziale (log strutturati e tracciamento errori fatti, D-045; backup rimandato per scelta dell'utente); #100 chiusa (export Markdown come archivio ZIP, D-047); #46 chiusa (CSP, budget LCP, D-048); #47 chiusa (guida utente, primo rilascio v1.0.0, D-049). Backlog M1–M5 esaurito salvo #45 (backup, rimandato) e #94 (needs-human). M6 aperto: restyling front-end (#108–#113, D-050), richiesto dall'utente dopo v1.0.0.

## Backlog (in ordine di esecuzione)

Dipendenze principali: #10, #11 e #12 → #13 → M1 → M2 → M3 → M4 → M5. Le viste (M2) dipendono da snippet e relazioni (#15, #17);
#32 (visibilità) va fatta prima di esporre viste e ricerca ai giocatori (M3 impone di rivedere ricerca/export di M1).

| #   | Issue                                                                           | Tipo  | Dipende da | Stato    | Note                                                                    |
| --- | ------------------------------------------------------------------------------- | ----- | ---------- | -------- | ----------------------------------------------------------------------- |
| 48  | Scaffold: Next.js, tooling, CI, e2e base                                        | chore | -          | done     | PR #49                                                                  |
| 6   | Installare Docker Desktop e collegare Supabase                                  | chore | -          | done     | Docker, Supabase locale e cloud                                         |
| 7   | Deploy automatico su Vercel da main con preview per PR                          | chore | 48         | done     | Vercel collegato, preview su ogni PR                                    |
| 8   | Workflow per generare le baseline screenshot su Linux                           | chore | 48         | done     | PR #56                                                                  |
| 9   | CI: database Postgres reale e test di integrazione                              | chore | 6, 11      | done     | PR #53                                                                  |
| 10  | i18n it/en, tema chiaro/scuro e shell applicativa                               | feat  | 48         | done     | PR #54                                                                  |
| 11  | Schema iniziale DB: mondi, membri, categorie, snippet, relazioni con RLS        | feat  | 6          | done     | PR #51; tipi generati in #13                                            |
| 12  | Autenticazione: email+password con verifica, reset e OAuth                      | feat  | 11         | done     | PR #58                                                                  |
| 13  | Mondi: creazione, elenco, impostazioni, membri e ruoli                          | feat  | 11, 12     | done     | PR #61                                                                  |
| 14  | Categorie configurabili con campi personalizzati tipizzati                      | feat  | 13         | done     | PR #64 e PR editor campi                                                |
| 15  | Snippet: CRUD, duplica, archivia e cestino 30 giorni                            | feat  | 14         | done     | PR #66, #67 e immagini                                                  |
| 16  | Tag, alias e stato bozza/definitivo                                             | feat  | 14         | done     | tag, alias, filtri; stato già in #15                                    |
| 17  | Relazioni con etichetta libera e inversa                                        | feat  | 15         | done     | pannello (#70) e tipi con vincoli                                       |
| 18  | Menzioni con @ e pannello backlink                                              | feat  | 15         | done     | menzioni @, alias, backlink                                             |
| 19  | Ricerca full-text e comando rapido Ctrl/Cmd+K                                   | feat  | 13         | done     | full-text, filtri, Ctrl/Cmd+K                                           |
| 20  | Cronologia versioni con confronto e ripristino                                  | feat  | 13         | done     | trigger, confronto, ripristino (D-020)                                  |
| 21  | Import/export del mondo in JSON e Markdown con front matter                     | feat  | 13         | done     | JSON v1, round trip, permessi (D-021)                                   |
| 22  | Seed di demo: mondo di esempio e dati sintetici per performance                 | feat  | 13         | done     | seed.sql, login demo, prova di carico (D-022)                           |
| 23  | Modello di vista salvata con link stabile                                       | feat  | 15, 17     | done     | saved_views, link stabile, condivisione (D-023)                         |
| 24  | Vista tabella con ordinamento, filtri e raggruppamenti                          | feat  | 15, 17     | done     | tabella, ordinamento, gruppi, filtri (D-024)                            |
| 25  | Vista grafo delle relazioni                                                     | feat  | 15, 17     | done     | graph_data, SVG server, tabella alt. (D-025)                            |
| 26  | Calendari personalizzati e scale temporali                                      | feat  | 15, 17     | done     | calendars, conversione, campo data (D-026)                              |
| 27  | Vista timeline                                                                  | feat  | 26         | done     | SVG server, zoom, corsie, tabella alt. (D-027)                          |
| 28  | Vista mappa con pin e mappe annidate                                            | feat  | 15, 17     | done     | maps, pin, percorsi, annidate (D-028)                                   |
| 29  | Albero genealogico e gerarchia da etichetta di relazione                        | feat  | 15, 17     | done     | albero da etichetta, cicli, lista annidata (D-029)                      |
| 30  | Bacheca kanban per campo di stato                                               | feat  | 15, 17     | done     | colonne da stato o campo, modulo + drag (D-030)                         |
| 31  | Campagne e inviti con ruoli                                                     | feat  | 13         | done     | campagne, ruoli, inviti link/email (D-031)                              |
| 32  | Visibilità per elemento e rivelazione                                           | feat  | 31         | done     | quattro livelli, registro, campi riservati (D-032)                      |
| 33  | Sistema di statistiche: schema JSON, validazione e interprete di formule sicuro | feat  | 13         | done     | schema JSON, formule sandboxed, preset (D-033)                          |
| 34  | Schede personaggio PG/PNG                                                       | feat  | 33         | done     | schede, RLS per giocatore, cronologia (D-034)                           |
| 35  | Migrazione guidata dello schema di statistiche                                  | feat  | 33         | done     | anteprima live, migrazione guidata (D-035)                              |
| 36  | Sessioni, diario e bacheca messaggi                                             | feat  | 13         | done     | sessioni, diario e bacheca, session_id in D-032 (D-036)                 |
| 37  | Notifiche in-app                                                                | feat  | 13         | done     | rivelazioni, sessioni, menzioni, inviti (D-037)                         |
| 38  | Collaborazione in tempo reale su snippet                                        | feat  | M1         | done     | presenza e commenti via Realtime, D-015 invariato (D-038)               |
| 39  | Tiratore di dadi                                                                | feat  | M1         | done     | notazione, vantaggio/svantaggio generico, formule (D-039)               |
| 40  | Tracker di iniziativa e modalità al tavolo                                      | feat  | M1         | done     | turni, condizioni, PF a scoppio dalla scheda (D-040)                    |
| 41  | Controllo di coerenza                                                           | feat  | M1         | done     | inverse mancanti, intervalli invertiti, orfani (D-041)                  |
| 42  | Wiki pubblica del mondo                                                         | feat  | M1         | done     | slug del mondo, solo testo/relazioni pubblici (D-042)                   |
| 43  | Import da Markdown, Obsidian, CSV e modelli di mondo                            | feat  | M1         | done     | import da Markdown/Obsidian/CSV (D-043); modelli condivisibili (D-046)  |
| 100 | Export del mondo in Markdown con front matter                                   | feat  | 21         | done     | archivio ZIP, JSON incluso per la fedeltà (D-047)                       |
| 44  | GDPR: esportazione e cancellazione account, informativa e consenso              | feat  | M1         | done     | anonimizzazione dei contributi altrove, no service role (D-044)         |
| 45  | Osservabilità, backup e ripristino                                              | chore | M1         | parziale | log strutturati e tracciamento errori fatti; backup rimandato (D-045)   |
| 46  | Performance e sicurezza: CSP, audit, budget LCP                                 | chore | M1         | done     | CSP con nonce, budget LCP su dati sintetici (D-048)                     |
| 47  | Guida utente, documentazione export/import e schema statistiche                 | docs  | M1         | done     | docs/user-guide.md, primo rilascio v1.0.0 (D-049)                       |
| 57  | Login con OAuth (GitHub)                                                        | feat  | 12         | done     | PR #62                                                                  |
| 59  | Collegare Supabase cloud e Vercel (env, migrazioni, redirect URL)               | chore | 12         | done     | verificato su worldloom-lemon.vercel.app                                |
| 60  | Membri del mondo: inviti, ruoli, uscita, trasferimento                          | feat  | 13         | done     | PR #63                                                                  |
| 108 | Restyling: profilare la lentezza percepita ai click                             | chore | M1         | done     | soprattutto percezione, niente loading.tsx; viste pesanti reali (D-051) |
| 109 | Restyling: fondamenta del design system                                         | docs  | -          | todo     | densità, font-size, menu, caricamento, transizioni (D-050)              |
| 110 | Restyling: menu superiore e navigazione globale                                 | feat  | 109        | todo     | tema, lingua, contesto del mondo (D-050)                                |
| 111 | Restyling: stati di caricamento e percezione di velocità                        | feat  | 108, 109   | todo     | skeleton/spinner, esito della profilazione #108 (D-050)                 |
| 112 | Restyling: navigazione a schede (tab in stile IDE)                              | feat  | 109        | todo     | schede aperte persistite, stile VS Code/browser (D-050)                 |
| 113 | Restyling: passata finale schermata per schermata                               | feat  | 109–112    | todo     | coerenza su tutte le viste (D-050)                                      |

## Bloccato in attesa dell'utente (`needs-human`)

- nessuno

## Note utili per riprendere il lavoro

- Kickoff: decisioni in `docs/DECISIONS.md` (D-001..D-010). Stack Next.js + Supabase, npm, palette Cartografo.
- Produzione: https://worldloom-lemon.vercel.app (Supabase cloud configurato dall'utente; ogni nuova migrazione va applicata anche al cloud: `npx supabase db push`).
