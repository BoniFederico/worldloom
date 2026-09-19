# Piano di sviluppo

> Mantenuto dall'agente. Rispecchia le issue GitHub. Aggiornalo a ogni task chiuso.

## Stato

- Fase: M0 in corso (#11 in PR).

## Backlog (in ordine di esecuzione)

Dipendenze principali: #10, #11 e #12 → #13 → M1 → M2 → M3 → M4 → M5. Le viste (M2) dipendono da snippet e relazioni (#15, #17);
#32 (visibilità) va fatta prima di esporre viste e ricerca ai giocatori (M3 impone di rivedere ricerca/export di M1).

| #   | Issue                                                                           | Tipo  | Dipende da | Stato       | Note                                                      |
| --- | ------------------------------------------------------------------------------- | ----- | ---------- | ----------- | --------------------------------------------------------- |
| 48  | Scaffold: Next.js, tooling, CI, e2e base                                        | chore | -          | in PR       |                                                           |
| 6   | Installare Docker Desktop e collegare Supabase                                  | chore | -          | parziale    | Docker e Supabase locale ok (#50); resta il link al cloud |
| 7   | Deploy automatico su Vercel da main con preview per PR                          | chore | 48         | in verifica | Vercel gia collegato: le PR hanno la preview              |
| 8   | Workflow per generare le baseline screenshot su Linux                           | chore | 48         | todo        |                                                           |
| 9   | CI: database Postgres reale e test di integrazione                              | chore | 6, 11      | todo        |                                                           |
| 10  | i18n it/en, tema chiaro/scuro e shell applicativa                               | feat  | 48         | todo        |                                                           |
| 11  | Schema iniziale DB: mondi, membri, categorie, snippet, relazioni con RLS        | feat  | 6          | in PR       | 17 test RLS; tipi generati in #13                         |
| 12  | Autenticazione: email+password con verifica, reset e OAuth                      | feat  | 11         | needs-human | credenziali OAuth                                         |
| 13  | Mondi: creazione, elenco, impostazioni, membri e ruoli                          | feat  | 11, 12     | todo        |                                                           |
| 14  | Categorie configurabili con campi personalizzati tipizzati                      | feat  | 13         | todo        |                                                           |
| 15  | Snippet: CRUD, duplica, archivia e cestino 30 giorni                            | feat  | 14         | todo        |                                                           |
| 16  | Tag, alias e stato bozza/definitivo                                             | feat  | 14         | todo        |                                                           |
| 17  | Relazioni con etichetta libera e inversa                                        | feat  | 15         | todo        |                                                           |
| 18  | Menzioni con @ e pannello backlink                                              | feat  | 15         | todo        |                                                           |
| 19  | Ricerca full-text e comando rapido Ctrl/Cmd+K                                   | feat  | 13         | todo        |                                                           |
| 20  | Cronologia versioni con confronto e ripristino                                  | feat  | 13         | todo        |                                                           |
| 21  | Import/export del mondo in JSON e Markdown con front matter                     | feat  | 13         | todo        |                                                           |
| 22  | Seed di demo: mondo di esempio e dati sintetici per performance                 | feat  | 13         | todo        |                                                           |
| 23  | Modello di vista salvata con link stabile                                       | feat  | 15, 17     | todo        |                                                           |
| 24  | Vista tabella con ordinamento, filtri e raggruppamenti                          | feat  | 15, 17     | todo        |                                                           |
| 25  | Vista grafo delle relazioni                                                     | feat  | 15, 17     | todo        |                                                           |
| 26  | Calendari personalizzati e scale temporali                                      | feat  | 15, 17     | todo        |                                                           |
| 27  | Vista timeline                                                                  | feat  | 26         | todo        |                                                           |
| 28  | Vista mappa con pin e mappe annidate                                            | feat  | 15, 17     | todo        |                                                           |
| 29  | Albero genealogico e gerarchia da etichetta di relazione                        | feat  | 15, 17     | todo        |                                                           |
| 30  | Bacheca kanban per campo di stato                                               | feat  | 15, 17     | todo        |                                                           |
| 31  | Campagne e inviti con ruoli                                                     | feat  | 13         | todo        |                                                           |
| 32  | Visibilità per elemento e rivelazione                                           | feat  | 31         | todo        |                                                           |
| 33  | Sistema di statistiche: schema JSON, validazione e interprete di formule sicuro | feat  | 13         | todo        |                                                           |
| 34  | Schede personaggio PG/PNG                                                       | feat  | 33         | todo        |                                                           |
| 35  | Migrazione guidata dello schema di statistiche                                  | feat  | 33         | todo        |                                                           |
| 36  | Sessioni, diario e bacheca messaggi                                             | feat  | 13         | todo        |                                                           |
| 37  | Notifiche in-app                                                                | feat  | 13         | todo        |                                                           |
| 38  | Collaborazione in tempo reale su snippet                                        | feat  | M1         | todo        |                                                           |
| 39  | Tiratore di dadi                                                                | feat  | M1         | todo        |                                                           |
| 40  | Tracker di iniziativa e modalità al tavolo                                      | feat  | M1         | todo        |                                                           |
| 41  | Controllo di coerenza                                                           | feat  | M1         | todo        |                                                           |
| 42  | Wiki pubblica del mondo                                                         | feat  | M1         | todo        |                                                           |
| 43  | Import da Markdown, Obsidian, CSV e modelli di mondo                            | feat  | M1         | todo        |                                                           |
| 44  | GDPR: esportazione e cancellazione account, informativa e consenso              | feat  | M1         | todo        |                                                           |
| 45  | Osservabilità, backup e ripristino                                              | chore | M1         | todo        |                                                           |
| 46  | Performance e sicurezza: CSP, audit, budget LCP                                 | chore | M1         | todo        |                                                           |
| 47  | Guida utente, documentazione export/import e schema statistiche                 | docs  | M1         | todo        |                                                           |

## Bloccato in attesa dell'utente (`needs-human`)

- #6 Docker Desktop e progetto Supabase cloud
- #7 Collegamento Vercel
- #12 Credenziali di un provider OAuth (la parte email+password non è bloccata)

## Note utili per riprendere il lavoro

- Kickoff: decisioni in `docs/DECISIONS.md` (D-001..D-008). Stack Next.js + Supabase, npm, palette Cartografo.
- Senza Docker: procedere su lavoro che non richiede DB locale (#8, #10, logica di dominio #26, #33 ecc.).
- Sul disco restano modifiche di formattazione non volute a file del kit (`.claude`, `.github`, SPEC.md, ecc.): non committarle.
