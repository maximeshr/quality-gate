#!/usr/bin/env bash
# Audit one repository against the OKQ stack: GitHub settings and project files.
# Read-only: it never changes anything.
#
# Usage: audit.sh <owner/repo> [local-path]
#   local-path defaults to the current directory when it is a clone of <owner/repo>.
# Exit code: 0 when every check passes, 1 otherwise.
set -uo pipefail

REPO="${1:?usage: audit.sh <owner/repo> [local-path]}"
DIR="${2:-$PWD}"
QG_REPO="maximeshr/quality-gate"
PASS=0
FAIL=0
WARN=0

ok() { printf '  ✅ %s\n' "$1"; PASS=$((PASS + 1)); }
ko() { printf '  ❌ %s\n' "$1"; FAIL=$((FAIL + 1)); }
warn() { printf '  ⚠️  %s\n' "$1"; WARN=$((WARN + 1)); }
check() { if eval "$2" >/dev/null 2>&1; then ok "$1"; else ko "$1${3:+ — $3}"; fi; }
gh_json() { gh api "$@" 2>/dev/null; }

command -v gh >/dev/null || { echo "gh is required"; exit 2; }
command -v jq >/dev/null || { echo "jq is required"; exit 2; }

# quality-gate is the gate itself: it uses its own sources instead of depending on itself.
SELF=0; [ "$REPO" = "$QG_REPO" ] && SELF=1
latest_qg=$(gh_json "repos/$QG_REPO/releases/latest" | jq -r '.tag_name // empty')
repo_json=$(gh_json "repos/$REPO") || { echo "cannot read $REPO"; exit 2; }
visibility=$(jq -r .visibility <<<"$repo_json")
echo "OKQ audit: $REPO ($visibility) — local: $DIR — latest quality-gate: ${latest_qg:-unknown}"

echo
echo "GitHub: branches and merging"
check "default branch is canary" "[ \"$(jq -r .default_branch <<<"$repo_json")\" = canary ]"
check "branch main exists" "gh api repos/$REPO/branches/main"
check "branch canary exists" "gh api repos/$REPO/branches/canary"
check "merge commits allowed" "[ \"$(jq -r .allow_merge_commit <<<"$repo_json")\" = true ]"
check "squash merging disabled" "[ \"$(jq -r .allow_squash_merge <<<"$repo_json")\" = false ]"
check "rebase merging disabled" "[ \"$(jq -r .allow_rebase_merge <<<"$repo_json")\" = false ]"

for branch in canary main; do
  rules=$(gh_json "repos/$REPO/rules/branches/$branch" || echo '[]')
  types=$(jq -r '[.[].type] | join(",")' <<<"$rules")
  check "$branch: no deletion" "grep -q deletion <<<'$types'"
  check "$branch: no force-push" "grep -q non_fast_forward <<<'$types'"
  check "$branch: pull request required" "grep -q pull_request <<<'$types'"
  methods=$(jq -r '[.[] | select(.type=="pull_request") | .parameters.allowed_merge_methods // [] | .[]] | unique | join(",")' <<<"$rules")
  check "$branch: merge commits only (got: ${methods:-none})" "[ '$methods' = merge ]"
  approvals=$(jq -r '[.[] | select(.type=="pull_request") | .parameters.required_approving_review_count][0] // "none"' <<<"$rules")
  check "$branch: 0 required approvals (got: $approvals)" "[ '$approvals' = 0 ]"
  required=$(jq -r '[.[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context] | join(", ")' <<<"$rules")
  check "$branch: report / report required" "grep -qF 'report / report' <<<'$required'"
  check "$branch: changesets / changeset required" "grep -qF 'changesets / changeset' <<<'$required'"
done
targets=$(gh_json "repos/$REPO/rulesets" | jq -r '.[].id' | while read -r id; do gh_json "repos/$REPO/rulesets/$id" | jq -r '.conditions.ref_name.include[]?'; done | sort -u | tr '\n' ' ')
check "no ruleset targets ~DEFAULT_BRANCH (targets: ${targets:-none})" "! grep -qF '~DEFAULT_BRANCH' <<<'$targets'"
bypass=$(gh_json "repos/$REPO/rulesets" | jq -r '.[].id' | while read -r id; do gh_json "repos/$REPO/rulesets/$id" | jq -r '.bypass_actors[]?.actor_type'; done | sort -u | tr '\n' ' ')
check "rulesets bypass actor is DeployKey (got: ${bypass:-none})" "[ '$(echo $bypass)' = DeployKey ]"

echo
echo "GitHub: automation and secrets"
check "Actions can create pull requests" "[ \"\$(gh api repos/$REPO/actions/permissions/workflow -q .can_approve_pull_request_reviews)\" = true ]" "release pull requests cannot open"
check "default workflow token is read-only" "[ \"\$(gh api repos/$REPO/actions/permissions/workflow -q .default_workflow_permissions)\" = read ]"
check "a write deploy key exists" "[ \"\$(gh api repos/$REPO/keys -q '[.[] | select(.read_only==false)] | length')\" -ge 1 ]"
check "RELEASE_DEPLOY_KEY secret (Actions)" "gh secret list --repo $REPO | grep -q '^RELEASE_DEPLOY_KEY'"
check "RELEASE_DEPLOY_KEY secret (Dependabot)" "gh secret list --repo $REPO --app dependabot | grep -q '^RELEASE_DEPLOY_KEY'"
check "Dependabot alerts on" "gh api repos/$REPO/vulnerability-alerts"
check "Dependabot security updates on" "[ \"\$(gh api repos/$REPO/automated-security-fixes -q .enabled)\" = true ]"

echo
echo "Files ($DIR)"
if [ ! -f "$DIR/package.json" ]; then
  ko "package.json not found in $DIR: files not audited"
else
  pkg="$DIR/package.json"
  pm=$(jq -r '.devEngines.packageManager.name // empty' "$pkg")
  pmv=$(jq -r '.devEngines.packageManager.version // empty' "$pkg")
  check "package manager is pnpm (got: ${pm:-none})" "[ '$pm' = pnpm ]"
  qg_pm=$(gh_json "repos/$QG_REPO/contents/package.json?ref=$latest_qg" | jq -r .content | base64 -d 2>/dev/null | jq -r '.devEngines.packageManager.version // empty')
  check "pnpm $pmv matches quality-gate ($qg_pm)" "[ -n '$qg_pm' ] && [ '$pmv' = '$qg_pm' ]"
  check "packageManager field absent (devEngines only)" "[ \"\$(jq -r '.packageManager // empty' $pkg)\" = '' ]"
  check "ESM (\"type\": \"module\")" "[ \"\$(jq -r .type $pkg)\" = module ]"
  qg_dep=$(jq -r '.devDependencies["quality-gate"] // empty' "$pkg")
  QG_CLI="quality-gate"
  if [ "$SELF" = 1 ]; then
    QG_CLI="bin/quality-gate.js"
    ok "quality-gate itself: uses its own sources (no self dependency)"
  else
    check "quality-gate dev dependency (got: ${qg_dep:-none})" "[ -n '$qg_dep' ]"
  fi
  if [ -n "$qg_dep" ] && [ -n "$latest_qg" ]; then
    if [[ "$qg_dep" == *"#$latest_qg" ]]; then ok "quality-gate on the latest release ($latest_qg)"; else warn "quality-gate is $qg_dep, latest is $latest_qg"; fi
  fi
  check "@vitest/coverage-v8 dev dependency" "jq -e '.devDependencies[\"@vitest/coverage-v8\"]' $pkg"
  check "prepare script runs vp config" "jq -r '.scripts.prepare // empty' $pkg | grep -q 'vp config'"
  for s in check test changeset version-packages; do
    check "no \"$s\" script (use the vp built-in or vp exec)" "! jq -e '.scripts[\"$s\"]' $pkg"
  done
  if [ "$SELF" = 1 ]; then
    :
  elif [ -f "$DIR/pnpm-workspace.yaml" ]; then
    check "allowBuilds denies quality-gate" "grep -A3 '^allowBuilds:' $DIR/pnpm-workspace.yaml | grep -q 'quality-gate: false'"
  else
    ko "pnpm-workspace.yaml missing (catalog, overrides, allowBuilds)"
  fi
  check "pnpm minimumReleaseAge is 5 days (7200)" "grep -qE '^minimumReleaseAge: 7200$' $DIR/pnpm-workspace.yaml"
  if [ "$SELF" = 1 ]; then
    check "vite.config.ts uses the base config (./src/vite.js)" "grep -q './src/vite.js' $DIR/vite.config.ts"
  else
    check "vite.config.ts uses quality-gate/vite" "grep -q 'quality-gate/vite' $DIR/vite.config.ts"
  fi
  check "vite.config.ts has no local fmt style (singleQuote/printWidth)" "! grep -qE 'singleQuote|printWidth' $DIR/vite.config.ts"
  check "no lint plugin installed by the project (quality-gate ships them)" "! jq -e '(.dependencies // {}) + (.devDependencies // {}) | keys[] | select(test(\"^(oxlint-plugin-anti-slop|eslint-plugin-no-comment-slop|ultracite)$\"))' $pkg >/dev/null"
  check "no lint suppression without a -- reason" "! git -C $DIR grep -nE '(eslint|oxlint)-disable' -- '*.ts' '*.tsx' '*.js' '*.mjs' '*.astro' ':!*.d.ts' | grep -vE -- '--\\s*\\S' | grep -q ."
  check ".vite-hooks/pre-commit runs vp staged" "grep -q 'vp staged' $DIR/.vite-hooks/pre-commit"
  check ".vite-hooks/commit-msg runs commitlint" "grep -q '$QG_CLI commitlint' $DIR/.vite-hooks/commit-msg"
  check ".vite-hooks/pre-push runs the comment ratchet" "grep -q '$QG_CLI comments' $DIR/.vite-hooks/pre-push"
  check "comments-baseline.json present (comment ratchet)" "[ -f $DIR/comments-baseline.json ]"
  check ".vite-hooks/pre-push runs Knip and jscpd" "grep -q '$QG_CLI deadcode' $DIR/.vite-hooks/pre-push && grep -q '$QG_CLI duplication' $DIR/.vite-hooks/pre-push"
  qwf="$DIR/.github/workflows/quality.yml"; [ "$SELF" = 1 ] && qwf="$DIR/.github/workflows/ci.yml"
  check "$(basename "$qwf") calls reusable-report and reusable-changesets" "grep -q reusable-report.yml $qwf && grep -q reusable-changesets.yml $qwf"
  check "release.yml calls the shared release workflows" "grep -q reusable-release-pr.yml $DIR/.github/workflows/release.yml && grep -q reusable-release.yml $DIR/.github/workflows/release.yml"
  if [ -n "$qg_dep" ] && [ "$SELF" = 0 ]; then
    tag="${qg_dep##*#}"
    check "workflows pin the same quality-gate tag ($tag)" "! grep -h 'maximeshr/quality-gate/.github/workflows/' $DIR/.github/workflows/*.yml | grep -v \"@$tag\""
  fi
  if [ "$SELF" = 0 ]; then
    settings="$DIR/.claude/settings.json"
    check "Claude Code enables the okq plugin (.claude/settings.json)" "jq -e '.enabledPlugins[\"okq@okq\"] == true and .extraKnownMarketplaces.okq.source.repo == \"maximeshr/quality-gate\"' $settings"
    if [ -n "$qg_dep" ]; then
      check "okq plugin pinned to the quality-gate tag (${qg_dep##*#})" "[ \"\$(jq -r '.extraKnownMarketplaces.okq.source.ref // empty' $settings)\" = '${qg_dep##*#}' ]"
    fi
  fi
  check ".changeset/config.json baseBranch is canary" "[ \"\$(jq -r .baseBranch $DIR/.changeset/config.json)\" = canary ]"
  if [ -f "$DIR/.github/dependabot.yml" ]; then
    n_eco=$(grep -c 'package-ecosystem:' "$DIR/.github/dependabot.yml")
    n_tgt=$(grep -c 'target-branch: canary' "$DIR/.github/dependabot.yml")
    check "Dependabot targets canary ($n_tgt/$n_eco ecosystems)" "[ $n_eco -gt 0 ] && [ $n_eco = $n_tgt ]"
    check "Dependabot has a 5-day cooldown" "! grep -E 'default-days:' $DIR/.github/dependabot.yml | grep -vq 'default-days: 5$'"
  else
    ko ".github/dependabot.yml missing"
  fi
  check "CONTRIBUTING.md present" "[ -f $DIR/CONTRIBUTING.md ]"
  if [ "$visibility" = public ]; then check "LICENSE present (public repository)" "[ -f $DIR/LICENSE ]"; fi
  if [ -f "$DIR/README.md" ]; then
    readme="$DIR/README.md"
    for section in Install Usage Contributing License; do
      check "README has a \"$section\" section" "grep -qE '^## $section\b' $readme"
    done
    if [ "$(wc -l <"$readme")" -ge 100 ]; then check "README has a table of contents (100+ lines)" "grep -qE '^## Table of contents' $readme"; fi
    order=$(grep -E '^## (Table of contents|Install|Usage|API|Contributing|License)\b' "$readme" | sed 's/^## //' | tr '\n' '|')
    expected=$(printf '%s\n' "Table of contents" Install Usage API Contributing License | grep -xF -f <(grep -E '^## ' "$readme" | sed 's/^## //') | tr '\n' '|')
    check "README sections in Standard Readme order" "[ '$order' = '$expected' ]"
  else
    ko "README.md missing"
  fi
fi

echo
echo "Result: $PASS passed, $FAIL failed, $WARN warnings"
[ "$FAIL" -eq 0 ]
