#!/usr/bin/env bash
# Configura il repo GitHub corrente secondo le best practice del kit.
# Prerequisiti: gh autenticato (scope repo, workflow), remote origin già creato.
# Uso: bash scripts/setup-repo.sh
set -euo pipefail

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Configuro $REPO"

# 1. Impostazioni generali: solo squash merge, auto-merge, cancellazione branch dopo il merge.
gh api -X PATCH "repos/$REPO" \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY \
  -F has_wiki=false >/dev/null

# 1b. Permessi Actions: release-please deve poter aprire PR.
gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=write \
  -F can_approve_pull_request_reviews=true >/dev/null 2>&1 \
  || echo "ATTENZIONE: impostare a mano Settings > Actions > 'Allow GitHub Actions to create and approve pull requests'." >&2

# 2. Label di base.
for l in "feat:0e8a16" "fix:d73a4a" "chore:cfd3d7" "docs:0075ca" "needs-human:fbca04"; do
  name="${l%%:*}"; color="${l##*:}"
  gh label create "$name" --color "$color" --force >/dev/null
done

# 3. Ruleset su main (richiede repo pubblico o piano Pro/Team).
#    0 approvazioni: l'autore non può approvare la propria PR; il gate sono i check.
RULESET_JSON="$(mktemp)"
cat > "$RULESET_JSON" <<'JSON'
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [ { "context": "ci" } ]
      }
    }
  ]
}
JSON

if gh api -X POST "repos/$REPO/rulesets" --input "$RULESET_JSON" >/dev/null 2>&1; then
  echo "Ruleset main-protection creato."
else
  echo "ATTENZIONE: ruleset non creato (ruleset già presente, oppure piano GitHub non supportato)." >&2
  echo "Verifica in Settings > Rules. Il flusso a PR resta valido per convenzione." >&2
fi
rm -f "$RULESET_JSON"

# 4. Sicurezza: secret scanning e Dependabot (best effort, dipende dal piano).
gh api -X PUT "repos/$REPO/vulnerability-alerts" >/dev/null 2>&1 || true
gh api -X PUT "repos/$REPO/automated-security-fixes" >/dev/null 2>&1 || true

echo "Fatto."
