---
description: Loop autonomo: implementa il backlog issue per issue (branch, PR, review, merge) fino a fine piano
---

Porta avanti il progetto in autonomia fino al completamento del piano. Riparti sempre dallo stato su disco:
leggi `docs/PLAN.md`, `docs/DECISIONS.md` e `gh issue list --state open`.

Ripeti finché ci sono issue aperte non bloccate:

1. Scegli la prossima issue secondo l'ordine di `docs/PLAN.md`. Salta quelle con label `needs-human` non ancora risolte.
2. `git switch main && git pull && git switch -c <tipo>/<slug>`.
3. Implementa in TDD (skill `superpowers:test-driven-development`): test che fallisce, codice minimo, refactor. Se tocchi la UI, usa la skill `frontend-design`, rispetta `docs/design-system.md` e aggiungi/aggiorna test Playwright (skill `playwright-e2e`; puoi delegare al subagent `ui-tester`). Se un bug resiste, usa `superpowers:systematic-debugging`.
4. Verifica locale (skill `superpowers:verification-before-completion`): lint, typecheck, test, build, e2e. Leggi l'output. Non procedere con test rossi.
5. Aggiorna la documentazione toccata (README, `docs/`, ADR in DECISIONS.md se serve).
6. Commit Conventional, `git push -u origin <branch>`, `gh pr create` con il template compilato e `Closes #N`.
7. Review locale (non c'è review in CI): lancia il subagent `reviewer` sul diff della PR, che parte con contesto pulito. Per PR che toccano autenticazione, dati utente, input esterni o dipendenze esegui anche `/security-review`. Correggi i problemi bloccanti, ripeti la verifica, pusha.
8. `gh pr merge --auto --squash --delete-branch`. Attendi che i check siano verdi e la PR sia mergiata (`gh pr checks --watch`). Se la CI fallisce, diagnostica la causa radice e correggi; dopo 3 tentativi falliti sulla stessa causa, apri issue `needs-human` e passa oltre.
9. `git switch main && git pull`, aggiorna `docs/PLAN.md` (issue chiusa, note utili), poi ripeti.

**Interruzioni umane.** Se serve una decisione, un segreto o un'azione che solo l'utente può fare: raggruppa le richieste, usa `AskUserQuestion` (o issue `needs-human` + `PushNotification` se l'utente non è presente), e nel frattempo continua su issue indipendenti. Non chiedere nulla che sia già in DECISIONS.md.

**Fine.** Quando non restano issue: verifica il prodotto contro i criteri di accettazione di SPEC.md (esegui davvero app e test), assicurati che release-please abbia prodotto la release/CHANGELOG, aggiorna il README e riassumi all'utente cosa è stato fatto, cosa resta e i limiti noti.
