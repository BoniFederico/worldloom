# Design system

> Questo file va **completato al kickoff** con la palette scelta dall'utente (sezione "Scelte del progetto").
> Fino ad allora valgono le regole generali qui sotto. Ogni schermata deve usare solo i token: niente valori hard-coded.

## Processo

Al kickoff invoca la skill `frontend-design`: produce un piano (palette di 4-6 hex con nome, ruoli tipografici, layout, principi)
e lo verifica contro i default "da template". Il risultato va nella sezione "Scelte del progetto" e diventa la fonte dei token.
Le regole seguenti sono il pavimento di qualità; la skill decide l'identità visiva.

## Principi

1. **Chiarezza prima della decorazione.** Ogni elemento ha una funzione.
2. **Coerenza.** Stessi componenti, stessi spazi, stessa gerarchia in tutto il prodotto.
3. **Accessibilità.** Contrasto WCAG AA, focus visibile, navigazione da tastiera, `prefers-reduced-motion` e `prefers-color-scheme` rispettati.
4. **Contenuto reale.** Testi veri e specifici, mai "Lorem ipsum" né claim generici.

## Token (da definire come CSS variables in `:root` e ridefinire per il dark)

| Categoria  | Token                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colore     | `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-muted`, `--primary`, `--primary-contrast`, `--success`, `--warning`, `--danger` |
| Tipografia | 1-2 famiglie, scala modulare (es. 12/14/16/20/24/32/48), pesi 400/500/600, line-height 1.4-1.6 per il testo                                       |
| Spaziatura | griglia 4px: 4, 8, 12, 16, 24, 32, 48, 64                                                                                                         |
| Raggi      | 2-3 valori (es. 6, 10, 999)                                                                                                                       |
| Ombre      | massimo 2 livelli, sottili                                                                                                                        |
| Motion     | 120-200ms, easing standard; solo per feedback e transizioni di stato                                                                              |

Regole di contrasto: testo normale ≥ 4.5:1, testo grande e componenti UI ≥ 3:1. Verificalo con un calcolo, non a occhio.

## Divieti espliciti (anti "AI slop")

- Gradienti viola/blu-fucsia di default; sfondi a gradiente decorativi.
- Glassmorphism, blur e glow usati come stile generale.
- Card dentro card dentro card; ombre pesanti; bordi arrotondati enormi ovunque.
- Emoji al posto delle icone. Un solo set di icone (es. Lucide) a dimensioni coerenti.
- Hero generici ("Welcome to…", "Supercharge your…"), testimonial e metriche inventati.
- Font di default del sistema/Inter senza averlo deciso: il font è una scelta registrata.
- Animazioni gratuite, parallax, elementi che si muovono senza motivo.
- Colori fuori palette, ombre e spaziature "a occhio".

## Stati obbligatori per ogni vista

Vuoto, caricamento (skeleton o indicatore coerente), errore (con azione di recupero), successo dove rilevante, disabilitato, focus.

## Layout e responsive

Mobile-first. Breakpoint definiti una volta sola. Nessuno scroll orizzontale. Target touch ≥ 44px. Larghezza di lettura dei testi ≤ 70 caratteri.

## Verifica

- Playwright: screenshot mobile e desktop, light e dark; axe senza violazioni serious/critical.
- Il reviewer controlla la conformità a questo file su ogni PR di UI.

## Scelte del progetto (compilate al kickoff)

Direzione **A · Cartografo** (D-001): calmo, da atlante moderno; carta grigio-verde fredda, inchiostro blu notte, teal marino.
Niente fantasy da pergamena. Un solo elemento memorabile: i **segni cartografici** (rosa dei venti, tratteggi di rotta,
reticolo) usati con parsimonia in stati vuoti e viste, sempre monocromatici in `--border`/`--text-muted`.

### Colori (contrasti calcolati, WCAG)

| Token                                                  | Light   | Dark    |
| ------------------------------------------------------ | ------- | ------- |
| `--bg`                                                 | #F2F4F1 | #0E1719 |
| `--surface`                                            | #FFFFFF | #152226 |
| `--surface-2`                                          | #E9EDEA | #1C2D32 |
| `--border` (divisori, decorativo)                      | #CBD3CF | #2D4147 |
| `--border-strong` (bordi di controlli, 3:1)            | #75868A | #5E7A80 |
| `--text`                                               | #16232B | #E4ECEC |
| `--text-muted`                                         | #4A5B63 | #9DB1B4 |
| `--primary`                                            | #0F6E75 | #4FB3BA |
| `--primary-contrast`                                   | #FFFFFF | #0E1719 |
| `--accent` (ottone: evidenziazioni, non testo piccolo) | #94691A | #D4A64A |
| `--success`                                            | #276B42 | #58B77F |
| `--warning`                                            | #8A5A00 | #E0A93B |
| `--danger`                                             | #B3372F | #E77A70 |

Contrasto minimo misurato: testo su bg/surface ≥ 13:1, muted ≥ 6:1, primary ≥ 5.4:1 su bg, primary-contrast su primary ≥ 6:1,
`--border-strong` su bg ≥ 3.4:1. `--accent` chiaro (4.4:1 su bg) vale per testo grande e componenti, non per testo piccolo.
Il tema segue `prefers-color-scheme` e può essere forzato con `data-theme="light|dark"`.

### Tipografia

- **Source Serif 4**: contenuto degli snippet e testo lungo (line-height 1.65, misura ≤ 68ch).
- **Schibsted Grotesk**: interfaccia, viste, etichette (pesi 400/500/600).
- Scala: 12 / 14 / 16 / 20 / 24 / 32 / 48. Titoli in sentence case. Niente maiuscoletto per le etichette.
- Font self-hosted tramite `next/font`.

### Icone

Lucide (`lucide-react`), 1.5px di tratto, 16/20/24 px. Mai emoji.

### Forme e layout

Raggi 4 / 8 / 999. Un solo livello di ombra sottile per popover e menu; le superfici si distinguono con bordo, non con ombra.
Breakpoint: 640 / 1024 / 1440. Editor: colonna di lettura centrata, pannelli laterali (collegamenti, relazioni) comprimibili.
Viste: massima densità, allineamento a sinistra, dati tabellari con cifre tabulari.

### Scala tipografica compatta per l'interfaccia (D-052)

La scala 12/14/16/20/24/32/48 resta per il **contenuto** (testo serif degli snippet, dove la leggibilità di lettura
prolungata conta più della densità). Per l'**interfaccia** (etichette, controlli, tabelle, menu — Schibsted Grotesk)
la base scende da 16 a 14px: la densità percepita conta più della leggibilità di un testo lungo, e 14px con
line-height 1.5 resta ben sopra la soglia di accessibilità (nessun testo sotto i 12px).

| Ruolo                          | Prima | Ora              |
| ------------------------------ | ----- | ---------------- |
| Corpo UI (default)             | 16px  | 14px             |
| Etichette, meta, celle tabella | 14px  | 12px             |
| Titolo di sezione (h2/h3 UI)   | 20px  | 18px             |
| Titolo di pagina (h1 UI)       | 24px  | 22px             |
| Contenuto snippet (serif)      | 16px  | 16px (invariato) |

Nessun valore sotto i 12px. Verificare comunque il contrasto e il target touch (44px) restano validi: la riduzione
è sul testo, non sui bersagli interattivi (bottoni/icone restano ≥ 36px di lato, vedi sotto).

### Stati di caricamento (D-052)

Tre pattern, scelti in base alla durata e alla superficie coinvolta — mai un'attesa senza feedback:

1. **Barra di avanzamento di navigazione** (cambio pagina/route): striscia di 2px in `--primary` in cima alla
   finestra, indeterminata (scorre da sinistra), compare solo se la navigazione supera 150ms (nessun lampo su
   risposte già veloci) e scompare con un fade di 150ms al termine. Rispetta `prefers-reduced-motion`: se attivo,
   niente scorrimento, solo comparsa/scomparsa statica.
2. **Skeleton screen** (contenuto che sta per apparire in un'area nota: liste, tabelle, pannello snippet): forme
   piatte `--surface-2` che ricalcano la sagoma reale del contenuto (righe di testo, celle, avatar), **non** un
   riquadro generico. Aggiunge/toglie solo opacità in loop lento (1.5s) se `prefers-reduced-motion` non è attivo;
   altrimenti statico. Usato per liste ampie della vista tabella/grafo/elenco snippet (D-051: qui il ritardo può
   essere reale, non solo percepito).
3. **Spinner inline** (azione puntuale: submit di un form, bottone "Salva"): icona Lucide `loader-circle` animata,
   16px, dentro il bottone stesso al posto dell'icona o accanto al testo; il bottone passa a `disabled` e il testo
   resta invariato (mai sostituito da "Caricamento…", per non spostare il layout).

Implementazione: `loading.tsx`/`Suspense` per ogni route segment che fa query server-side non banali (oggi assenti
in tutto `src/app`, causa principale della lentezza percepita secondo D-051); la barra di navigazione è un
componente globale nello shell applicativo, non per-pagina.

### Interazioni hover e focus (D-052)

Oggi mancano quasi ovunque: le regole cambiano da "assenti" a "sempre presenti ma discrete", mai decorative.

- **Bottoni e controlli**: hover sposta il colore di sfondo di un solo passo verso `--surface-2`/`--border`
  (mai un'ombra, mai un ingrandimento/scale). Transizione 150ms, `ease-out`.
- **Righe di tabella e liste**: hover aggiunge `--surface-2` come sfondo dell'intera riga, nessun bordo o ombra
  aggiuntivi.
- **Link testuali**: sottolineatura sempre presente ma con `text-decoration-color` più tenue (`--text-muted`) a
  riposo, che si scurisce in `--text` all'hover — mai un cambio di colore del testo stesso.
- **Focus**: `outline` 2px `--primary`, offset 2px, sempre visibile con `:focus-visible` (mai `outline: none` senza
  sostituto). Nessun anello di focus attenuato o solo sul bordo inferiore: deve restare leggibile a chi naviga da
  tastiera.
- Vietate le animazioni di hover che non rispondono a un'azione (nessun "respiro", nessun tilt, nessun bordo che
  ruota): la lista sopra è esaustiva, non un punto di partenza.

### Barra di navigazione superiore (D-052, per #110)

Sostituisce l'attuale riga di controlli non curata (incluso il selettore testuale "Sistema / Chiaro / Scuro").

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Worldloom]   Nome del mondo ›  Sezione            🔍  🌓  🌐  ⚉    │  48px
└─────────────────────────────────────────────────────────────────────┘
```

(i simboli sopra sono un segnaposto schematico per le icone Lucide descritte sotto — mai emoji reali nell'interfaccia.)

- Altezza 48px, sfondo `--surface`, `border-bottom: 1px solid --border`. Nessuna ombra.
- Sinistra: wordmark (testo, non icona — il prodotto non ha ancora un logo) + un breadcrumb minimo (nome del
  mondo corrente › sezione), non l'intera gerarchia di navigazione (quella vive nella barra di schede, sotto).
- Destra: **solo icone**, mai testo esposto permanentemente. Ogni controllo è un bottone quadrato 36×36px con
  un'icona Lucide 20px, `title`/`aria-label` esplicito, tooltip nativo al hover/focus. Ordine fisso: ricerca
  (Ctrl/Cmd+K, icona lente), tema (icona che cambia fra sole/luna/monitor a seconda dello stato — un solo bottone
  che cicla sistema→chiaro→scuro→sistema, non un menu a tendina con tre voci scritte), lingua (icona globo, apre
  un menu con le due opzioni), account (avatar circolare 28px con iniziale, apre il menu utente).
- Spaziatura fra i controlli di destra: 4px; padding orizzontale della barra: 16px.
- Il selettore tema esistente (oggi testuale "Sistema/Chiaro/Scuro" sempre visibile) va sostituito da questo unico
  bottone ciclico: il verdetto (quale dei tre stati è attivo) si comunica con l'icona stessa, non col testo.

### Barra di schede persistente (D-052, per #112)

Sotto la barra superiore, sempre visibile quando almeno un mondo è aperto. Sostituisce la navigazione oggi isolata
per sezione: permette di avere più sezioni di uno stesso mondo aperte insieme (uno snippet, una vista, il pannello
relazioni) senza perdere il contesto precedente.

```
┌──────────────┬──────────────────┬───────────────┬──┐
│ 📄 Elara  ×  │ ▦ Tabella      × │ 🕸 Grafo    ×│ +│  36px
└──────────────┴──────────────────┴───────────────┴──┘
```

(idem: segnaposto schematico per icone Lucide, non emoji.)

- Altezza 36px, sfondo `--bg` (un livello sotto la barra superiore in `--surface`, per leggere lo stacking).
- Ogni scheda: icona 14px del tipo di sezione (snippet, categoria, vista tabella/grafo/timeline/mappa/albero/
  kanban, relazioni, sessione...), etichetta troncata a ~20 caratteri con ellissi, bottone di chiusura (×) che
  appare solo al hover della scheda (per non affollare la barra a riposo).
- Scheda attiva: sfondo `--surface`, bordo superiore 2px `--primary` (unico accento cromatico della barra — niente
  colore sulle schede inattive). Schede inattive: sfondo trasparente, testo `--text-muted`.
- Overflow orizzontale con scroll (mai wrap su più righe); un bottone `+` fisso a destra per la ricerca rapida
  (stessa palette comandi di Ctrl/Cmd+K) invece che una scheda "nuova".
- Persistenza: le schede aperte si salvano per mondo in `localStorage` (solo lato client, per-dispositivo — non è
  stato condiviso, coerente con l'uso già fatto di `localStorage` per il tema); si ripristinano riaprendo il
  mondo, non si sincronizzano fra dispositivi.
- Chiusura: click sulla ×, tasto centrale del mouse, o `Ctrl/Cmd+W` sulla scheda attiva. Niente scheda "fissata"
  in questa prima versione (fuori scope, valutare se emerge il bisogno).
