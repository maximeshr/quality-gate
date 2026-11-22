#!/usr/bin/env bash
# Apply the OKQ GitHub settings to one repository. Dry run by default: prints what it would do.
#
# Usage: apply-settings.sh <owner/repo> [--apply] [--checks "check one,check two"]
#   --checks  required status checks for both rulesets, besides the quality-gate ones
#             (e.g. the project's CI job names: "ubuntu-latest,macos-latest,node 22,node 24").
#             `report / report` and `changesets / changeset` are always required: add them only once
#             the project runs `quality.yml`, or pull requests stay blocked.
#   --no-gate-checks  leave `report / report` and `changesets / changeset` out (before quality.yml exists).
#
# Order matters: `canary` and the rulesets exist before the default branch moves, so `main` is never
# left unprotected. Idempotent: an existing branch, key, secret or ruleset is kept (rulesets are updated).
set -euo pipefail

REPO="${1:?usage: apply-settings.sh <owner/repo> [--apply] [--checks \"a,b\"] [--no-gate-checks]}"
shift
APPLY=0
EXTRA_CHECKS=""
GATE_CHECKS=1
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --checks) EXTRA_CHECKS="$2"; shift ;;
    --no-gate-checks) GATE_CHECKS=0 ;;
    *) echo "unknown option $1"; exit 2 ;;
  esac
  shift
done

run() {
  if [ "$APPLY" = 1 ]; then echo "+ $*"; "$@"; else echo "would: $*"; fi
}
[ "$APPLY" = 1 ] || echo "Dry run for $REPO (add --apply to change it)."

# 1. Merge button: merge commits only.
run gh api -X PATCH "repos/$REPO" -F allow_merge_commit=true -F allow_squash_merge=false -F allow_rebase_merge=false -F delete_branch_on_merge=true --silent

# 2. canary, created from main when missing.
if gh api "repos/$REPO/branches/canary" >/dev/null 2>&1; then
  echo "ok: canary exists"
else
  sha=$(gh api "repos/$REPO/git/ref/heads/main" -q .object.sha)
  run gh api "repos/$REPO/git/refs" -f ref=refs/heads/canary -f sha="$sha" --silent
fi

# 3. Actions may open the release pull request; the default token stays read-only.
run gh api -X PUT "repos/$REPO/actions/permissions/workflow" -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true

# 4. Dependabot alerts and security updates.
run gh api -X PUT "repos/$REPO/vulnerability-alerts"
run gh api -X PUT "repos/$REPO/automated-security-fixes"

# 5. Release deploy key, private key in the Actions and Dependabot secrets.
if gh api "repos/$REPO/keys" -q '[.[] | select(.read_only == false and (.title | test("RELEASE_DEPLOY_KEY")))] | length' | grep -qv '^0$'; then
  echo "ok: release deploy key exists (secrets assumed set; the audit checks them)"
else
  if [ "$APPLY" = 1 ]; then
    dir=$(mktemp -d)
    ssh-keygen -q -t ed25519 -N "" -C "${REPO#*/} release bot" -f "$dir/key"
    gh api "repos/$REPO/keys" -f title="release bot (RELEASE_DEPLOY_KEY)" -f key="$(cat "$dir/key.pub")" -F read_only=false --silent
    gh secret set RELEASE_DEPLOY_KEY --repo "$REPO" <"$dir/key"
    gh secret set RELEASE_DEPLOY_KEY --repo "$REPO" --app dependabot <"$dir/key"
    rm -rf "$dir"
    echo "+ deploy key added; private key stored in the Actions and Dependabot secrets, local copy deleted"
  else
    echo "would: create an ed25519 write deploy key and store it in RELEASE_DEPLOY_KEY (Actions and Dependabot)"
  fi
fi

# 6. Rulesets: Protect canary and Protect main, merge commits only, 0 approvals, deploy key bypass.
list_checks() {
  if [ -n "$EXTRA_CHECKS" ]; then tr ',' '\n' <<<"$EXTRA_CHECKS"; fi
  if [ "$GATE_CHECKS" = 1 ]; then printf '%s\n' "report / report" "changesets / changeset"; fi
}
checks_json=$(list_checks | sed '/^$/d' | jq -R . | jq -s 'map({context: ., integration_id: 15368})')
for branch in canary main; do
  body=$(jq -n --arg name "Protect $branch" --arg ref "refs/heads/$branch" --argjson checks "$checks_json" '{
    name: $name, target: "branch", enforcement: "active",
    conditions: { ref_name: { include: [$ref], exclude: [] } },
    bypass_actors: [{ actor_type: "DeployKey", bypass_mode: "always" }],
    rules: ([{ type: "deletion" }, { type: "non_fast_forward" },
      { type: "pull_request", parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: false,
        require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: false,
        allowed_merge_methods: ["merge"] } }]
      + (if ($checks | length) > 0 then [{ type: "required_status_checks", parameters: {
        strict_required_status_checks_policy: false, do_not_enforce_on_create: false, required_status_checks: $checks } }] else [] end))
  }')
  id=$(gh api "repos/$REPO/rulesets" -q ".[] | select(.name == \"Protect $branch\") | .id" 2>/dev/null || true)
  if [ -n "$id" ]; then
    if [ "$APPLY" = 1 ]; then echo "+ update ruleset Protect $branch ($id)"; gh api -X PUT "repos/$REPO/rulesets/$id" --input - --silent <<<"$body"; else echo "would: update ruleset Protect $branch ($id)"; fi
  else
    if [ "$APPLY" = 1 ]; then echo "+ create ruleset Protect $branch"; gh api -X POST "repos/$REPO/rulesets" --input - --silent <<<"$body"; else echo "would: create ruleset Protect $branch"; fi
  fi
done
others=$(gh api "repos/$REPO/rulesets" -q '[.[] | select(.name != "Protect canary" and .name != "Protect main") | .name] | join(", ")' 2>/dev/null || true)
[ -n "$others" ] && echo "check by hand: other rulesets exist ($others); a ruleset on ~DEFAULT_BRANCH follows the default branch"
if gh api "repos/$REPO/branches/main/protection" >/dev/null 2>&1; then
  echo "check by hand: main still has classic branch protection; remove it once the rulesets are active (gh api -X DELETE repos/$REPO/branches/main/protection)"
fi

# 7. Default branch, last: both branches are protected by now.
run gh api -X PATCH "repos/$REPO" -f default_branch=canary --silent

echo
echo "Done. Verify with: $(dirname "$0")/audit.sh $REPO <local-path>"
echo "Also check by hand: a direct push to canary is rejected; Vercel or other hosts keep their production branch."
