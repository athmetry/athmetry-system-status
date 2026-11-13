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
# Backend Event Integration:
#   - Consumes Backend status events from data/status-events/backend.json
#   - Validates event structure, repository identity, product, branch, commit, metadata
#   - Merges valid event data into Backend repository entry
#   - Preserves Frontend and System Status data
#   - Preserves workflow history and last successful build
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
EVENT_FILE="data/status-events/backend.json"
COLLECTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
MAX_RUNS_PER_WORKFLOW=5

# Repositories to monitor. Add entries here to monitor additional repos.
# Format: "repo_name owner repo" (owner/repo usually the same as name).
MONITORED_REPOS=(
  "athmetry-backend athmetry athmetry-backend"
  "athmetry-frontend athmetry athmetry-frontend"
  "athmetry-system-status athmetry athmetry-system-status"
)

# Expected values for Backend event validation
# Note: Reporter sends repository as "owner/repo" format ("athmetry/athmetry-backend")
# We accept both formats and normalize to repo name only
EXPECTED_BACKEND_REPO="athmetry-backend"
EXPECTED_BACKEND_REPO_FULL="athmetry/athmetry-backend"
EXPECTED_PRODUCT="ATHMETRY-WEB"
EXPECTED_BRANCH="main"
EXPECTED_WORKFLOW_URL_PREFIX="https://github.com/athmetry/athmetry-backend/actions/runs/"

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

# Log a message with timestamp.
log() {
  local level="${1:-INFO}"
  local message="${2:-}"
  printf '[%s] %s: %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$level" "$message" >&2
}

# Validate commit SHA: exactly 40 hexadecimal characters.
validate_commit_sha() {
  local sha="${1:-}"
  if [[ -z "$sha" ]] || [[ "$sha" == "null" ]]; then
    return 1
  fi
  if [[ ${#sha} -ne 40 ]]; then
    return 1
  fi
  if ! [[ "$sha" =~ ^[0-9a-fA-F]{40}$ ]]; then
    return 1
  fi
  return 0
}

# Validate workflow run URL: HTTPS URL belonging to github.com/athmetry/athmetry-backend.
validate_workflow_run_url() {
  local url="${1:-}"
  if [[ -z "$url" ]] || [[ "$url" == "null" ]]; then
    return 1
  fi
  if ! [[ "$url" =~ ^https://github\.com/athmetry/athmetry-backend/actions/runs/[0-9]+$ ]]; then
    return 1
  fi
  return 0
}

# Validate positive integer (accepts both string and numeric representations).
validate_positive_integer() {
  local val="${1:-}"
  if [[ -z "$val" ]] || [[ "$val" == "null" ]]; then
    return 1
  fi
  # Remove any quotes if present
  val="${val%\"}"
  val="${val#\"}"
  if ! [[ "$val" =~ ^[0-9]+$ ]]; then
    return 1
  fi
  # Check it's greater than 0
  if [[ "$val" -le 0 ]]; then
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Backend Event Consumption
# ---------------------------------------------------------------------------

# Read and validate the Backend status event.
# Returns 0 on success, 1 on failure.
# Outputs the validated event JSON to stdout.
read_backend_event() {
  if [[ ! -f "$EVENT_FILE" ]]; then
    log "INFO" "Backend event file not found: $EVENT_FILE"
    return 1
  fi

  local event_json
  if ! event_json=$(cat "$EVENT_FILE" 2>/dev/null); then
    log "ERROR" "Failed to read Backend event file: $EVENT_FILE"
    return 1
  fi

  # Validate JSON syntax
  if ! printf '%s' "$event_json" | jq empty 2>/dev/null; then
    log "ERROR" "Backend event file contains invalid JSON: $EVENT_FILE"
    return 1
  fi

  # Validate required top-level structure
  local has_payload has_meta
  has_payload=$(printf '%s' "$event_json" | jq -e 'has("payload")' >/dev/null 2>&1 && echo true || echo false)
  has_meta=$(printf '%s' "$event_json" | jq -e 'has("meta")' >/dev/null 2>&1 && echo true || echo false)

  if [[ "$has_payload" != "true" ]] || [[ "$has_meta" != "true" ]]; then
    log "ERROR" "Backend event missing required top-level fields (payload, meta)"
    return 1
  fi

  # Validate payload fields
  local payload_repo payload_product payload_branch payload_display_name
  payload_repo=$(printf '%s' "$event_json" | jq -r '.payload.repository // ""')
  payload_product=$(printf '%s' "$event_json" | jq -r '.payload.product // ""')
  payload_branch=$(printf '%s' "$event_json" | jq -r '.payload.branch // ""')
  payload_display_name=$(printf '%s' "$event_json" | jq -r '.payload.displayName // ""')

  # Normalize repository: accept both "athmetry-backend" and "athmetry/athmetry-backend"
  local normalized_repo
  if [[ "$payload_repo" == "$EXPECTED_BACKEND_REPO_FULL" ]]; then
    normalized_repo="$EXPECTED_BACKEND_REPO"
  else
    normalized_repo="$payload_repo"
  fi

  if [[ "$normalized_repo" != "$EXPECTED_BACKEND_REPO" ]]; then
    log "ERROR" "Backend event repository mismatch: expected '$EXPECTED_BACKEND_REPO' or '$EXPECTED_BACKEND_REPO_FULL', got '$payload_repo'"
    return 1
  fi

  if [[ "$payload_product" != "$EXPECTED_PRODUCT" ]]; then
    log "ERROR" "Backend event product mismatch: expected '$EXPECTED_PRODUCT', got '$payload_product'"
    return 1
  fi

  if [[ "$payload_branch" != "$EXPECTED_BRANCH" ]]; then
    log "ERROR" "Backend event branch mismatch: expected '$EXPECTED_BRANCH', got '$payload_branch'"
    return 1
  fi

  # Validate commit SHA
  local commit_sha
  commit_sha=$(printf '%s' "$event_json" | jq -r '.payload.commit.sha // ""')
  if ! validate_commit_sha "$commit_sha"; then
    log "ERROR" "Backend event commit SHA is invalid (must be 40 hex characters): $commit_sha"
    return 1
  fi

  # Validate workflow fields
  # Note: Reporter provides runId (workflow run ID), not workflow definition ID
  # Reporter does NOT provide workflow.path - we'll use name for matching
  local workflow_run_url workflow_run_number workflow_run_id workflow_status workflow_conclusion
  workflow_run_url=$(printf '%s' "$event_json" | jq -r '.payload.workflow.runUrl // ""')
  workflow_run_number=$(printf '%s' "$event_json" | jq -r '.payload.workflow.runNumber // 0')
  workflow_run_id=$(printf '%s' "$event_json" | jq -r '.payload.workflow.id // .payload.workflow.runId // 0')
  workflow_status=$(printf '%s' "$event_json" | jq -r '.payload.workflow.status // ""')
  workflow_conclusion=$(printf '%s' "$event_json" | jq -r '.payload.workflow.conclusion // ""')

  if ! validate_workflow_run_url "$workflow_run_url"; then
    log "ERROR" "Backend event workflow run URL is invalid (must be github.com/athmetry/athmetry-backend): $workflow_run_url"
    return 1
  fi

  if ! validate_positive_integer "$workflow_run_number"; then
    log "ERROR" "Backend event workflow runNumber is not a valid positive integer: $workflow_run_number"
    return 1
  fi

  # workflow.id is optional (reporter provides runId instead)
  if [[ -n "$workflow_run_id" ]] && [[ "$workflow_run_id" != "0" ]] && [[ "$workflow_run_id" != "null" ]]; then
    if ! validate_positive_integer "$workflow_run_id"; then
      log "ERROR" "Backend event workflow id/runId is not a valid positive integer: $workflow_run_id"
      return 1
    fi
  fi

  if [[ -z "$workflow_status" ]] || [[ "$workflow_status" == "null" ]]; then
    log "ERROR" "Backend event workflow status is missing"
    return 1
  fi

  if [[ -z "$workflow_conclusion" ]] || [[ "$workflow_conclusion" == "null" ]]; then
    log "ERROR" "Backend event workflow conclusion is missing"
    return 1
  fi

  # Validate meta fields
  local meta_source_run_id meta_source_run_attempt meta_version
  meta_source_run_id=$(printf '%s' "$event_json" | jq -r '.meta.sourceRunId // ""')
  meta_source_run_attempt=$(printf '%s' "$event_json" | jq -r '.meta.sourceRunAttempt // ""')
  meta_version=$(printf '%s' "$event_json" | jq -r '.meta.version // ""')

  if [[ -z "$meta_source_run_id" ]] || [[ "$meta_source_run_id" == "null" ]]; then
    log "ERROR" "Backend event missing meta.sourceRunId"
    return 1
  fi

  if [[ -z "$meta_source_run_attempt" ]] || [[ "$meta_source_run_attempt" == "null" ]]; then
    log "ERROR" "Backend event missing meta.sourceRunAttempt"
    return 1
  fi

  # Validate run ID and attempt are positive integers (handle string representation)
  if ! validate_positive_integer "$meta_source_run_id"; then
    log "ERROR" "Backend event meta.sourceRunId is not a valid positive integer: $meta_source_run_id"
    return 1
  fi

  if ! validate_positive_integer "$meta_source_run_attempt"; then
    log "ERROR" "Backend event meta.sourceRunAttempt is not a valid positive integer: $meta_source_run_attempt"
    return 1
  fi

  # Validate meta version
  if [[ -z "$meta_version" ]] || [[ "$meta_version" == "null" ]]; then
    log "WARN" "Backend event missing meta.version"
  fi

  log "INFO" "Backend event validation passed: runId=$meta_source_run_id, attempt=$meta_source_run_attempt"
  printf '%s' "$event_json"
  return 0
}

# Merge Backend event data into the Backend repository entry.
# Args: $1 = existing Backend repo JSON, $2 = validated event JSON
# Outputs merged Backend repo JSON to stdout.
merge_backend_event() {
  local existing_repo_json="$1"
  local event_json="$2"

  if [[ -z "$existing_repo_json" ]] || [[ "$existing_repo_json" == "null" ]]; then
    log "ERROR" "Existing Backend repo JSON is empty"
    return 1
  fi

  if [[ -z "$event_json" ]] || [[ "$event_json" == "null" ]]; then
    log "INFO" "No Backend event to merge, preserving existing data"
    printf '%s' "$existing_repo_json"
    return 0
  fi

  # Extract event data
  local event_workflow event_reported_at event_commit event_branch meta_source_run_id meta_source_run_attempt
  event_workflow=$(printf '%s' "$event_json" | jq -c '.payload.workflow // {}')
  event_reported_at=$(printf '%s' "$event_json" | jq -r '.payload.reportedAt // ""')
  event_commit=$(printf '%s' "$event_json" | jq -c '.payload.commit // {}')
  event_branch=$(printf '%s' "$event_json" | jq -r '.payload.branch // ""')
  meta_source_run_id=$(printf '%s' "$event_json" | jq -r '.meta.sourceRunId // ""')
  meta_source_run_attempt=$(printf '%s' "$event_json" | jq -r '.meta.sourceRunAttempt // ""')

  # Normalize run ID and attempt (remove quotes if present)
  meta_source_run_id="${meta_source_run_id%\"}"
  meta_source_run_id="${meta_source_run_id#\"}"
  meta_source_run_attempt="${meta_source_run_attempt%\"}"
  meta_source_run_attempt="${meta_source_run_attempt#\"}"

  # Extract existing Backend workflows
  local existing_workflows
  existing_workflows=$(printf '%s' "$existing_repo_json" | jq -c '.workflows // []')

  # Find the existing workflow that matches the event's workflow
  # Reporter provides workflow name but not path; try name first, then fall back to path
  local workflow_name
  workflow_name=$(printf '%s' "$event_workflow" | jq -r '.name // "CI"')
  local workflow_path
  workflow_path=$(printf '%s' "$event_workflow" | jq -r '.path // ""')

  local existing_workflow_json
  if [[ -n "$workflow_name" ]] && [[ "$workflow_name" != "null" ]]; then
    # Try matching by name first (reporter provides name)
    existing_workflow_json=$(printf '%s' "$existing_workflows" | jq -c --arg name "$workflow_name" 'map(select(.name == $name))[0] // null')
  fi
  
  # If no match by name, try path (if provided)
  if [[ "$existing_workflow_json" == "null" ]] && [[ -n "$workflow_path" ]] && [[ "$workflow_path" != "null" ]]; then
    existing_workflow_json=$(printf '%s' "$existing_workflows" | jq -c --arg path "$workflow_path" 'map(select(.path == $path))[0] // null')
  fi
  
  # If still no match and we have no path, use default
  if [[ "$existing_workflow_json" == "null" ]] && ( [[ -z "$workflow_path" ]] || [[ "$workflow_path" == "null" ]] ); then
    workflow_path=".github/workflows/ci.yml"
  fi

  # Get the latest run ID and attempt from existing data for comparison
  local existing_latest_run_id existing_latest_run_attempt existing_history
  if [[ "$existing_workflow_json" != "null" ]] && [[ -n "$existing_workflow_json" ]]; then
    existing_latest_run_id=$(printf '%s' "$existing_workflow_json" | jq -r '.latestRun.runId // 0')
    existing_latest_run_attempt=$(printf '%s' "$existing_workflow_json" | jq -r '.latestRun.runAttempt // 0')
    existing_history=$(printf '%s' "$existing_workflow_json" | jq -c '.history // []')
  else
    existing_latest_run_id=0
    existing_latest_run_attempt=0
    existing_history="[]"
  fi

  # If existing data has a newer run, or same run with higher/equal attempt, don't overwrite
  if [[ -n "$existing_latest_run_id" ]] && [[ "$existing_latest_run_id" -gt 0 ]]; then
    if [[ "$meta_source_run_id" -lt "$existing_latest_run_id" ]]; then
      log "INFO" "Existing Backend data has newer run ID ($existing_latest_run_id > $meta_source_run_id), preserving existing data"
      printf '%s' "$existing_repo_json"
      return 0
    elif [[ "$meta_source_run_id" -eq "$existing_latest_run_id" ]]; then
      if [[ "$meta_source_run_attempt" -le "$existing_latest_run_attempt" ]]; then
        log "INFO" "Existing Backend data has same run ID with higher/equal attempt ($existing_latest_run_attempt >= $meta_source_run_attempt), preserving existing data"
        printf '%s' "$existing_repo_json"
        return 0
      else
        log "INFO" "New Backend event has same run ID with higher attempt ($meta_source_run_attempt > $existing_latest_run_attempt), updating"
      fi
    else
      log "INFO" "New Backend event has newer run ID ($meta_source_run_id > $existing_latest_run_id), updating"
    fi
  fi

  # Build the updated workflow entry from the event
  local workflow_name workflow_status workflow_conclusion workflow_started_at workflow_completed_at workflow_jobs workflow_run_url workflow_run_number workflow_id
  workflow_name=$(printf '%s' "$event_workflow" | jq -r '.name // "CI"')
  workflow_path=$(printf '%s' "$event_workflow" | jq -r '.path // ".github/workflows/ci.yml"')
  workflow_status=$(printf '%s' "$event_workflow" | jq -r '.status // "completed"')
  workflow_conclusion=$(printf '%s' "$event_workflow" | jq -r '.conclusion // "success"')
  workflow_started_at=$(printf '%s' "$event_workflow" | jq -r '.startedAt // ""')
  workflow_completed_at=$(printf '%s' "$event_workflow" | jq -r '.completedAt // ""')
  workflow_jobs=$(printf '%s' "$event_workflow" | jq -c '.jobs // []')
  workflow_run_url=$(printf '%s' "$event_workflow" | jq -r '.runUrl // ""')
  workflow_run_number=$(printf '%s' "$event_workflow" | jq -r '.runNumber // 0')
  workflow_id=$(printf '%s' "$event_workflow" | jq -r '.id // 0')

  # Get commit details from event
  local commit_sha commit_message commit_author
  commit_sha=$(printf '%s' "$event_commit" | jq -r '.sha // ""')
  commit_message=$(printf '%s' "$event_commit" | jq -r '.message // ""')
  commit_author=$(printf '%s' "$event_commit" | jq -r '.author // ""')

  # Determine effective status from workflow status and conclusion
  local effective_status
  if [[ "$workflow_status" == "completed" ]]; then
    case "$workflow_conclusion" in
      success) effective_status="success" ;;
      failure|action_required) effective_status="failure" ;;
      cancelled) effective_status="cancelled" ;;
      timed_out) effective_status="failure" ;;
      skipped) effective_status="skipped" ;;
      *) effective_status="unknown" ;;
    esac
  elif [[ "$workflow_status" == "in_progress" ]]; then
    effective_status="running"
  elif [[ "$workflow_status" == "queued" ]]; then
    effective_status="queued"
  elif [[ "$workflow_status" == "failure" ]]; then
    effective_status="failure"
  else
    effective_status="unknown"
  fi

  # Build latest run object
  local latest_run_json
  latest_run_json=$(jq -n \
    --arg status "$workflow_status" \
    --arg conclusion "$workflow_conclusion" \
    --arg runId "$meta_source_run_id" \
    --arg runNumber "$workflow_run_number" \
    --arg runUrl "$workflow_run_url" \
    --arg commitSha "$commit_sha" \
    --arg commitMessage "$commit_message" \
    --arg commitAuthor "$commit_author" \
    --arg startedAt "$workflow_started_at" \
    --arg completedAt "$workflow_completed_at" \
    --argjson jobs "$workflow_jobs" \
    --arg runAttempt "$meta_source_run_attempt" \
    '{
      status: $status,
      conclusion: $conclusion,
      runId: ($runId | tonumber? // 0),
      runNumber: ($runNumber | tonumber? // 0),
      runAttempt: ($runAttempt | tonumber? // 0),
      runUrl: $runUrl,
      commitSha: $commitSha,
      commitMessage: $commitMessage,
      commitAuthor: $commitAuthor,
      startedAt: $startedAt,
      completedAt: $completedAt,
      jobs: $jobs
    }')

  # Build history entry for this run
  local new_history_entry
  new_history_entry=$(jq -n \
    --arg runNumber "$workflow_run_number" \
    --arg status "$workflow_status" \
    --arg conclusion "$workflow_conclusion" \
    --arg commitSha "$commit_sha" \
    --arg startedAt "$workflow_started_at" \
    --arg completedAt "$workflow_completed_at" \
    --arg runUrl "$workflow_run_url" \
    '{
      runNumber: ($runNumber | tonumber? // 0),
      status: $status,
      conclusion: $conclusion,
      commitSha: $commitSha,
      startedAt: $startedAt,
      completedAt: $completedAt,
      runUrl: $runUrl
    }')

  # Merge history: add new entry to existing history, deduplicate by runNumber, keep newest first, limit to MAX_RUNS_PER_WORKFLOW
  local merged_history
  merged_history=$(printf '%s' "$existing_history" | jq --argjson new_entry "$new_history_entry" --argjson max_runs "$MAX_RUNS_PER_WORKFLOW" '
    # Add new entry to history
    . + [$new_entry]
    # Deduplicate by runNumber (keep first occurrence which is newest since we prepend)
    | unique_by(.runNumber)
    # Sort by runNumber descending (newest first)
    | sort_by(-.runNumber)
    # Limit to max_runs
    | .[:$max_runs]
  ')

  # Build workflow entry with preserved history
  if [[ "$workflow_id" == "0" ]] || [[ "$workflow_id" == "null" ]]; then
    # Generate a stable ID from the workflow path
    workflow_id=$(printf '%s' "$workflow_path" | cksum | awk '{print $1}')
  fi

  local updated_workflow_json
  updated_workflow_json=$(jq -n \
    --arg id "$workflow_id" \
    --arg name "$workflow_name" \
    --arg path "$workflow_path" \
    --arg state "active" \
    --arg html_url "$workflow_run_url" \
    --arg effective_status "$effective_status" \
    --arg latest_status "$workflow_status" \
    --arg latest_conclusion "$workflow_conclusion" \
    --argjson latestRun "$latest_run_json" \
    --argjson history "$merged_history" \
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

  # Merge: replace or add the workflow in the existing workflows array
  local merged_workflows
  merged_workflows=$(printf '%s' "$existing_workflows" | jq --argjson new_wf "$updated_workflow_json" '
    # Remove any existing workflow with the same path
    map(select(.path != ($new_wf | .path))) | . + [$new_wf]
  ')

  # Determine overall repo status from merged workflows
  local repo_overall_status="unknown"
  if [[ "$merged_workflows" != "[]" ]]; then
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
    done <<< "$(printf '%s' "$merged_workflows" | jq -c '.[]')"

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

  # Build the final merged repo entry
  local merged_repo_json
  merged_repo_json=$(printf '%s' "$existing_repo_json" | jq \
    --argjson workflows "$merged_workflows" \
    --arg overallStatus "$repo_overall_status" \
    --arg error "null" \
    '.workflows = $workflows | .overallStatus = $overallStatus | .error = ($error | fromjson?)')

  printf '%s' "$merged_repo_json"
  return 0
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
  if [[ -z "${ATHMETRY_GITHUB_TOKEN:-}" ]]; then
    echo "ERROR: ATHMETRY_GITHUB_TOKEN environment variable is not set." >&2
    exit 1
  fi

  # Authenticate gh CLI for the duration of this run.
  export GH_TOKEN="$ATHMETRY_GITHUB_TOKEN"
  export GH_REPO="$REPO_OWNER/athmetry-system-status"

  local entries="["
  local first=1
  local backend_repo_json=""

  # First, collect data for all repositories via GitHub API
  for entry in "${MONITORED_REPOS[@]}"; do
    # shellcheck disable=SC2086
    set -- $entry
    local repo_name="$1" owner="$2" repo="$3"

    local repo_json
    repo_json=$(collect_repo "$repo_name" "$owner" "$repo")

    # Store Backend repo JSON for later event merging
    if [[ "$repo_name" == "athmetry-backend" ]]; then
      backend_repo_json="$repo_json"
    fi

    if [[ $first -eq 1 ]]; then
      first=0
    else
      entries+=","
    fi
    entries+="$repo_json"
  done
  entries+="]"

  # Try to consume and merge Backend event
  local event_json
  if event_json=$(read_backend_event); then
    log "INFO" "Merging Backend event into Backend repository data"
    local merged_backend_json
    if merged_backend_json=$(merge_backend_event "$backend_repo_json" "$event_json"); then
      # Replace the Backend entry in the entries array
      entries=$(printf '%s' "$entries" | jq --argjson merged "$merged_backend_json" '
        map(if .name == "athmetry-backend" then $merged else . end)
      ')
      log "INFO" "Backend event merged successfully"
    else
      log "WARN" "Failed to merge Backend event, preserving API-collected data"
    fi
  else
    log "INFO" "No valid Backend event found, using API-collected data only"
  fi

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

# Only run main when script is executed directly, not sourced
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi