#!/usr/bin/env bash
#
# collect-status.sh — Athmetry System Status collector
#
# Fetches the latest GitHub Actions workflow runs for the monitored Athmetry
# repositories (athmetry-backend, athmetry-frontend) on the configured branch,
# normalizes the data, and writes data/status.json. The file is committed and
# pushed only when its contents have changed.
#
# Requires:
#   - gh CLI (pre-installed on GitHub-hosted runners)
#   - jq (pre-installed on GitHub-hosted runners)
#   - ATHMETRY_GITHUB_TOKEN env var (fine-grained PAT with read access to
#     the monitored repos and contents:write on this repo)
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
REPO_OWNER="${REPO_OWNER:-athmetry}"
BRANCH="${BRANCH:-main}"
STATUS_FILE="data/status.json"
COLLECTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Repositories to monitor. Add entries here to monitor additional repos.
# Format: "repo_name owner repo" (owner/repo usually the same as name).
MONITORED_REPOS=(
  "athmetry-backend athmetry athmetry-backend"
  "athmetry-frontend athmetry athmetry-frontend"
)

if [[ -z "${ATHMETRY_GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: ATHMETRY_GITHUB_TOKEN environment variable is not set." >&2
  exit 1
fi

# Authenticate gh CLI for the duration of this run.
export GH_TOKEN="$ATHMETRY_GITHUB_TOKEN"
export GH_REPO="$REPO_OWNER/athmetry-system-status"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Call the GitHub REST API and output raw JSON. On failure, print error to
# stderr and return non-zero.
gh_api() {
  gh api --hostname github.com "$@" 2>/dev/null
}

# Escape a string for safe inclusion in JSON.
json_escape() {
  local s="${1:-}"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

# Capitalize first letter.
capitalize() {
  local s="${1:-}"
  printf '%s' "${s^}"
}

# ---------------------------------------------------------------------------
# Collect data for a single repository
# ---------------------------------------------------------------------------
#
# Outputs a single JSON object (no trailing newline) representing the repo's
# status entry. On API error, the object includes an "error" field and no
# run data — we never fabricate a status.
collect_repo() {
  local repo_name="$1"
  local owner="$2"
  local repo="$3"
  local error=""
  local latest_run="null"
  local history="[]"

  # Fetch the latest workflow runs for the monitored branch.
  # per_page=10 gives us both the latest run and a short history.
  # Use query parameters in the URL (gh api -f flags substitute path placeholders,
  # not query parameters; the GitHub Actions runs endpoint requires ?branch=&per_page=).
  local runs_payload
  if ! runs_payload=$(gh_api "/repos/${owner}/${repo}/actions/runs?branch=${BRANCH}&per_page=10" --jq '.' 2>/dev/null); then
    error="Failed to fetch workflow runs from GitHub API."
  fi

  if [[ -z "${error:-}" ]] && [[ -n "${runs_payload:-}" ]]; then
    local total_count
    total_count=$(printf '%s' "$runs_payload" | jq -r '.total_count // 0')

    if [[ "$total_count" -gt 0 ]]; then
      local runs_array
      runs_array=$(printf '%s' "$runs_payload" | jq -c '.workflow_runs')

      # Latest run is the first entry (API returns newest first).
      local latest
      latest=$(printf '%s' "$runs_array" | jq -c '.[0]')

      local head_sha run_id run_number status conclusion html_url started_at completed_at
      head_sha=$(printf '%s' "$latest" | jq -r 'if .head_sha != null then .head_sha else "" end')
      run_id=$(printf '%s' "$latest" | jq -r 'if .id != null then .id else "" end')
      run_number=$(printf '%s' "$latest" | jq -r 'if .run_number != null then .run_number else "" end')
      status=$(printf '%s' "$latest" | jq -r 'if .status != null then .status else "unknown" end')
      conclusion=$(printf '%s' "$latest" | jq -r 'if .conclusion != null then .conclusion else "unknown" end')
      html_url=$(printf '%s' "$latest" | jq -r 'if .html_url != null then .html_url else "" end')
      started_at=$(printf '%s' "$latest" | jq -r 'if .run_started_at != null then .run_started_at else .created_at end')
      completed_at=$(printf '%s' "$latest" | jq -r '.updated_at // ""')

      # Fetch job-level details for the latest run.
      local jobs_payload jobs_array="[]"
      if jobs_payload=$(gh_api \
        "/repos/${owner}/${repo}/actions/runs/${run_id}/jobs" \
        --jq '.' 2>/dev/null) && [[ -n "${jobs_payload:-}" ]]; then
        jobs_array=$(printf '%s' "$jobs_payload" | jq -c '[.jobs[] | {
          name: .name,
          status: .status,
          conclusion: .conclusion,
          started_at: .started_at,
          completed_at: .completed_at
        }]')
      fi

      # Fetch commit details for the head SHA.
      local commit_message="" commit_author=""
      if [[ -n "$head_sha" ]]; then
        local commit_payload
        if commit_payload=$(gh_api \
          "/repos/${owner}/${repo}/commits/${head_sha}" \
          --jq '.' 2>/dev/null) && [[ -n "${commit_payload:-}" ]]; then
          commit_message=$(printf '%s' "$commit_payload" | jq -r 'if .commit.message != null then .commit.message else "" end' | head -n 1)
          commit_author=$(printf '%s' "$commit_payload" | jq -r 'if .commit.author.name != null then .commit.author.name else .author.login end')
        fi
      fi

      # Build latest run object.
      latest_run=$(jq -n \
        --arg status "$status" \
        --arg conclusion "$conclusion" \
        --arg runId "$run_id" \
        --arg runNumber "$run_number" \
        --arg runUrl "$html_url" \
        --arg commitSha "$head_sha" \
        --arg commitMessage "$commit_message" \
        --arg commitAuthor "$commit_author" \
        --arg startedAt "$started_at" \
        --arg completedAt "$completed_at" \
        --argjson jobs "$jobs_array" \
        '{
          status: $status,
          conclusion: $conclusion,
          runId: ($runId | tonumber? // 0),
          runNumber: ($runNumber | tonumber? // 0),
          runUrl: $runUrl,
          commitSha: $commitSha,
          commitMessage: $commitMessage,
          commitAuthor: $commitAuthor,
          startedAt: $startedAt,
          completedAt: $completedAt,
          jobs: $jobs
        }')

      # Build history array (all fetched runs, newest first).
      history=$(printf '%s' "$runs_array" | jq -c '
        [.[] | {
          runNumber: (if .run_number != null then (.run_number | tonumber) else 0 end),
          status: .status,
          conclusion: .conclusion,
          commitSha: .head_sha,
          startedAt: (if .run_started_at != null then .run_started_at else .created_at end),
          completedAt: .updated_at,
          runUrl: .html_url
        }]')
    else
      # No workflow runs found on this branch — not an error, just no data.
      error=""
    fi
  fi

  # Assemble the repo entry.
  local repo_entry
  repo_entry=$(jq -n \
    --arg name "$repo_name" \
    --arg owner "$owner" \
    --arg repo "$repo" \
    --arg error "${error:-}" \
    --argjson latestRun "$latest_run" \
    --argjson history "$history" \
    '{
      name: $name,
      owner: $owner,
      repo: $repo,
      error: (if $error == "" then null else $error end),
      latestRun: $latestRun,
      jobs: (($latestRun.jobs // []) ),
      commit: (if $latestRun == null then null else {
        sha: $latestRun.commitSha,
        message: $latestRun.commitMessage,
        author: $latestRun.commitAuthor
      } end),
      execution: (if $latestRun == null then null else {
        startedAt: $latestRun.startedAt,
        completedAt: $latestRun.completedAt,
        duration: null
      } end),
      history: $history
    }')
  printf '%s' "$repo_entry"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  local entries="["
  local first=1

  for entry in "${MONITORED_REPOS[@]}"; do
    # shellcheck disable=SC2086
    set -- $entry
    local repo_name="$1" owner="$2" repo="$3"

    if [[ $first -eq 1 ]]; then
      first=0
    else
      entries+=","
    fi
    entries+=$(collect_repo "$repo_name" "$owner" "$repo")
  done
  entries+="]"

  # Build the full status document.
  local new_content
  new_content=$(jq -n \
    --arg collectedAt "$COLLECTED_AT" \
    --arg branch "$BRANCH" \
    --argjson repos "$entries" \
    '{
      schemaVersion: 1,
      collectedAt: $collectedAt,
      monitoredBranch: $branch,
      repositories: $repos,
      notes: "Populated by the collect-status GitHub Actions workflow. Do not edit by hand."
    }')

  # Write to a temp file, then replace only if changed.
  local tmp_file
  tmp_file=$(mktemp)
  printf '%s\n' "$new_content" > "$tmp_file"

  if [[ -f "$STATUS_FILE" ]] && cmp -s "$tmp_file" "$STATUS_FILE"; then
    echo "Status data unchanged; skipping commit."
    rm -f "$tmp_file"
    exit 0
  fi

  cp "$tmp_file" "$STATUS_FILE"
  rm -f "$tmp_file"
  echo "Status data updated: $STATUS_FILE"
}

main "$@"
