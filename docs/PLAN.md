# Piano di sviluppo

> Mantenuto dall'agente. Rispecchia le issue GitHub. Aggiornalo a ogni task chiuso.

## Stato

- Fase: M1 in corso: #20 chiusa (cronologia versioni); prossimo #21 (import/export).

## Backlog (in ordine di esecuzione)

Dipendenze principali: #10, #11 e #12 → #13 → M1 → M2 → M3 → M4 → M5. Le viste (M2) dipendono da snippet e relazioni (#15, #17);
#32 (visibilità) va fatta prima di esporre viste e ricerca ai giocatori (M3 impone di rivedere ricerca/export di M1).

| #   | Issue                                                                           | Tipo  | Dipende da | Stato | Note                                     |
| --- | ------------------------------------------------------------------------------- | ----- | ---------- | ----- | ---------------------------------------- |
| 48  | Scaffold: Next.js, tooling, CI, e2e base                                        | chore | -          | done  | PR #49                                   |
| 6   | Installare Docker Desktop e collegare Supabase                                  | chore | -          | done  | Docker, Supabase locale e cloud          |
| 7   | Deploy automatico su Vercel da main con preview per PR                          | chore | 48         | done  | Vercel collegato, preview su ogni PR     |
| 8   | Workflow per generare le baseline screenshot su Linux                           | chore | 48         | done  | PR #56                                   |
| 9   | CI: database Postgres reale e test di integrazione                              | chore | 6, 11      | done  | PR #53                                   |
| 10  | i18n it/en, tema chiaro/scuro e shell applicativa                               | feat  | 48         | done  | PR #54                                   |
| 11  | Schema iniziale DB: mondi, membri, categorie, snippet, relazioni con RLS        | feat  | 6          | done  | PR #51; tipi generati in #13             |
| 12  | Autenticazione: email+password con verifica, reset e OAuth                      | feat  | 11         | done  | PR #58                                   |
| 13  | Mondi: creazione, elenco, impostazioni, membri e ruoli                          | feat  | 11, 12     | done  | PR #61                                   |
| 14  | Categorie configurabili con campi personalizzati tipizzati                      | feat  | 13         | done  | PR #64 e PR editor campi                 |
| 15  | Snippet: CRUD, duplica, archivia e cestino 30 giorni                            | feat  | 14         | done  | PR #66, #67 e immagini                   |
| 16  | Tag, alias e stato bozza/definitivo                                             | feat  | 14         | done  | tag, alias, filtri; stato già in #15     |
| 17  | Relazioni con etichetta libera e inversa                                        | feat  | 15         | done  | pannello (#70) e tipi con vincoli        |
| 18  | Menzioni con @ e pannello backlink                                              | feat  | 15         | done  | menzioni @, alias, backlink              |
| 19  | Ricerca full-text e comando rapido Ctrl/Cmd+K                                   | feat  | 13         | done  | full-text, filtri, Ctrl/Cmd+K            |
| 20  | Cronologia versioni con confronto e ripristino                                  | feat  | 13         | done  | trigger, confronto, ripristino (D-020)   |
| 21  | Import/export del mondo in JSON e Markdown con front matter                     | feat  | 13         | todo  |                                          |
| 22  | Seed di demo: mondo di esempio e dati sintetici per performance                 | feat  | 13         | todo  |                                          |
| 23  | Modello di vista salvata con link stabile                                       | feat  | 15, 17     | todo  |                                          |
| 24  | Vista tabella con ordinamento, filtri e raggruppamenti                          | feat  | 15, 17     | todo  |                                          |
| 25  | Vista grafo delle relazioni                                                     | feat  | 15, 17     | todo  |                                          |
| 26  | Calendari personalizzati e scale temporali                                      | feat  | 15, 17     | todo  |                                          |
| 27  | Vista timeline                                                                  | feat  | 26         | todo  |                                          |
| 28  | Vista mappa con pin e mappe annidate                                            | feat  | 15, 17     | todo  |                                          |
| 29  | Albero genealogico e gerarchia da etichetta di relazione                        | feat  | 15, 17     | todo  |                                          |
| 30  | Bacheca kanban per campo di stato                                               | feat  | 15, 17     | todo  |                                          |
| 31  | Campagne e inviti con ruoli                                                     | feat  | 13         | todo  |                                          |
| 32  | Visibilità per elemento e rivelazione                                           | feat  | 31         | todo  |                                          |
| 33  | Sistema di statistiche: schema JSON, validazione e interprete di formule sicuro | feat  | 13         | todo  |                                          |
| 34  | Schede personaggio PG/PNG                                                       | feat  | 33         | todo  |                                          |
| 35  | Migrazione guidata dello schema di statistiche                                  | feat  | 33         | todo  |                                          |
| 36  | Sessioni, diario e bacheca messaggi                                             | feat  | 13         | todo  |                                          |
| 37  | Notifiche in-app                                                                | feat  | 13         | todo  |                                          |
| 38  | Collaborazione in tempo reale su snippet                                        | feat  | M1         | todo  |                                          |
| 39  | Tiratore di dadi                                                                | feat  | M1         | todo  |                                          |
| 40  | Tracker di iniziativa e modalità al tavolo                                      | feat  | M1         | todo  |                                          |
| 41  | Controllo di coerenza                                                           | feat  | M1         | todo  |                                          |
| 42  | Wiki pubblica del mondo                                                         | feat  | M1         | todo  |                                          |
| 43  | Import da Markdown, Obsidian, CSV e modelli di mondo                            | feat  | M1         | todo  |                                          |
| 44  | GDPR: esportazione e cancellazione account, informativa e consenso              | feat  | M1         | todo  |                                          |
| 45  | Osservabilità, backup e ripristino                                              | chore | M1         | todo  |                                          |
| 46  | Performance e sicurezza: CSP, audit, budget LCP                                 | chore | M1         | todo  |                                          |
| 47  | Guida utente, documentazione export/import e schema statistiche                 | docs  | M1         | todo  |                                          |
| 57  | Login con OAuth (GitHub)                                                        | feat  | 12         | done  | PR #62                                   |
| 59  | Collegare Supabase cloud e Vercel (env, migrazioni, redirect URL)               | chore | 12         | done  | verificato su worldloom-lemon.vercel.app |
| 60  | Membri del mondo: inviti, ruoli, uscita, trasferimento                          | feat  | 13         | done  | PR #63                                   |

## Bloccato in attesa dell'utente (`needs-human`)

- nessuno

## Note utili per riprendere il lavoro

- Kickoff: decisioni in `docs/DECISIONS.md` (D-001..D-010). Stack Next.js + Supabase, npm, palette Cartografo.
- Produzione: https://worldloom-lemon.vercel.app (Supabase cloud configurato dall'utente; ogni nuova migrazione va applicata anche al cloud: `npx supabase db push`).
