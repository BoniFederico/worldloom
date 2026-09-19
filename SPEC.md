# SPEC: Worldloom

## Obiettivo
Worldloom è un SaaS per scrittori, worldbuilder e dungeon master. Permette di scrivere qualsiasi cosa (un pezzo di storia,
un personaggio, un luogo, un evento storico, un oggetto, una regola) come **snippet** dotato di categoria, collegarlo ad altri
snippet con **relazioni dal nome libero**, e guardare lo stesso mondo attraverso **viste diverse** (timeline, mappa, grafo,
albero genealogico, tabella). Sopra questo nucleo c'è un livello **campagne**: un DM condivide con i giocatori solo ciò che
decide, e il gruppo tiene traccia di personaggi e statistiche con un sistema di regole configurabile, senza legarsi a un gioco.

Il prodotto deve essere generico per costruzione: niente concetti cablati nel codice (nessuna tabella "personaggi", nessun
elenco fisso di statistiche). Tutto ciò che sembra specifico è configurazione dell'utente.

## Utenti e scenari principali
- **Scrittore / worldbuilder**: costruisce un mondo coerente, evita contraddizioni, ritrova ciò che ha scritto, vede la cronologia
  e la geografia. Lavora spesso da solo, a volte con un co-autore.
- **Dungeon master**: prepara una campagna, tiene segreti, rivela informazioni ai giocatori durante le sessioni, gestisce
  personaggi e statistiche del gruppo.
- **Giocatore**: legge ciò che il DM ha condiviso, gestisce la propria scheda personaggio, scrive note personali e diario.
- **Lettore (facoltativo)**: consulta un mondo pubblicato in sola lettura.

## Modello concettuale
- **Mondo** (workspace): contenitore di tutto. Ha proprietario, membri, impostazioni, schemi.
- **Categoria**: definita dall'utente per mondo (nome, icona, colore, campi personalizzati, template di contenuto). Parte da
  un set di preset importabili (Personaggio, Luogo, Evento, Capitolo, Oggetto, Fazione, Regola), tutti modificabili o eliminabili.
- **Snippet**: unità di contenuto. Titolo, categoria (una o più), corpo rich text, campi personalizzati tipizzati
  (testo, numero, data, data in calendario custom, scelta, riferimento a snippet, coordinate, immagine), tag, alias, stato
  (bozza/definitivo), cronologia versioni.
- **Relazione**: arco orientato tra due snippet con **etichetta libera** ("padre di", "nato a", "alleato di") e etichetta inversa
  opzionale ("figlio di"). Può avere note, un intervallo temporale di validità e campi propri. Le etichette usate diventano
  suggerimenti riutilizzabili; l'utente può definire tipi di relazione con vincoli opzionali sulle categorie collegabili.
- **Vista**: una lettura salvata del grafo (filtri + tipo di visualizzazione + configurazione).
- **Campagna**: appartiene a un mondo (o è autonoma). Ha DM, giocatori, sessioni, personaggi, sistema di statistiche.

## Funzionalità (in ordine di priorità)

### 1. MUST: nucleo di scrittura e grafo
- [ ] Creare, modificare, duplicare, archiviare, eliminare (con cestino di 30 giorni) snippet con rich text
      (titoli, liste, citazioni, link, immagini, tabelle).
- [ ] Categorie configurabili con campi personalizzati tipizzati; cambiare la categoria di uno snippet non perde dati.
- [ ] Creare relazioni con etichetta libera e inversa da un pannello dello snippet e digitando `@` nel testo (menzione = relazione).
- [ ] Pannello "collegamenti in entrata" (backlinks) su ogni snippet.
- [ ] Ricerca full-text istantanea con filtri per categoria, tag, campi e relazioni; comando rapido (Ctrl/Cmd+K).
- [ ] Cronologia versioni per snippet con confronto e ripristino.
- [ ] Tag e alias; gli alias vengono riconosciuti nelle menzioni.
- [ ] Import ed export completo del mondo (JSON documentato e Markdown con front matter). L'export deve ricreare il mondo identico.

### 2. MUST: viste
- [ ] **Tabella/database** con colonne dai campi, ordinamento, filtri, raggruppamenti, viste salvate.
- [ ] **Grafo di relazioni** interattivo con filtri per categoria ed etichetta e profondità dal nodo selezionato.
- [ ] **Timeline** su una o più scale temporali, con **calendari personalizzati** (mesi, giorni, ere, anni, epoche
      definiti dall'utente). Corsie per categoria o per tag, eventi puntuali e a intervallo, zoom, filtro per personaggio/luogo.
- [ ] **Mappa**: caricamento di immagini di mappa (anche più livelli, es. regione, città, dungeon), pin sugli snippet-luogo con
      coordinate, mappe annidate (un pin apre la mappa del luogo), percorsi tra luoghi, filtri per categoria e periodo.
      Nessuna dipendenza da servizi di mappe a pagamento; opzionalmente mappe geografiche reali per ambientazioni contemporanee.
- [ ] **Albero genealogico / gerarchia** generato da una qualsiasi etichetta di relazione scelta dall'utente.
- [ ] **Bacheca (kanban)** per campo di stato/scelta, utile per trame e bozze.
- [ ] Le viste sono salvabili, condivisibili e ogni vista si apre con un link stabile.

### 3. MUST: campagne e social
- [ ] Creare una campagna, invitare giocatori via link o email con ruoli (DM, co-DM, giocatore, osservatore).
- [ ] **Visibilità per elemento**: ogni snippet, relazione, pin e campo ha visibilità *segreto (solo DM)*, *condiviso con
      giocatori scelti*, *condiviso con tutti i membri*, *pubblico*. Il DM rivela un elemento con un clic; la rivelazione è
      registrata e può essere legata a una sessione. Un giocatore non deve **mai** ricevere dal server dati che non può vedere
      (niente filtraggio solo lato client, comprese ricerca, grafo, mappe, export).
- [ ] **Sistema di statistiche configurabile**: il proprietario della campagna definisce uno schema in JSON (vedi sotto). Da esso
      si genera la scheda personaggio, con validazione, campi calcolati e ripristino di uno schema di default.
- [ ] Schede personaggio (PG e PNG) con statistiche, inventario, note, cronologia delle modifiche e chi le ha fatte.
      I giocatori modificano solo le proprie schede; il DM le vede e modifica tutte.
- [ ] **Sessioni**: data, riepilogo, elementi rivelati, eventi di timeline collegati, note private del DM e note dei giocatori.
- [ ] Diario di campagna condiviso (cronaca) e bacheca di messaggi per campagna.
- [ ] Notifiche in-app per rivelazioni, nuove sessioni, menzioni e inviti.

### 4. SHOULD
- [ ] Collaborazione in tempo reale su uno snippet (presenza e modifica simultanea senza perdita di dati), commenti e menzioni
      tra membri del mondo.
- [ ] Tiratore di dadi con notazione standard (`2d6+3`, vantaggio/svantaggio, formule che leggono le statistiche), storico
      condiviso e tiri privati del DM.
- [ ] Tracker di iniziativa/scontro con turni, condizioni e punti ferita presi dallo schema di statistiche.
- [ ] Modalità "al tavolo" ottimizzata per tablet: rivelazione rapida, tiri, iniziativa.
- [ ] Controllo di coerenza: segnalazione di anomalie (es. personaggio che partecipa a un evento dopo la sua data di morte,
      relazione con etichetta inversa mancante, snippet orfani).
- [ ] Modelli di mondo e di campagna condivisibili, e galleria di preset di categorie e schemi di statistiche.
- [ ] Pubblicazione di un mondo o di una selezione come wiki pubblica navigabile, con URL leggibili e SEO.
- [ ] Import da Markdown, Obsidian, CSV.

### 5. COULD
- [ ] Assistenza IA opzionale (riassunti, suggerimenti di relazioni, controllo coerenza), attivabile per mondo, spenta di default,
      con chiave dell'utente e senza usare i suoi contenuti per addestrare modelli.
- [ ] Generatori casuali configurabili (nomi, tabelle).
- [ ] App installabile (PWA) con lettura offline del mondo.
- [ ] Piani a pagamento e limiti d'uso (vedi "Monetizzazione").

## Schema di statistiche (JSON, configurabile)
Il proprietario della campagna carica/modifica un documento JSON versionato con questa forma logica. I nomi dei campi sono una
proposta: se ne può scegliere uno migliore in fase di design, purché l'esempio sotto resti esprimibile e validato con JSON Schema.

```json
{
  "schemaVersion": 1,
  "name": "Fantasy d20 semplificato",
  "attributes": [
    { "key": "str", "label": "Forza", "type": "integer", "min": 1, "max": 30, "default": 10 },
    { "key": "dex", "label": "Destrezza", "type": "integer", "min": 1, "max": 30, "default": 10 }
  ],
  "derived": [
    { "key": "str_mod", "label": "Mod. Forza", "formula": "floor((str - 10) / 2)" }
  ],
  "resources": [
    { "key": "hp", "label": "Punti ferita", "type": "pool", "maxFormula": "10 + str_mod * level" }
  ],
  "lists": [
    { "key": "skills", "label": "Abilità", "item": { "name": "text", "rank": "integer" } },
    { "key": "inventory", "label": "Inventario", "item": { "name": "text", "qty": "integer", "weight": "number" } }
  ],
  "text": [ { "key": "background", "label": "Background" } ],
  "layout": [ { "section": "Combattimento", "fields": ["hp", "str", "dex"] } ]
}
```
Requisiti: formule valutate in un interprete **sicuro e sandboxed** (nessuna esecuzione di codice arbitrario, nessun accesso a
rete o filesystem, limite di tempo e complessità); errori di validazione chiari con riga e campo; anteprima live della scheda;
migrazione guidata quando lo schema cambia con schede già esistenti; preset di partenza importabili (d20, punteggi a
percentuale, pool di dadi, sistema narrativo a tratti).

## Ruoli e permessi
- Mondo: proprietario, editor, commentatore, lettore. Campagna: DM, co-DM, giocatore, osservatore.
- Il permesso si valuta sul server per ogni lettura e scrittura, con test automatici dei casi negativi (escalation, IDOR, accesso
  cross-mondo).
- Un utente può appartenere a più mondi e campagne. Trasferimento di proprietà e uscita dal gruppo gestiti.

## Vincoli tecnici
- Stack: **libera scelta dell'agente**, motivata in `docs/DECISIONS.md`. Vincoli: TypeScript strict end-to-end, applicazione web
  responsive, database relazionale con supporto a ricerca full-text e query su grafo (relazioni ricorsive), migrazioni
  versionate, campi personalizzati tipizzati (es. JSONB validato), API documentata con contratto tipizzato.
- Autenticazione: email + password con verifica email e reimpostazione, login con almeno un provider OAuth. Sessioni sicure,
  rate limiting, protezione CSRF. Hashing moderno delle password.
- Multi-tenancy: isolamento dei dati per mondo garantito dal livello dati, non solo dal codice applicativo.
- Hosting: preferire un'opzione con piano gratuito adatto a una demo (da decidere al kickoff); deploy automatico da `main`,
  ambienti di preview per PR se possibile. Configurazione solo tramite variabili d'ambiente; `.env.example` senza segreti.
- Upload di file/immagini con validazione di tipo e dimensione, storage oggetto separato dal DB.
- Integrazioni esterne: nessuna obbligatoria oltre a email transazionale e OAuth.
- Il progetto deve poter girare in locale con un solo comando (`docker compose up` o equivalente) e dati di esempio (seed).

## Requisiti non funzionali
- **Performance**: LCP < 2.5s su 4G simulato; apertura di uno snippet < 300 ms al 95° percentile; grafo e timeline fluidi con
  5.000 snippet e 20.000 relazioni (virtualizzazione/clustering, test con dati sintetici); ricerca < 200 ms.
- **Accessibilità**: WCAG 2.2 AA; tutto utilizzabile da tastiera; le viste grafiche (grafo, mappa, timeline) hanno un'alternativa
  testuale/tabellare equivalente; `prefers-reduced-motion` e `prefers-color-scheme` rispettati.
- **Sicurezza e privacy**: OWASP ASVS livello 2 come riferimento; sanificazione del rich text (XSS), content security policy,
  validazione input ai confini, sandbox delle formule, log senza dati personali. GDPR: esportazione e cancellazione dell'account
  e dei dati, consenso esplicito, informativa. Contenuti degli utenti mai usati per addestrare modelli.
- **Affidabilità**: salvataggio automatico con indicatore di stato, nessuna perdita di dati su chiusura/rete instabile,
  backup giornalieri del database con procedura di ripristino documentata.
- **Browser**: ultime 2 versioni di Chrome, Firefox, Safari, Edge; iOS Safari e Android Chrome. Interfaccia usabile da 360 px.
- **i18n**: italiano e inglese al lancio, architettura pronta per altre lingue; date, numeri e calendari localizzati.
- **Qualità**: coverage ≥ 80% sulla logica di dominio, test e2e Playwright dei flussi critici (scrittura, relazioni, viste,
  rivelazione al giocatore), test di permessi automatici, screenshot regression mobile e desktop, axe senza violazioni gravi.
- **Osservabilità**: log strutturati, tracciamento errori, metriche di base, health check.

## Monetizzazione (da confermare, non bloccante)
Piano gratuito con limiti ragionevoli (mondi, campagne, spazio file, membri) e piano a pagamento; i limiti sono configurazione
e non condizionano l'architettura. L'integrazione di pagamento è COULD e va chiesta all'utente prima di iniziare.

## Identità visiva
- Mood: strumento serio da scrittura e da tavolo, che non sia né un gestionale grigio né un cliché "fantasy" (niente pergamene
  e font gotici di default). Leggibilità del testo lungo prima di tutto; densità informativa alta nelle viste, calma nell'editor.
- Tema chiaro e scuro con la stessa dignità (i DM giocano spesso in ambienti scuri).
- Palette, tipografia e set di icone: **l'agente propone 2 opzioni al kickoff** seguendo la skill `frontend-design`; nessun
  gradiente viola/blu, nessun glassmorphism, nessuna emoji al posto delle icone.
- Le viste (mappa, timeline, grafo) devono avere una resa curata e coerente con il design system, non librerie usate con lo stile
  di default.

## Fuori scope
- Un motore di gioco completo con regole automatizzate di un sistema specifico (le regole restano configurazione dell'utente).
- Videochiamata e chat vocale integrate (si linkano servizi esterni).
- App native iOS/Android (basta PWA).
- Marketplace di contenuti a pagamento tra utenti.
- Generazione di immagini o di mappe con IA.

## Definition of "finito" per il progetto
- Tutte le funzionalità MUST funzionanti e coperte da test; le SHOULD implementate o motivatamente rimandate nel `docs/PLAN.md`.
- Test di permessi che dimostrano che un giocatore non può ottenere dati segreti da nessuna API, ricerca, vista o export.
- App online con dominio di default dell'hosting, seed di demo (un mondo di esempio e una campagna di esempio) e login demo.
- CI verde, CodeQL attivo (repo pubblico), release con CHANGELOG generato.
- README con avvio locale in un comando, `docs/architecture.md`, guida utente breve e documentazione dell'export/import e dello
  schema di statistiche.
