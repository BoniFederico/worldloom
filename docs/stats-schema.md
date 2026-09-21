# Schema di statistiche

Uno schema di statistiche è un documento JSON versionato che descrive le schede personaggio di una campagna. Da esso
si generano i campi, i valori calcolati e i limiti. Il codice è in `src/lib/stats/`; la forma è descritta anche da
[`src/lib/stats/stats.schema.json`](../src/lib/stats/stats.schema.json) (JSON Schema draft-07, controlla la sola struttura).

## Forma

```json
{
  "schemaVersion": 1,
  "name": "Fantasy d20 semplificato",
  "attributes": [
    { "key": "str", "label": "Forza", "type": "integer", "min": 1, "max": 30, "default": 10 }
  ],
  "derived": [{ "key": "str_mod", "label": "Mod. Forza", "formula": "floor((str - 10) / 2)" }],
  "resources": [
    { "key": "hp", "label": "Punti ferita", "type": "pool", "maxFormula": "10 + str_mod * level" }
  ],
  "lists": [{ "key": "skills", "label": "Abilità", "item": { "name": "text", "rank": "integer" } }],
  "text": [{ "key": "background", "label": "Background" }],
  "layout": [{ "section": "Combattimento", "fields": ["hp", "str"] }]
}
```

| Sezione      | Campi                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------- |
| (documento)  | `schemaVersion` (deve essere `1`), `name` (obbligatori); `description` facoltativa (500 caratteri) |
| `attributes` | `key`, `label`, `type` (`integer` o `number`); `min`, `max`, `default` facoltativi                 |
| `derived`    | `key`, `label`, `formula`                                                                          |
| `resources`  | `key`, `label`, `type: "pool"` e **una sola** tra `max` (numero ≥ 0) e `maxFormula`                |
| `lists`      | `key`, `label`, `item`: da 1 a 12 colonne `nome → text \| integer \| number`                       |
| `text`       | `key`, `label`                                                                                     |
| `layout`     | sezioni `{ section, fields }` con le chiavi dei campi da mostrare                                  |

Le sezioni assenti valgono «vuote». Campi non previsti sono errori (`unknown_field`), così un refuso non passa in silenzio.

Limiti: al massimo 200 voci per sezione, testo del documento fino a 200.000 caratteri (unità UTF-16, non byte; chiavi ripetute nello stesso oggetto: vince l'ultima, come in `JSON.parse`), chiavi `^[a-z][a-z0-9_]{0,31}$`
(uniche in tutto lo schema), etichette da 1 a 80 caratteri.

## Formule

Un'espressione aritmetica. Non è JavaScript: non c'è `eval`, non ci sono oggetti né accesso a rete, file o globali.

- Numeri decimali, variabili, parentesi. Operatori `+ - * / %`, confronti `< <= > >= == !=`, logica `&& || !`
  (i booleani sono `1` e `0`), meno unario.
- Funzioni: `floor ceil round trunc abs sign sqrt pow min max clamp if`. `if(cond, a, b)` valuta solo il ramo scelto. `min` e `max`
  accettano fino a 16 argomenti. `pow` accetta esponenti fino a 1024 in valore assoluto; `sqrt` di un negativo è un errore.
- Variabili: ogni attributo e ogni derivato per chiave. Le formule vedono **solo attributi e derivati**; le risorse non sono
  visibili. Il nome `<chiave>_max` di ogni risorsa è riservato (lo useranno schede e tiratore di dadi), quindi non si può usare come chiave.
- Nomi delle funzioni (`floor`, `if`, `min`…) non si possono usare come chiavi (`reserved_key`).
- I derivati si calcolano nell'ordine delle dipendenze; un ciclo è un errore (`formula_cycle`).

Limiti dell'interprete: formula fino a 500 caratteri, 120 nodi, annidamento 32, 2.000 passi di valutazione e 20 ms. Oltre:
`too_long`, `too_complex`, `budget_exceeded`. I limiti sono parametri di chi chiama (`maxSteps`, `maxMillis`): non devono mai arrivare da input utente. Un letterale
non finito (per esempio 400 cifre) è `invalid_number`; nessun risultato può essere `Infinity` o `NaN`.

## Errori

`validateStatsText(testo)` restituisce `{ ok: true, schema, derivedOrder }` oppure `{ ok: false, errors }`. Ogni errore ha:

- `code`, `path` (per esempio `derived[0].formula`), `field` (ultimo pezzo del percorso);
- `line` e `column` (da 1) nel testo JSON; un campo mancante punta al contenitore, un campo sconosciuto punta alla sua chiave;
- `detail` (per esempio il codice dell'errore di formula o il nome che non esiste) e, per le formule, `index` (0-based nella formula).

Codici: `too_large`, `json_syntax`, `required`, `invalid_type`, `invalid_value`, `invalid_key`, `out_of_range`,
`too_many_fields`, `unknown_field`, `unsupported_version`, `duplicate_key`, `reserved_key`, `invalid_range`, `max_required`,
`max_conflict`, `formula` (sintassi: `detail` = `empty`, `too_long`, `too_complex`, `unexpected_char`, `unexpected_token`,
`unexpected_end`, `invalid_number`, `unknown_function`, `wrong_arity`), `unknown_reference`, `formula_cycle`.

Errori di valutazione (in `computeSheet`, per una scheda concreta): `unknown_variable`, `division_by_zero`, `domain`,
`not_finite`, `budget_exceeded`, `dependency_failed` (dipende da un derivato che non si è potuto calcolare). Una formula che fallisce dà `null` per quella voce e non ferma le altre.

## Calcolo

`computeSheet({ schema, derivedOrder }, valori)` restituisce i valori usati per gli attributi (il predefinito, altrimenti il
minimo, altrimenti 0, se non sono dati), i derivati, il massimo di ogni risorsa (mai negativo) e gli errori.
`checkAttributeValues(schema, valori)` controlla tipo, interezza e intervallo dei valori inseriti.

## Preset

`STATS_PRESETS` (`src/lib/stats/presets.ts`): `d20`, `percentile` (punteggi a percentuale con soglie), `dice-pool` (pool di dadi)
e `narrative` (approcci a tratti con punti destino e stress). Ciascuno è valido, si calcola senza errori ed è coperto da test.

## Nell'app

Lo schema si scrive in `/campaigns/<id>/stats` (solo il DM: editor JSON con errori con riga e colonna, preset, ripristino del predefinito). Le schede
personaggio (`/campaigns/<id>/characters`) si generano da esso; vedi D-034 in `docs/DECISIONS.md`. Nelle liste le intestazioni delle colonne sono le chiavi di `item`.

Non ancora presente (issue successive): migrazione dello schema con schede esistenti (#35), tiratore di dadi (#39).
