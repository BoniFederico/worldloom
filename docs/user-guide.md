# Guida utente

Una guida breve per iniziare a usare Worldloom. Per i dettagli tecnici vedi [export-format.md](export-format.md)
(formati di import/export) e [stats-schema.md](stats-schema.md) (schema delle statistiche).

## Account e primi passi

Registrati con email e password (o con GitHub) da `/signup`. Il primo accesso richiede di confermare
l'indirizzo email (o è già confermato con GitHub). Da `/worlds` crei il tuo primo **mondo**: diventi
automaticamente proprietario e puoi invitare altre persone come membri (`/worlds/<id>/members`), con un ruolo —
proprietario, editor, commentatore o lettore — che decide cosa possono scrivere o solo leggere.

## Categorie e snippet

Un mondo è fatto di **snippet**: personaggi, luoghi, oggetti, eventi, qualunque cosa tu voglia descrivere.
Ogni snippet appartiene a una o più **categorie**, che definiscono campi personalizzati tipizzati (testo,
numero, data, selezione, riferimento a un'altra categoria...). Le categorie hanno anche preset pronti (fantasy,
fantascienza, investigativo...) da `/worlds/<id>/categories`. Ogni snippet ha un testo ricco (titoli, liste,
grassetto, link, immagini), tag, alias, uno stato bozza/definitivo e una visibilità.

## Relazioni e menzioni

Colleghi due snippet con una **relazione**: un'etichetta libera («abita a», «nemico di»...) e, se vuoi, la sua
inversa, note e un periodo di validità. Scrivendo `@` nel testo di uno snippet e scegliendo un altro snippet crei
una **menzione**: appare come link nel testo e genera automaticamente una relazione «menziona», visibile anche
come backlink nello snippet menzionato.

## Viste

Lo stesso mondo si guarda in modi diversi da `/worlds/<id>/`: **tabella** (colonne dai campi, ordinamento,
filtri), **grafo** delle relazioni, **timeline** (con calendari personalizzati), **mappa** con pin e mappe
annidate, **albero** genealogico da un'etichetta di relazione, **bacheca kanban** da uno stato o campo. Ogni
vista si può salvare e condividere con un link stabile (`/worlds/<id>/views`).

## Campagne

Sopra il mondo, una **campagna** aggiunge: **visibilità per elemento** (segreto, condiviso con qualcuno,
visibile ai membri, pubblico) con un registro di chi ha rivelato cosa; **statistiche** configurabili per
personaggio con un editor di schema e formule; **schede personaggio** generate dallo schema; **sessioni** con
diario e bacheca messaggi; **tiratore di dadi** con notazione standard e tiri privati del DM; **tracker di
iniziativa** per gli scontri, con condizioni e punti ferita presi dalla scheda.

## Import ed export

Da `/worlds/<id>` esporti il mondo in **JSON** (fedeltà completa, per farne un backup o duplicarlo) o in
**Markdown** (un archivio .zip con un file per snippet, apribile anche in Obsidian). Da `/worlds/import` importi
un file JSON, un archivio Markdown esportato da Worldloom, file Markdown/Obsidian sciolti, o un CSV. Puoi anche
esportare un mondo **come modello** (solo struttura, senza contenuto) da condividere con altri come punto di
partenza. Dettagli in [export-format.md](export-format.md).

## Wiki pubblica

Se vuoi condividere il tuo mondo con chiunque, anche senza account, attiva la wiki pubblica dalle impostazioni
del mondo: solo il contenuto con visibilità «pubblico» diventa una pagina web navigabile con URL leggibili.

## Account e privacy

Da `/account` scarichi i tuoi dati personali o cancelli l'account (l'eliminazione blocca se possiedi ancora
mondi o campagne: trasferiscili o eliminali prima). Cosa raccogliamo e perché è spiegato in `/privacy`.
