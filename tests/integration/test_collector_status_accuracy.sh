#!/usr/bin/env bash
# Verify collector status accuracy, self-monitoring, commit settlement, API
# run-vs-jobs completion lag reconciliation, hidden internal workflow exclusion
# from overallStatus, and duplicate workflow_run idempotency.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP_DIR="$(mktemp -d)"
export TEMP_DIR
trap 'rm -rf "${TEMP_DIR}"' EXIT

mkdir -p "${TEMP_DIR}/bin" "${TEMP_DIR}/data/status-events"

echo "=== Testing Collector Status Accuracy & Commit Settlement ==="

# ---------------------------------------------------------------------------
# Test 1: Self-monitoring queries status=completed, returns 5 completed runs
# even when in_progress/queued runs exist, and reports effectiveStatus=success
# ---------------------------------------------------------------------------
cat > "${TEMP_DIR}/bin/gh" <<'MOCK_GH'
#!/usr/bin/env bash
set -euo pipefail

endpoint=""
for arg in "$@"; do
  case "$arg" in
    /repos/*) endpoint="$arg" ;;
  esac
done

case "$endpoint" in
  */actions/workflows)
    repo="$(printf '%s' "$endpoint" | cut -d/ -f4)"
    case "$repo" in
      athmetry-backend)
        jq -n '{total_count: 2, workflows: [
          {id: 101, name: "Athmetry Backend Validation", path: ".github/workflows/ci.yml", state: "active", html_url: "https://github.com/athmetry/athmetry-backend/actions/workflows/ci.yml"},
          {id: 102, name: "Athmetry Backend Status Reporter", path: ".github/workflows/status-reporter.yml", state: "active", html_url: "https://github.com/athmetry/athmetry-backend/actions/workflows/status-reporter.yml"}
        ]}'
        ;;
      athmetry-frontend)
        jq -n '{total_count: 2, workflows: [
          {id: 201, name: "Athmetry Frontend CI", path: ".github/workflows/ci.yml", state: "active", html_url: "https://github.com/athmetry/athmetry-frontend/actions/workflows/ci.yml"},
          {id: 202, name: "Athmetry Frontend Status Reporter", path: ".github/workflows/status-reporter.yml", state: "active", html_url: "https://github.com/athmetry/athmetry-frontend/actions/workflows/status-reporter.yml"}
        ]}'
        ;;
      athmetry-system-status)
        jq -n '{total_count: 4, workflows: [
          {id: 301, name: "CI Integration Tests", path: ".github/workflows/ci-test.yml", state: "active", html_url: "https://github.com/athmetry/athmetry-system-status/actions/workflows/ci-test.yml"},
          {id: 302, name: "Collect System Status", path: ".github/workflows/collect-status.yml", state: "active", html_url: "https://github.com/athmetry/athmetry-system-status/actions/workflows/collect-status.yml"},
          {id: 303, name: "Deploy to GitHub Pages", path: ".github/workflows/deploy-pages.yml", state: "active", html_url: "https://github.com/athmetry/athmetry-system-status/actions/workflows/deploy-pages.yml"},
          {id: 304, name: "Security Scan", path: ".github/workflows/security-scan.yml", state: "active", html_url: "https://github.com/athmetry/athmetry-system-status/actions/workflows/security-scan.yml"}
        ]}'
        ;;
    esac
    ;;
  */actions/workflows/302/runs*)
    # Verify status=completed is requested for collect-status.yml
    if [[ "$endpoint" != *"status=completed"* ]]; then
      echo "ERROR: collect-status.yml must query status=completed, got: $endpoint" >&2
      exit 1
    fi
    echo "$endpoint" > "${TEMP_DIR}/collector-runs-endpoint"
    if [[ "${MOCK_COLLECTOR_MODE:-normal}" == "first_run_only_self" ]]; then
      jq -n '{total_count: 1, workflow_runs: [
        {id: 9999, run_number: 1, run_attempt: 1, status: "completed", conclusion: "success", head_sha: "1111111111111111111111111111111111111111", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/9999", run_started_at: "2026-11-21T00:00:00Z", created_at: "2026-11-21T00:00:00Z", updated_at: "2026-11-21T00:00:10Z"}
      ]}'
    elif [[ "${MOCK_COLLECTOR_MODE:-normal}" == "failed_collector" ]]; then
      jq -n '{total_count: 1, workflow_runs: [
        {id: 8065, run_number: 65, run_attempt: 1, status: "completed", conclusion: "failure", head_sha: "1111111111111111111111111111111111111111", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/8065", run_started_at: "2026-11-21T00:00:00Z", created_at: "2026-11-21T00:00:00Z", updated_at: "2026-11-21T00:00:10Z"}
      ]}'
    else
      # Include 5 completed runs plus current self run 9999 to verify self exclusion and 5-run depth
      jq -n '{total_count: 6, workflow_runs: [
        {id: 9999, run_number: 66, run_attempt: 1, status: "in_progress", conclusion: null, head_sha: "1111111111111111111111111111111111111111", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/9999", run_started_at: "2026-11-21T00:06:00Z", created_at: "2026-11-21T00:06:00Z", updated_at: "2026-11-21T00:06:01Z"},
        {id: 8065, run_number: 65, run_attempt: 1, status: "completed", conclusion: "success", head_sha: "1111111111111111111111111111111111111111", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/8065", run_started_at: "2026-11-21T00:05:00Z", created_at: "2026-11-21T00:05:00Z", updated_at: "2026-11-21T00:05:20Z"},
        {id: 8064, run_number: 64, run_attempt: 1, status: "completed", conclusion: "success", head_sha: "1111111111111111111111111111111111111111", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/8064", run_started_at: "2026-11-21T00:04:00Z", created_at: "2026-11-21T00:04:00Z", updated_at: "2026-11-21T00:04:20Z"},
        {id: 8063, run_number: 63, run_attempt: 1, status: "completed", conclusion: "success", head_sha: "1111111111111111111111111111111111111111", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/8063", run_started_at: "2026-11-21T00:03:00Z", created_at: "2026-11-21T00:03:00Z", updated_at: "2026-11-21T00:03:20Z"},
        {id: 8062, run_number: 62, run_attempt: 1, status: "completed", conclusion: "success", head_sha: "1111111111111111111111111111111111111111", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/8062", run_started_at: "2026-11-21T00:02:00Z", created_at: "2026-11-21T00:02:00Z", updated_at: "2026-11-21T00:02:20Z"},
        {id: 8061, run_number: 61, run_attempt: 1, status: "completed", conclusion: "success", head_sha: "1111111111111111111111111111111111111111", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/8061", run_started_at: "2026-11-21T00:01:00Z", created_at: "2026-11-21T00:01:00Z", updated_at: "2026-11-21T00:01:20Z"}
      ]}'
    fi
    ;;
  */actions/workflows/ci-test.yml/runs*)
    # Commit-settlement poll endpoint
    count_file="${TEMP_DIR}/ci-settle-polls"
    count=0
    [[ -f "$count_file" ]] && count=$(cat "$count_file")
    count=$((count + 1))
    echo "$count" > "$count_file"
    if [[ "$count" -eq 1 && "${MOCK_SETTLE_WAIT:-false}" == "true" ]]; then
      jq -n '{total_count: 1, workflow_runs: [
        {id: 7001, run_number: 15, run_attempt: 1, status: "in_progress", conclusion: null, head_sha: "2222222222222222222222222222222222222222"}
      ]}'
    else
      jq -n '{total_count: 1, workflow_runs: [
        {id: 7001, run_number: 15, run_attempt: 1, status: "completed", conclusion: "success", head_sha: "2222222222222222222222222222222222222222"}
      ]}'
    fi
    ;;
  */actions/workflows/security-scan.yml/runs*)
    jq -n '{total_count: 1, workflow_runs: [
      {id: 7002, run_number: 30, run_attempt: 1, status: "completed", conclusion: "success", head_sha: "2222222222222222222222222222222222222222"}
    ]}'
    ;;
  */actions/workflows/301/runs*)
    # CI Integration Tests: test run-vs-jobs completion lag when MOCK_API_LAG=true
    if [[ "${MOCK_API_LAG:-false}" == "true" ]]; then
      jq -n '{total_count: 1, workflow_runs: [
        {id: 7001, run_number: 15, run_attempt: 1, status: "in_progress", conclusion: null, head_sha: "2222222222222222222222222222222222222222", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/7001", run_started_at: "2026-11-21T00:05:00Z", created_at: "2026-11-21T00:05:00Z", updated_at: "2026-11-21T00:05:10Z"}
      ]}'
    else
      attempt="${MOCK_CI_ATTEMPT:-1}"
      jq -n --argjson attempt "$attempt" '{total_count: 1, workflow_runs: [
        {id: 7001, run_number: 15, run_attempt: $attempt, status: "completed", conclusion: "success", head_sha: "2222222222222222222222222222222222222222", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/7001", run_started_at: "2026-11-21T00:05:00Z", created_at: "2026-11-21T00:05:00Z", updated_at: "2026-11-21T00:05:15Z"}
      ]}'
    fi
    ;;
  */actions/workflows/303/runs*)
    # Deploy to GitHub Pages: running (must NOT turn athmetry-system-status overallStatus into running)
    jq -n '{total_count: 1, workflow_runs: [
      {id: 7003, run_number: 94, run_attempt: 1, status: "in_progress", conclusion: null, head_sha: "2222222222222222222222222222222222222222", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/7003", run_started_at: "2026-11-21T00:05:16Z", created_at: "2026-11-21T00:05:16Z", updated_at: "2026-11-21T00:05:17Z"}
    ]}'
    ;;
  */actions/workflows/102/runs*)
    # Athmetry Backend Status Reporter: running (must NOT turn athmetry-backend overallStatus into running)
    jq -n '{total_count: 1, workflow_runs: [
      {id: 6002, run_number: 31, run_attempt: 1, status: "in_progress", conclusion: null, head_sha: "3333333333333333333333333333333333333333", html_url: "https://github.com/athmetry/athmetry-backend/actions/runs/6002", run_started_at: "2026-11-21T00:05:00Z", created_at: "2026-11-21T00:05:00Z", updated_at: "2026-11-21T00:05:05Z"}
    ]}'
    ;;
  */actions/workflows/202/runs*)
    # Athmetry Frontend Status Reporter: failure (must NOT turn athmetry-frontend overallStatus into failure)
    jq -n '{total_count: 1, workflow_runs: [
      {id: 6004, run_number: 13, run_attempt: 1, status: "completed", conclusion: "failure", head_sha: "4444444444444444444444444444444444444444", html_url: "https://github.com/athmetry/athmetry-frontend/actions/runs/6004", run_started_at: "2026-11-21T00:05:00Z", created_at: "2026-11-21T00:05:00Z", updated_at: "2026-11-21T00:05:05Z"}
    ]}'
    ;;
  */actions/workflows/*/runs*)
    jq -n '{total_count: 1, workflow_runs: [
      {id: 7002, run_number: 30, run_attempt: 1, status: "completed", conclusion: "success", head_sha: "2222222222222222222222222222222222222222", html_url: "https://github.com/athmetry/athmetry-system-status/actions/runs/7002", run_started_at: "2026-11-21T00:05:00Z", created_at: "2026-11-21T00:05:00Z", updated_at: "2026-11-21T00:05:10Z"}
    ]}'
    ;;
  */actions/runs/7003/jobs|*/actions/runs/6002/jobs)
    jq -n '{jobs: [{name: "job", status: "in_progress", conclusion: null, started_at: "2026-11-21T00:05:00Z", completed_at: null}]}'
    ;;
  */actions/runs/*/jobs)
    jq -n '{jobs: [{name: "Integration Tests", status: "completed", conclusion: "success", started_at: "2026-11-21T00:05:00Z", completed_at: "2026-11-21T00:05:15Z"}]}'
    ;;
  */actions/runs/7001)
    # Single-run reconciliation endpoint returns completed/success
    jq -n '{id: 7001, run_number: 15, run_attempt: 1, status: "completed", conclusion: "success", updated_at: "2026-11-21T00:05:15Z"}'
    ;;
  */commits/*)
    jq -n '{commit: {message: "test commit\n", author: {name: "Test Author"}}, author: {login: "test-author"}}'
    ;;
  *)
    echo "mock gh: unsupported endpoint: $endpoint" >&2
    exit 1
    ;;
esac
MOCK_GH
chmod +x "${TEMP_DIR}/bin/gh"

(
  cd "${TEMP_DIR}"
  PATH="${TEMP_DIR}/bin:${PATH}" \
  ATHMETRY_GITHUB_TOKEN="mock-token" \
  GITHUB_RUN_ID="9999" \
  GITHUB_EVENT_NAME="workflow_run" \
  TRIGGER_EVENT="push" \
  TRIGGER_HEAD_SHA="2222222222222222222222222222222222222222" \
  MOCK_SETTLE_WAIT="true" \
  MOCK_API_LAG="true" \
  SETTLE_POLL_INTERVAL_SECONDS="0" \
  SETTLE_MAX_WAIT_SECONDS="5" \
  RUN_RECONCILE_DELAY_SECONDS="0" \
  bash "${REPO_ROOT}/.github/scripts/collect-status.sh"
)

STATUS_FILE="${TEMP_DIR}/data/status.json"

# Verify Test 1 (self-monitoring status=completed + 5 runs + self run 9999 excluded)
jq -e '
  (.repositories[] | select(.name == "athmetry-system-status") | .workflows[] | select(.path == ".github/workflows/collect-status.yml")) as $col |
  $col.effectiveStatus == "success" and
  $col.latestStatus == "completed" and
  $col.latestConclusion == "success" and
  $col.latestRun.runId == 8065 and
  ($col.history | length) == 5 and
  ([$col.history[].runNumber] == [65, 64, 63, 62, 61])
' "${STATUS_FILE}" >/dev/null
echo "✓ PASS: Test 1 — Collect System Status queries status=completed, excludes active GITHUB_RUN_ID, and preserves 5 completed history entries"

# Verify Test 4 (commit-settlement waited across 2 polls)
[[ "$(cat "${TEMP_DIR}/ci-settle-polls")" -ge 2 ]]
echo "✓ PASS: Test 2 — Collector waits for sibling commit workflows on TRIGGER_HEAD_SHA to reach terminal state"

# Verify Test 5 (API run-vs-jobs completion lag reconciled to completed/success)
jq -e '
  (.repositories[] | select(.name == "athmetry-system-status") | .workflows[] | select(.path == ".github/workflows/ci-test.yml")) as $ci |
  $ci.effectiveStatus == "success" and
  $ci.latestStatus == "completed" and
  $ci.latestConclusion == "success" and
  $ci.latestRun.status == "completed" and
  $ci.latestRun.conclusion == "success" and
  $ci.history[0].status == "completed" and
  $ci.history[0].conclusion == "success"
' "${STATUS_FILE}" >/dev/null
echo "✓ PASS: Test 3 — Run-vs-jobs completion lag is reconciled via single-run API re-fetch"

# Verify Test 6 (hidden internal workflows do not pollute repo.overallStatus)
jq -e '
  (.repositories[] | select(.name == "athmetry-system-status") | .overallStatus) == "success" and
  (.repositories[] | select(.name == "athmetry-backend") | .overallStatus) == "success" and
  (.repositories[] | select(.name == "athmetry-frontend") | .overallStatus) == "success" and
  ((.repositories[] | select(.name == "athmetry-system-status") | .workflows[] | select(.name == "Deploy to GitHub Pages") | .effectiveStatus) == "running")
' "${STATUS_FILE}" >/dev/null
echo "✓ PASS: Test 4 — Hidden internal/self-deploy workflows remain in workflows[] but do not set repo.overallStatus to running/failure"

# Verify Test 7 (duplicate workflow_run for same settled commit SHA skips update; rerun with attempt=2 updates)
cp "${STATUS_FILE}" "${TEMP_DIR}/status.before.dup.json"
DUP_OUT=$(
  cd "${TEMP_DIR}"
  PATH="${TEMP_DIR}/bin:${PATH}" \
  ATHMETRY_GITHUB_TOKEN="mock-token" \
  GITHUB_RUN_ID="10000" \
  GITHUB_EVENT_NAME="workflow_run" \
  TRIGGER_EVENT="push" \
  TRIGGER_HEAD_SHA="2222222222222222222222222222222222222222" \
  SETTLE_POLL_INTERVAL_SECONDS="0" \
  RUN_RECONCILE_DELAY_SECONDS="0" \
  bash "${REPO_ROOT}/.github/scripts/collect-status.sh"
)
cmp -s "${STATUS_FILE}" "${TEMP_DIR}/status.before.dup.json"
[[ "$DUP_OUT" == *"skipping duplicate update"* ]]
echo "✓ PASS: Test 5 — Duplicate workflow_run for already-published commit SHA skips redundant update"

# Now simulate a workflow rerun (runAttempt=2) on the same commit SHA -> MUST update
(
  cd "${TEMP_DIR}"
  PATH="${TEMP_DIR}/bin:${PATH}" \
  ATHMETRY_GITHUB_TOKEN="mock-token" \
  GITHUB_RUN_ID="10001" \
  GITHUB_EVENT_NAME="workflow_run" \
  TRIGGER_EVENT="push" \
  TRIGGER_HEAD_SHA="2222222222222222222222222222222222222222" \
  MOCK_CI_ATTEMPT="2" \
  SETTLE_POLL_INTERVAL_SECONDS="0" \
  RUN_RECONCILE_DELAY_SECONDS="0" \
  bash "${REPO_ROOT}/.github/scripts/collect-status.sh"
)
jq -e '
  (.repositories[] | select(.name == "athmetry-system-status") | .workflows[] | select(.path == ".github/workflows/ci-test.yml") | .latestRun.runAttempt) == 2
' "${STATUS_FILE}" >/dev/null
echo "✓ PASS: Test 6 — Re-run (higher runAttempt) on same commit SHA updates status.json"

# Verify Test 2 (first-run edge case where only current GITHUB_RUN_ID exists -> unknown, never running)
(
  cd "${TEMP_DIR}"
  PATH="${TEMP_DIR}/bin:${PATH}" \
  ATHMETRY_GITHUB_TOKEN="mock-token" \
  GITHUB_RUN_ID="9999" \
  MOCK_COLLECTOR_MODE="first_run_only_self" \
  RUN_RECONCILE_DELAY_SECONDS="0" \
  bash "${REPO_ROOT}/.github/scripts/collect-status.sh"
)
jq -e '
  (.repositories[] | select(.name == "athmetry-system-status") | .workflows[] | select(.path == ".github/workflows/collect-status.yml")) as $col |
  $col.effectiveStatus == "unknown" and
  $col.latestRun == null
' "${STATUS_FILE}" >/dev/null
echo "✓ PASS: Test 7 — First-run self-collector edge case reports unknown (never pins portal to running)"

# Verify Test 3 (failed completed collector run is reported as failure)
(
  cd "${TEMP_DIR}"
  PATH="${TEMP_DIR}/bin:${PATH}" \
  ATHMETRY_GITHUB_TOKEN="mock-token" \
  GITHUB_RUN_ID="9999" \
  MOCK_COLLECTOR_MODE="failed_collector" \
  RUN_RECONCILE_DELAY_SECONDS="0" \
  bash "${REPO_ROOT}/.github/scripts/collect-status.sh"
)
jq -e '
  (.repositories[] | select(.name == "athmetry-system-status") | .workflows[] | select(.path == ".github/workflows/collect-status.yml")) as $col |
  $col.effectiveStatus == "failure" and
  $col.latestConclusion == "failure" and
  (.repositories[] | select(.name == "athmetry-system-status") | .overallStatus) == "failure"
' "${STATUS_FILE}" >/dev/null
echo "✓ PASS: Test 8 — Failed completed collector run is accurately reported as failure"

# Verify Test 8 (derive_effective_status helper handles extended GitHub statuses/conclusions)
source "${REPO_ROOT}/.github/scripts/collect-status.sh"
[[ "$(derive_effective_status "completed" "neutral")" == "success" ]]
[[ "$(derive_effective_status "completed" "startup_failure")" == "failure" ]]
[[ "$(derive_effective_status "completed" "timed_out")" == "failure" ]]
[[ "$(derive_effective_status "completed" "action_required")" == "failure" ]]
[[ "$(derive_effective_status "completed" "stale")" == "cancelled" ]]
[[ "$(derive_effective_status "waiting" "")" == "queued" ]]
[[ "$(derive_effective_status "requested" "")" == "queued" ]]
[[ "$(derive_effective_status "pending" "")" == "queued" ]]
echo "✓ PASS: Test 9 — Extended GitHub statuses and conclusions map accurately"

echo ""
echo "=== All Collector Status Accuracy Tests Passed ==="
