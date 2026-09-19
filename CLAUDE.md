# Regole permanenti dell'agente

Lavori in autonomia dalla specifica (`SPEC.md`) al prodotto finito. L'utente vuole essere interrotto il meno possibile.

## Fonti di verità
- `SPEC.md`: cosa costruire.
- `docs/PLAN.md`: stato e backlog (rispecchia le issue GitHub). Aggiornalo a ogni task chiuso.
- `docs/DECISIONS.md`: decisioni e risposte dell'utente. Non richiedere due volte la stessa cosa.
- `docs/engineering-guidelines.md` e `docs/design-system.md`: vincolanti.

Dopo un reset di contesto: rileggi questi file e le issue aperte (`gh issue list`), poi continua.

## Autonomia
- Non chiedere conferma per ciò che è reversibile o coperto da questi file.
- Chiedi all'utente solo per: decisioni di prodotto ambigue, segreti, account/servizi a pagamento, azioni che
  solo lui può fare (OAuth, DNS, ecc.). Raggruppa le domande in un solo giro (`AskUserQuestion`) e, se disponibile,
  usa `PushNotification` quando sei bloccato.
- Se sei bloccato da un'azione umana: apri un'issue con label `needs-human`, e prosegui sui task indipendenti.
- Non aggirare i permessi negati. Non eseguire azioni distruttive o irreversibili senza conferma.

## Skill
- Progetto: `frontend-design` (ogni UI), `playwright-e2e` (ogni test UI). Opzionali in `.claude/skills-optional/`
  (da copiare in `.claude/skills/` solo se servono, ad esempio per mappare una codebase esistente).
- Plugin `superpowers` (dichiarato in `.claude/settings.json`): usa `test-driven-development`, `systematic-debugging`,
  `verification-before-completion`. **Precedenza:** le regole di autonomia di questo file battono i flussi interattivi delle skill.
  In particolare non avviare `brainstorming` per ogni issue e non fare domande una alla volta: le domande si fanno in un solo giro
  al `/kickoff`. Non usare i git worktree salvo lavoro davvero parallelo.
- Non c'è review in CI e non c'è alcuna API key Anthropic: la review è locale (subagent `reviewer`, `/security-review`).

## Flusso (trunk-based)
- `main` è sempre rilasciabile. Mai commit o push diretti su `main` (un hook lo impedisce).
- Un branch per issue: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`. Vita breve (meno di un giorno), diff piccoli.
- Commit in Conventional Commits. Una PR per task, con `Closes #N` e il template PR compilato.
- Squash merge con `gh pr merge --auto --squash --delete-branch`, dopo check verdi.
- Prima di ogni nuovo branch: `git switch main && git pull`.

## Definition of Done
1. Lint, typecheck, test unitari, e2e Playwright verdi in locale e in CI.
2. Test scritti prima o insieme al codice. Ogni bug fixato ha un test di regressione.
3. Documentazione aggiornata (README, `docs/`, ADR se la decisione è architetturale).
4. UI conforme a `docs/design-system.md`, con screenshot e a11y testati.
5. Review del subagent `reviewer` eseguita e problemi bloccanti risolti.
6. `docs/PLAN.md` aggiornato.

## Verifica
Non dichiarare mai "fatto" o "funziona" senza aver eseguito i comandi di verifica e letto l'output. Se qualcosa fallisce, dillo.

## Sicurezza
Nessun segreto nel repo. Non leggere `.env*`. Dipendenze minime e motivate.
