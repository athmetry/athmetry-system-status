#!/usr/bin/env bash
#
# collect-status.sh — Athmetry System Status collector
#
# Fetches all GitHub Actions workflows and their latest runs for the monitored
# Athmetry repositories (athmetry-backend, athmetry-frontend and
# athmetry-system-status) on the configured branch, normalizes the data, and
# writes data/status.json. The file is committed and pushed only when its
# contents have changed.
#
# Self-monitoring: the system-status repository's own collector workflow is
# included as a monitored pipeline. Because a collector run always observes
# itself as in_progress, the most recent *completed* run is reported instead,
# which keeps failed collector executions visible without pinning the
# dashboard to "Running".
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
MAX_RUNS_PER_WORKFLOW=5

# Repositories to monitor. Add entries here to monitor additional repos.
# Format: "repo_name owner repo" (owner/repo usually the same as name).
MONITORED_REPOS=(
  "athmetry-backend athmetry athmetry-backend"
  "athmetry-frontend athmetry athmetry-frontend"
  "athmetry-system-status athmetry athmetry-system-status"
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
# Collect workflows for a single repository
# ---------------------------------------------------------------------------
#
# Fetches all workflows and their latest runs for a repository.
# Outputs a JSON object representing the repo's status entry.
collect_repo() {
  local repo_name="$1"
  local owner="$2"
  local repo="$3"
  local error=""
  local workflows_json="[]"

  # Fetch all workflows for the repository
  local workflows_payload
  if ! workflows_payload=$(gh_api "/repos/${owner}/${repo}/actions/workflows" --jq '.' 2>/dev/null); then
    error="Failed to fetch workflows from GitHub API."
  fi

  if [[ -z "${error:-}" ]] && [[ -n "${workflows_payload:-}" ]]; then
    local total_count
    total_count=$(printf '%s' "$workflows_payload" | jq -r '.total_count // 0')

    if [[ "$total_count" -gt 0 ]]; then
      local workflows_array
      workflows_array=$(printf '%s' "$workflows_payload" | jq -c '.workflows')

      # Filter to only active workflows (not disabled/removed)
      local active_workflows
      active_workflows=$(printf '%s' "$workflows_array" | jq -c '[.[] | select(.state == "active")]')

      local active_count
      active_count=$(printf '%s' "$active_workflows" | jq 'length')

      if [[ "$active_count" -gt 0 ]]; then
        local workflow_entries="["
        local first_wf=1

        # For each active workflow, fetch its latest runs
        while IFS= read -r workflow; do
          local wf_id wf_name wf_path wf_state wf_html_url
          wf_id=$(printf '%s' "$workflow" | jq -r '.id')
          wf_name=$(printf '%s' "$workflow" | jq -r '.name')
          wf_path=$(printf '%s' "$workflow" | jq -r '.path')
          wf_state=$(printf '%s' "$workflow" | jq -r '.state')
          wf_html_url=$(printf '%s' "$workflow" | jq -r '.html_url')

          # Fetch latest runs for this workflow
          local runs_payload runs_array="[]"
          if runs_payload=$(gh_api "/repos/${owner}/${repo}/actions/workflows/${wf_id}/runs?branch=${BRANCH}&per_page=${MAX_RUNS_PER_WORKFLOW}" --jq '.' 2>/dev/null); then
            local runs_total
            runs_total=$(printf '%s' "$runs_payload" | jq -r '.total_count // 0')
            if [[ "$runs_total" -gt 0 ]]; then
              runs_array=$(printf '%s' "$runs_payload" | jq -c '.workflow_runs')
            fi
          fi

          # Self-monitoring: the collector observes its own execution as
          # in_progress/queued while it is running. Reporting that as the latest
          # run would pin the dashboard to "Running" on every collection cycle,
          # so prefer the most recent completed run for the collector's own
          # workflow. Fall back to the raw list on the very first run, when no
          # completed run exists yet.
          if [[ "$repo" == "athmetry-system-status" && "$wf_path" == ".github/workflows/collect-status.yml" ]]; then
            local completed_runs
            completed_runs=$(printf '%s' "$runs_array" | jq -c '[.[] | select(.status == "completed")]')
            if [[ "$(printf '%s' "$completed_runs" | jq 'length')" -gt 0 ]]; then
              runs_array="$completed_runs"
            fi
          fi

          local wf_latest_run="null"
          local wf_history="[]"
          local wf_latest_status="unknown"
          local wf_latest_conclusion="unknown"
          local wf_latest_run_id=""
          local wf_latest_run_number=0
          local wf_latest_run_url=""
          local wf_latest_commit_sha=""
          local wf_latest_commit_message=""
          local wf_latest_commit_author=""
          local wf_latest_started_at=""
          local wf_latest_completed_at=""
          local wf_jobs="[]"

          if printf '%s' "$runs_array" | jq -e 'length > 0' >/dev/null 2>&1; then
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

            # Fetch job-level details for the latest run
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

            # Fetch commit details for the head SHA
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

            wf_latest_run_id="$run_id"
            wf_latest_run_number="$run_number"
            wf_latest_run_url="$html_url"
            wf_latest_commit_sha="$head_sha"
            wf_latest_commit_message="$commit_message"
            wf_latest_commit_author="$commit_author"
            wf_latest_started_at="$started_at"
            wf_latest_completed_at="$completed_at"
            wf_latest_status="$status"
            wf_latest_conclusion="$conclusion"
            wf_jobs="$jobs_array"

            # Build latest run object
            wf_latest_run=$(jq -n \
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

            # Build history array for this workflow
            wf_history=$(printf '%s' "$runs_array" | jq -c '
              [.[] | {
                runNumber: (if .run_number != null then (.run_number | tonumber) else 0 end),
                status: .status,
                conclusion: .conclusion,
                commitSha: .head_sha,
                startedAt: (if .run_started_at != null then .run_started_at else .created_at end),
                completedAt: .updated_at,
                runUrl: .html_url
              }]')
          fi

          # Determine effective status for this workflow
          local effective_status="unknown"
          if [[ "$wf_latest_status" != "unknown" ]] || [[ "$wf_latest_conclusion" != "unknown" ]]; then
            if [[ "$wf_latest_status" == "completed" ]]; then
              case "$wf_latest_conclusion" in
                success) effective_status="success" ;;
                failure|action_required) effective_status="failure" ;;
                cancelled) effective_status="cancelled" ;;
                timed_out) effective_status="failure" ;;
                skipped) effective_status="skipped" ;;
                *) effective_status="unknown" ;;
              esac
            elif [[ "$wf_latest_status" == "in_progress" ]]; then
              effective_status="running"
            elif [[ "$wf_latest_status" == "queued" ]]; then
              effective_status="queued"
            elif [[ "$wf_latest_status" == "failure" ]]; then
              effective_status="failure"
            fi
          fi

          # Build workflow entry
          local wf_entry
          wf_entry=$(jq -n \
            --arg id "$wf_id" \
            --arg name "$wf_name" \
            --arg path "$wf_path" \
            --arg state "$wf_state" \
            --arg html_url "$wf_html_url" \
            --arg effective_status "$effective_status" \
            --arg latest_status "$wf_latest_status" \
            --arg latest_conclusion "$wf_latest_conclusion" \
            --argjson latestRun "$wf_latest_run" \
            --argjson history "$wf_history" \
            '{
              id: ($id | tonumber),
              name: $name,
              path: $path,
              state: $state,
              html_url: $html_url,
              effectiveStatus: $effective_status,
              latestStatus: $latest_status,
              latestConclusion: $latest_conclusion,
              latestRun: $latestRun,
              history: $history
            }')

          if [[ $first_wf -eq 1 ]]; then
            first_wf=0
          else
            workflow_entries+=","
          fi
          workflow_entries+="$wf_entry"
        done <<< "$(printf '%s' "$active_workflows" | jq -c '.[]')"

        workflow_entries+="]"
        workflows_json="$workflow_entries"
      else
        # No active workflows found
        error=""
        workflows_json="[]"
      fi
    else
      # No workflows found on this branch
      error=""
      workflows_json="[]"
    fi
  fi

  # Determine overall repo status from workflows
  local repo_overall_status="unknown"
  if [[ "$workflows_json" != "[]" ]]; then
    local has_failure=false has_running=false any_data=false
    while IFS= read -r wf; do
      local eff_status
      eff_status=$(printf '%s' "$wf" | jq -r '.effectiveStatus')
      if [[ "$eff_status" == "failure" ]]; then
        has_failure=true
        any_data=true
      elif [[ "$eff_status" == "running" ]] || [[ "$eff_status" == "queued" ]]; then
        has_running=true
        any_data=true
      elif [[ "$eff_status" == "success" ]]; then
        any_data=true
      fi
    done <<< "$(printf '%s' "$workflows_json" | jq -c '.[]')"

    if [[ "$any_data" == "true" ]]; then
      if [[ "$has_failure" == "true" ]]; then
        repo_overall_status="failure"
      elif [[ "$has_running" == "true" ]]; then
        repo_overall_status="running"
      else
        repo_overall_status="success"
      fi
    fi
  fi

  # Assemble the repo entry with workflows
  local repo_entry
  repo_entry=$(jq -n \
    --arg name "$repo_name" \
    --arg owner "$owner" \
    --arg repo "$repo" \
    --arg error "${error:-}" \
    --arg overallStatus "$repo_overall_status" \
    --argjson workflows "$workflows_json" \
    '{
      name: $name,
      owner: $owner,
      repo: $repo,
      error: (if $error == "" then null else $error end),
      overallStatus: $overallStatus,
      workflows: $workflows
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
      schemaVersion: 2,
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
