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
- Le relazioni e i tipi rispettano i vincoli del mondo in scrittura: un file con una relazione che viola un vincolo di tipo viene
  rifiutato.

## Limiti

- File fino a 4 MB, al massimo 5.000 snippet, 200 categorie, 50.000 relazioni, 500 tipi di relazione.
- **Non inclusi**: cestino, cronologia versioni, membri e ruoli, file delle immagini (i nodi immagine del testo restano ma puntano
  al mondo di origine), campagne, viste salvate (arriveranno con i rispettivi task, che estenderanno il formato con una nuova `version`).
- Export in Markdown con front matter e import da Markdown/Obsidian/CSV: vedi #43.
