#!/usr/bin/env bash
# Exercise the production collector main path with a mocked GitHub API.
# Verifies schema v2, event merging, history preservation, and retention of
# Frontend and System Status entries without contacting GitHub.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP_DIR="$(mktemp -d)"
export TEMP_DIR
trap 'rm -rf "${TEMP_DIR}"' EXIT

mkdir -p "${TEMP_DIR}/bin" "${TEMP_DIR}/data/status-events"
cp "${REPO_ROOT}/tests/fixtures/backend-run-38.json" "${TEMP_DIR}/data/status-events/backend.json"

cat > "${TEMP_DIR}/bin/gh" <<'MOCK_GH'
#!/usr/bin/env bash
set -euo pipefail

endpoint=""
for arg in "$@"; do
  case "$arg" in
    /repos/*) endpoint="$arg" ;;
  esac
done

if [[ -z "$endpoint" ]]; then
  echo "mock gh: no API endpoint" >&2
  exit 1
fi

case "$endpoint" in
  */actions/workflows)
    repo="$(printf '%s' "$endpoint" | cut -d/ -f4)"
    case "$repo" in
      athmetry-backend) workflow_id=101; workflow_name="Athmetry Backend Validation"; workflow_path=".github/workflows/ci.yml" ;;
      athmetry-frontend) workflow_id=202; workflow_name="Athmetry Frontend CI"; workflow_path=".github/workflows/frontend.yml" ;;
      athmetry-system-status) workflow_id=303; workflow_name="Collect System Status"; workflow_path=".github/workflows/collect-status.yml" ;;
      *) echo "mock gh: unknown repo: $repo" >&2; exit 1 ;;
    esac
    jq -n \
      --argjson id "$workflow_id" \
      --arg name "$workflow_name" \
      --arg path "$workflow_path" \
      --arg repo "$repo" \
      '{
        total_count: 1,
        workflows: [{
          id: $id,
          name: $name,
          path: $path,
          state: "active",
          html_url: ("https://github.com/athmetry/" + $repo + "/actions/workflows/test.yml")
        }]
      }'
    ;;
  */actions/workflows/*/runs*)
    if [[ -f "${TEMP_DIR}/api-has-run-38" ]]; then
      jq -n '{
        total_count: 2,
        workflow_runs: [
          {
            id: 43517315540,
            run_number: 38,
            run_attempt: 1,
            status: "completed",
            conclusion: "success",
            head_sha: "6cb7d54feef69089b06504eb033cd5c7c44541c7",
            html_url: "https://github.com/athmetry/athmetry-backend/actions/runs/43517315540",
            run_started_at: "2026-11-13T22:12:13Z",
            created_at: "2026-11-13T22:12:13Z",
            updated_at: "2026-11-13T22:13:33Z"
          },
          {
            id: 9001,
            run_number: 1,
            run_attempt: 1,
            status: "completed",
            conclusion: "success",
            head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            html_url: "https://github.com/athmetry/example/actions/runs/9001",
            run_started_at: "2026-11-12T10:00:00Z",
            created_at: "2026-11-12T10:00:00Z",
            updated_at: "2026-11-12T10:05:00Z"
          }
        ]
      }'
    else
      jq -n '{
        total_count: 1,
        workflow_runs: [{
          id: 9001,
          run_number: 1,
          run_attempt: 1,
          status: "completed",
          conclusion: "success",
          head_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          html_url: "https://github.com/athmetry/example/actions/runs/9001",
          run_started_at: "2026-11-12T10:00:00Z",
          created_at: "2026-11-12T10:00:00Z",
          updated_at: "2026-11-12T10:05:00Z"
        }]
      }'
    fi
    ;;
  */actions/runs/*/jobs)
    jq -n '{jobs: [{name: "build", status: "completed", conclusion: "success", started_at: "2026-11-12T10:00:00Z", completed_at: "2026-11-12T10:05:00Z"}]}'
    ;;
  */commits/*)
    jq -n '{commit: {message: "Mock backend commit\n", author: {name: "Mock Author"}}, author: {login: "mock-author"}}'
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
  bash "${REPO_ROOT}/.github/scripts/collect-status.sh"
)

STATUS_FILE="${TEMP_DIR}/data/status.json"
touch "${TEMP_DIR}/api-has-run-38"

# Re-run the production collector with a stale event. Run 38 must remain current.
cp "${REPO_ROOT}/tests/fixtures/backend.json" "${TEMP_DIR}/data/status-events/backend.json"
(
  cd "${TEMP_DIR}"
  PATH="${TEMP_DIR}/bin:${PATH}" \
  ATHMETRY_GITHUB_TOKEN="mock-token" \
  bash "${REPO_ROOT}/.github/scripts/collect-status.sh"
)

# Re-run with the identical run 38 event. The duplicate must not alter history.
cp "${REPO_ROOT}/tests/fixtures/backend-run-38.json" "${TEMP_DIR}/data/status-events/backend.json"
(
  cd "${TEMP_DIR}"
  PATH="${TEMP_DIR}/bin:${PATH}" \
  ATHMETRY_GITHUB_TOKEN="mock-token" \
  bash "${REPO_ROOT}/.github/scripts/collect-status.sh"
)

jq -e '
  .schemaVersion == 2 and
  (.repositories | length) == 3 and
  ([.repositories[].name] | sort) == ["athmetry-backend", "athmetry-frontend", "athmetry-system-status"] and
  ([.repositories[] | select(.name == "athmetry-frontend") | .workflows[].name] == ["Athmetry Frontend CI"]) and
  ([.repositories[] | select(.name == "athmetry-system-status") | .workflows[].name] == ["Collect System Status"]) and
  ([.repositories[] | select(.name == "athmetry-backend") | .workflows[] | select(.name == "Athmetry Backend Validation") | .latestRun.runId] == [43517315540]) and
  ([.repositories[] | select(.name == "athmetry-backend") | .workflows[] | select(.name == "Athmetry Backend Validation") | .history[].runNumber] == [38, 1]) and
  ([.repositories[] | select(.name == "athmetry-backend") | .workflows[] | select(.name == "Athmetry Backend Validation") | .history[] | select(.conclusion == "success")] | length) >= 1
' "${STATUS_FILE}" >/dev/null

echo "✓ PASS: Production collector output preserves schema version 2 and all three repositories"
echo "✓ PASS: Backend event updates the latest run and preserves successful history"
echo "✓ PASS: Stale and duplicate events are rejected by the production collector"
echo "✓ PASS: Frontend and System Status entries remain intact"
