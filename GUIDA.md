# Guida: setup per sviluppo autonomo con Claude Code in VS Code

Obiettivo: partire da una repo vuota, fornire una specifica (`SPEC.md`) e lasciare che l'agente
crei la repo GitHub, pianifichi, sviluppi con trunk-based development, testi, apra PR, le riveda,
le mergi e prosegua fino alla fine, interrompendo l'utente solo quando serve.

Le parti riusabili vivono in questo repo, **`claude-code-project-scaffold`**, usato come *template repository* GitHub.
Ogni nuovo progetto parte da qui.

## Fase 0: prerequisiti (una tantum)

1. Installa Git, Node LTS e GitHub CLI (`winget install GitHub.cli`).
2. `gh auth login` con scope `repo`, `workflow`, `admin:repo_hook`. Verifica con `gh auth status`.
3. Installa l'estensione Claude Code per VS Code ed effettua il login.
4. **Nessuna API key Anthropic.** Usi solo l'estensione VS Code già autenticata: la review non gira in CI ma in locale
   (subagent `reviewer`, `/security-review`).
5. Plugin `superpowers` installato a livello utente (fornisce le skill TDD, debugging, verification usate dai comandi).
6. **Piano GitHub.** Su repo *privati* con account Free, rulesets e auto-merge non sono disponibili.
   Usa repo pubblici oppure un piano Pro/Team.
7. Consigliato: WSL o devcontainer, se vuoi dare permessi ampi all'agente (vedi Fase 4).

## Fase 1: struttura del repo template

```
claude-code-project-scaffold/
├─ CLAUDE.md                     regole permanenti dell'agente
├─ SPEC.md                       specifiche (le compili tu)
├─ .claude/
│  ├─ settings.json              permessi e hook
│  ├─ hooks/guard-main.mjs       blocca commit/push su main
│  ├─ commands/kickoff.md        /kickoff: domande + setup repo + backlog
│  ├─ commands/run.md            /run: loop autonomo fino a fine piano
│  ├─ agents/reviewer.md, ui-tester.md
│  ├─ skills/frontend-design, playwright-e2e     caricate di default
│  └─ skills-optional/                           da copiare in skills/ solo se servono
├─ docs/
│  ├─ engineering-guidelines.md  test, docs, NFR, Definition of Done
│  ├─ design-system.md           token, palette, anti "AI slop"
│  ├─ PLAN.md                    stato e backlog (lo mantiene l'agente)
│  └─ DECISIONS.md               risposte alle domande e ADR
├─ .github/
│  ├─ workflows/ci.yml, release-please.yml, codeql.yml
│  ├─ dependabot.yml, pull_request_template.md, CODEOWNERS, ISSUE_TEMPLATE/task.md
└─ scripts/setup-repo.sh         impostazioni repo + ruleset via gh
```

Su GitHub: Settings → "Template repository". Poi per ogni progetto:
`gh repo create mio-progetto --template BoniFederico/claude-code-project-scaffold --public --clone`.

## Fase 2: contenuto dei file chiave

- **`CLAUDE.md`**: autonomia, flusso trunk-based, Definition of Done, fonti di verità, ripresa dopo reset di contesto, verifica prima di dichiarare "fatto".
- **`SPEC.md`**: obiettivo, utenti, funzionalità prioritizzate, vincoli tecnici, NFR, fuori scope, criteri di accettazione. Più è concreto, meno domande riceverai.
- **`docs/design-system.md`**: token CSS (colori con ruoli light/dark, tipografia, spaziature, raggi), contrasto WCAG AA, lista di divieti anti "AI slop", stati obbligatori (vuoto/loading/errore).
- **`docs/engineering-guidelines.md`**: piramide dei test, Playwright (flussi critici, screenshot regression, axe a11y), documentazione, sicurezza.
- **`.claude/settings.json`**: allowlist per git/gh/npm, deny per comandi distruttivi e lettura di `.env`, hook PreToolUse che vieta commit e push su `main`.
- **`/kickoff`**: legge SPEC, fa **un solo giro** di domande, setup repo, scaffolding, backlog come issue GitHub, prima PR.
- **`/run`**: loop issue → branch → TDD → verifica → PR → review subagent → auto-merge → aggiorna PLAN, finché il piano non è finito.
- **Subagent**: `reviewer` (sola lettura) e `ui-tester` (Playwright).

## Fase 3: setup GitHub (`scripts/setup-repo.sh`)

1. Impostazioni: solo squash merge, auto-merge, delete branch on merge.
2. Ruleset su `main`: PR obbligatoria, history lineare, no force-push/cancellazione, check richiesto `ci`, **0 approvazioni**.
   GitHub non permette di approvare la propria PR e l'agente usa la tua identità `gh`, quindi il gate reale è la CI.
3. Workflow: CI (lint, typecheck, unit, build, Playwright), release-please, CodeQL, Dependabot.
4. **Review in locale, non in CI.** Prima del merge l'agente lancia il subagent `reviewer` (contesto pulito, sola lettura) e, per
   codice sensibile, `/security-review`. Limite: è comunque un modello che rivede il lavoro di un modello.

## Skill

| Skill | Decisione | Motivo |
|---|---|---|
| `frontend-design` | **default** | Cuore dell'anti "AI slop": impone un piano di design specifico al brief e una lista di default da evitare. Usata al kickoff e su ogni UI. |
| `playwright-e2e` (scritta per il kit) | **default** | Fissa config, selettori, axe, screenshot e la regola "baseline solo da Linux". |
| `create-implementation-plan` | opzionale | Genera piani in `/plan/` pensati per esecuzione AI, pesanti e duplicano `docs/PLAN.md` + issue. Utile solo per epiche grandi. |
| `architecture-blueprint-generator` | opzionale | Documenta architetture *esistenti*; nel greenfield basta `docs/architecture.md`. |
| `acquire-codebase-knowledge` | opzionale | Onboarding su codebase esistenti; serve se si adotta il kit su un progetto già avviato. |

Le skill caricate aggiungono la loro descrizione al contesto a ogni sessione, quindi meno sono, meglio è.
Le skill di processo (TDD, debugging, verification) vengono dal plugin `superpowers`; `CLAUDE.md` stabilisce che, in caso di
conflitto, le regole di autonomia del kit vincono sui flussi interattivi delle skill.

## Fase 4: permessi e sicurezza

1. **Allowlist + deny** (già nel kit). Parti da qui.
2. Auto mode, se disponibile sul tuo piano.
3. `--dangerously-skip-permissions`: **solo** in devcontainer/WSL isolato.

Usa un token GitHub a scope minimo o un account bot. Con un bot puoi richiedere 1 approvazione umana e farla dare al bot.

## Fase 5: uso quotidiano

1. Crea il repo dal template e aprilo in VS Code.
2. Compila `SPEC.md`.
3. `/kickoff` → rispondi a un solo giro di domande.
4. `/run` → l'agente lavora.
5. Ti interrompe solo per segreti/account, decisioni di prodotto ambigue, errori irrisolti dopo N tentativi.
6. Sessione chiusa o contesto pieno? Apri una nuova conversazione nel pannello Claude Code (o riprendi una passata dalla cronologia)
   ed esegui `/run`: lo stato è in `docs/PLAN.md` e nelle issue, non nella conversazione.

## Limiti noti

- Il contesto viene compattato: lo stato deve stare su disco e su GitHub.
- CodeQL gira solo sui repo pubblici (su quelli privati richiede GitHub Advanced Security). Su repo privati con piano Free
  non funzionano nemmeno i ruleset: `setup-repo.sh` lo segnala e il flusso a PR resta valido per convenzione, protetto solo dall'hook locale.
- Tieni d'occhio costi (token e minuti Actions).
- La review modello-su-modello non sostituisce un umano nei progetti critici.
- Gli screenshot baseline dipendono dall'OS: generali su Linux (CI o container Playwright).
- Verifica sulla documentazione corrente: schema degli hook e di `settings.json`, e come l'estensione VS Code imposta la modalità
  di permessi (selettore nel pannello) rispetto a `defaultMode`.
- Volendo una review in CI più avanti, `anthropics/claude-code-action` è un'opzione a parte (richiede credenziali): non fa parte del kit.

## Stato implementazione di questo repo

Implementati: tutti i file elencati in Fase 1. Da fare a mano una tantum: installare `gh`, marcare il repo come template su GitHub
e la prova end-to-end su un progetto di test.
