# Formato di esportazione del mondo (JSON, versione 1)

Il file è prodotto da `GET /worlds/{id}/export` (pulsante «Esporta (JSON)» nella pagina del mondo) e letto da
`/worlds/import` (`POST /api/worlds/import`), che crea sempre un **mondo nuovo** di cui chi importa è proprietario.

## Garanzie

- **Permessi.** L'export usa la sessione di chi lo richiede: la sicurezza a livello di riga decide cosa si legge. Un lettore non
  trova nel file gli snippet `secret` o `shared` che non può vedere; chi non è membro riceve 404.
- **Round trip.** Esportare, importare e riesportare produce lo stesso contenuto. Non ci sono id del database né data di
  esportazione: snippet e categorie hanno riferimenti ordinali (`s1`, `c1`, …), assegnati per data di creazione (snippet) e nome
  (categorie), e le chiavi degli oggetti nei campi `jsonb` sono in ordine alfabetico.
- **Sicurezza in importazione.** Il file è validato (schema, riferimenti, limiti) e ogni testo passa dalla stessa sanificazione
  dell'editor; un testo non valido fa fallire l'importazione (mai sostituito da uno vuoto). Se un passaggio fallisce il mondo
  appena creato viene eliminato.

## Struttura

```json
{
  "format": "worldloom.world",
  "version": 1,
  "world": { "name": "Aurelia" },
  "categories": [
    {
      "ref": "c1",
      "name": "Personaggio",
      "icon": null,
      "color": null,
      "fieldsSchema": [{ "key": "eta", "label": "Età", "type": "number" }],
      "contentTemplate": null
    }
  ],
  "snippets": [
    {
      "ref": "s1",
      "title": "Elara",
      "status": "draft | final",
      "visibility": "secret | shared | members | public",
      "archived": false,
      "tags": ["eroe"],
      "aliases": ["La Saggia"],
      "categories": ["c1"],
      "fields": { "eta": 42 },
      "body": { "type": "doc", "content": [] },
      "createdAt": "2026-01-01T10:00:00.000Z"
    }
  ],
  "relationTypes": [
    { "label": "abita a", "inverseLabel": "ospita", "sourceCategory": "c1", "targetCategory": null }
  ],
  "relations": [
    {
      "source": "s1",
      "target": "s2",
      "label": "abita a",
      "inverseLabel": "ospita",
      "notes": "",
      "validFrom": { "calendar": "default", "year": 12 },
      "validTo": null,
      "fromMention": false,
      "visibility": "members",
      "createdAt": "2026-01-03T10:00:00.000Z"
    }
  ]
}
```

- `body` è un documento ProseMirror (vedi D-014). I nodi `mention` hanno `attrs.id` uguale al riferimento dello snippet citato
  (`s2`); le menzioni verso snippet non presenti nel file vengono tolte.
- Le relazioni con `fromMention: true` sono quelle generate dalle menzioni (etichette fisse «menziona» / «menzionato in»).
- I tipi di relazione si creano dopo le relazioni: i vincoli dei tipi non si applicano retroattivamente in importazione (un mondo può
  contenere relazioni nate prima del tipo), esattamente come nel mondo di origine.

## Limiti

- `fields` di uno snippet: al massimo 100.000 caratteri; `contentTemplate` deve essere `null` (non ancora usato).
- File fino a 4 MB, al massimo 5.000 snippet, 200 categorie, 50.000 relazioni, 500 tipi di relazione.
- **Non inclusi**: cestino, cronologia versioni, membri e ruoli, immagini (i nodi immagine sono presenti nell'export ma l'importazione li scarta, perché i file restano nel mondo di origine), campagne, viste salvate (arriveranno con i rispettivi task, che estenderanno il formato con una nuova `version`).
- I calendari personalizzati (#26) non sono ancora nel formato: i campi di tipo `calendar_date` vengono esportati e reimportati com'erano, ma il loro
  `calendar` è l'id di un calendario del mondo di origine.
- Import da Markdown/Obsidian/CSV: fatto in #43 (vedi D-043), rotte `POST /api/worlds/import-markdown` e
  `POST /api/worlds/import-csv`.
- **Modelli condivisibili (#43)**: `GET /worlds/<id>/export?template=1` produce lo stesso formato con `snippets` e `relations`
  vuoti — solo categorie (con i loro campi) e tipi di relazione. Nessuna versione o campo nuovo: il file si importa con lo
  stesso percorso JSON già esistente, senza modifiche, e crea un mondo nuovo con la struttura pronta ma senza contenuto.
- **Campi riservati (#32)**: chi esporta trova nel file solo ciò che può leggere. Un campo segreto o condiviso che l'utente può leggere è in `fields` come gli altri e
  compare in `fieldVisibility` dello snippet (`{"debolezza": "secret"}`; chiave facoltativa, assente quando non serve). L'importazione lo rimette nella tabella dei campi
  riservati **come segreto del nuovo mondo** (i destinatari scelti non si esportano) e mai nella colonna pubblica. I livelli `shared` di snippet e relazioni restano `shared`
  senza destinatari, cioè visibili solo a chi scrive.

## Esportazione in Markdown (#100)

`GET /worlds/<id>/export/markdown` produce un archivio ZIP (`application/zip`, solo metodo STORE, nessuna
compressione), pensato anche per essere aperto direttamente in Obsidian:

- `_worldloom.json`: esattamente il documento descritto sopra (stesso schema, stessa `version`). È la fonte di
  verità per il round trip — «l'export deve ricreare il mondo identico» — non i file `.md`.
- Un file `<titolo>.md` per snippet (nome reso sicuro come nell'export JSON dei file, con suffisso numerico in
  caso di titoli doppi), con front matter (`title`, `status`, `visibility`, `archived`, `categories`, `tags`,
  `aliases`, `createdAt`) e il corpo reso in Markdown (sottoinsieme di `markdownToDoc`: titoli, paragrafi,
  liste, citazioni, grassetto/corsivo/codice, link; le menzioni diventano wikilink `[[Titolo]]`). Tabelle e
  immagini non sono rese in Markdown (restano solo in `_worldloom.json`, coi limiti già noti per le immagini).

`POST /api/worlds/import-zip` reimporta l'archivio: legge `_worldloom.json` e lo importa con lo stesso codice
dell'import JSON diretto (stessi limiti, stessa validazione, stessa atomicità). I file `.md` dentro l'archivio
non vengono letti da questa rotta — sono comunque singolarmente compatibili con l'import Markdown esistente
(D-043, best-effort), utile per chi vuole importare solo alcuni file invece dell'intero mondo.
