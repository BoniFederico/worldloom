---
description: Avvio progetto: legge SPEC, fa un solo giro di domande, configura repo GitHub, scaffolda e crea il backlog
---

Esegui il kickoff del progetto. Segui questi passi in ordine, senza saltarne.

1. **Leggi** `SPEC.md`, `CLAUDE.md`, `docs/engineering-guidelines.md`, `docs/design-system.md`. Se SPEC.md è ancora il template non compilato, fermati e chiedi all'utente di compilarlo.
2. **Domande, un solo giro.** Usa `AskUserQuestion` (max 4 domande per chiamata) per tutto ciò che SPEC non chiarisce e che non puoi decidere con un default sensato: stack (se non specificato), hosting, nome/visibilità repo, licenza e, se c'è una UI, **scelta tra 2 proposte di palette/stile** che descrivi con token concreti. Non chiedere ciò che ha una risposta convenzionale: scegli e annota.
3. **Registra** tutte le risposte e le tue scelte in `docs/DECISIONS.md` (una voce per decisione: contesto, scelta, motivo).
4. **Repo GitHub.** Se non esiste un remote: `gh repo create`. Poi `bash scripts/setup-repo.sh` (impostazioni + ruleset). Se il piano GitHub non supporta i ruleset, segnalalo all'utente e usa comunque il flusso a PR.
5. **Segreti e servizi.** Nessuna API key Anthropic: la review è locale (subagent `reviewer`). Chiedi all'utente solo i segreti che servono davvero al progetto (hosting, servizi di terzi), nello stesso giro di domande del passo 2 quando possibile.
6. **Scaffolding** su branch `chore/scaffold`: progetto secondo lo stack scelto con linter, formatter, TypeScript strict (se applicabile), test runner, Playwright (se c'è una UI web), husky + lint-staged + commitlint, script npm `lint`, `typecheck`, `test`, `build`, `test:e2e`. Prima di definire la palette invoca la skill `frontend-design` (piano di design: colori, tipografia, layout, principi) e completa la sezione "Scelte del progetto" di `docs/design-system.md`; poi traduci i token in codice (CSS variables). Per i test UI segui la skill `playwright-e2e`. Aggiorna README e `docs/architecture.md`.
7. **Backlog.** Scomponi SPEC in issue piccole (una PR ciascuna, meno di un giorno), con label (`feat`, `chore`, `needs-human`), milestone e criteri di accettazione. Rispecchiale in `docs/PLAN.md` con ordine e dipendenze. Le issue di infrastruttura (CI verde, test e2e base) vengono prima delle feature.
8. **Prima PR**: apri, verifica CI, fai review con il subagent `reviewer`, mergia con `gh pr merge --auto --squash --delete-branch`.
9. Concludi con un riepilogo breve e indica di eseguire `/run`.
