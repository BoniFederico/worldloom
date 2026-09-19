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
