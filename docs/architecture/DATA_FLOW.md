# Data Flow

## Overview

This document describes the complete data lifecycle from GitHub Actions workflow runs to the rendered dashboard.

---

## 1. Collector Data Acquisition

### Source APIs

The collector script (`.github/scripts/collect-status.sh`) calls the GitHub REST API via `gh` CLI:

| API Endpoint | Purpose | Parameters |
|--------------|---------|------------|
| `GET /repos/{owner}/{repo}/actions/workflows` | Discover all workflows for the repository | — |
| `GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs` | Recent runs for one workflow | `branch=main`, `per_page=5` |
| `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs` | Job-level details for the latest run | — |
| `GET /repos/{owner}/{repo}/commits/{sha}` | Commit metadata for the latest run | — |

The collector discovers workflows dynamically; it does not use a hardcoded
workflow list. Only workflows whose `state` is `active` are included. Each
active workflow contributes its own latest run and a history array of up to
five runs (`MAX_RUNS_PER_WORKFLOW=5`).

### Authentication

- **Token**: `ATHMETRY_GITHUB_TOKEN` (fine-grained PAT)
- **Scope**: Read Actions + Contents on `athmetry-backend`, `athmetry-frontend`, and `athmetry-system-status`; Read/Write Contents on `athmetry-system-status`
- **Mechanism**: Exported as `GH_TOKEN` for `gh` CLI; `GITHUB_TOKEN` used separately for git push

### Repositories Monitored

Configured in `MONITORED_REPOS` array (`.github/scripts/collect-status.sh`):

```bash
MONITORED_REPOS=(
  "athmetry-backend athmetry athmetry-backend"
  "athmetry-frontend athmetry athmetry-frontend"
  "athmetry-system-status athmetry athmetry-system-status"
)
```

Format: `"repo_name owner repo"`

### Branch

- Hardcoded: `BRANCH="${BRANCH:-main}"`
- All repos monitored on `main` branch only

### Self-Monitoring

- The collector's own workflow (`collect-status.yml`) **is included** for the `athmetry-system-status` repository
- A collector run always observes itself as `in_progress`, so reporting the raw latest run would pin the dashboard to "Running" on every cycle
- The collector therefore reports the most recent **completed** run for its own workflow (falling back to the raw list on the very first run)
- Failed collector executions remain visible as `failure`
- Other repositories' workflows are unaffected
- Implemented in `.github/scripts/collect-status.sh` via workflow path matching

---

## 2. Data Normalization (Collector)

### Effective Status Derivation

The **collector** derives `effectiveStatus` for each workflow from GitHub's raw
`status` and `conclusion` fields and stores the result in `data/status.json`.
The frontend renders the stored value; it does not re-derive status. The
collector also derives `repo.overallStatus` (see below).

| GitHub `status` | GitHub `conclusion` | `effectiveStatus` written by collector |
|-----------------|---------------------|----------------------------------------|
| `completed` | `success` | `success` |
| `completed` | `failure` / `action_required` | `failure` |
| `completed` | `cancelled` | `cancelled` |
| `completed` | `timed_out` | `failure` |
| `completed` | `skipped` | `skipped` |
| `in_progress` | `null` | `running` |
| `queued` | `null` | `queued` |
| `failure` | `null` | `failure` |
| Anything else | Anything | `unknown` |

Repository-level `overallStatus` is derived from the repository's workflows:

| Condition (any workflow) | `repo.overallStatus` |
|--------------------------|----------------------|
| Any `effectiveStatus` is `failure` | `failure` |
| Otherwise, any is `running` or `queued` | `running` |
| Otherwise, at least one is `success` | `success` |
| No workflows or no usable status | `unknown` |

### Data Enrichment

For each repository, the collector adds:

- **Workflow discovery**: `id`, `name`, `path`, `state`, `html_url` for each active workflow
- **Latest run details**: `runId`, `runNumber`, `runUrl`, `commitSha`, `commitMessage`, `commitAuthor`, `startedAt`, `completedAt`, `jobs[]`
- **Job details**: Array of `{ name, status, conclusion, started_at, completed_at }`
- **Commit details**: Message (first line) and author name
- **Per-workflow history**: Up to 5 runs (`MAX_RUNS_PER_WORKFLOW=5`) with `runNumber`, `status`, `conclusion`, `commitSha`, `startedAt`, `completedAt`, `runUrl`

---

## 3. Status JSON Schema (schemaVersion: 2)

```json
{
  "schemaVersion": 2,
  "collectedAt": "2026-11-12T10:30:00Z",
  "monitoredBranch": "main",
  "repositories": [
    {
      "name": "athmetry-backend",
      "owner": "athmetry",
      "repo": "athmetry-backend",
      "error": null,
      "overallStatus": "success",
      "workflows": [
        {
          "id": 12345678,
          "name": "CI",
          "path": ".github/workflows/ci.yml",
          "state": "active",
          "html_url": "https://github.com/athmetry/athmetry-backend/actions/workflows/ci.yml",
          "effectiveStatus": "success",
          "latestStatus": "completed",
          "latestConclusion": "success",
          "latestRun": {
            "status": "completed",
            "conclusion": "success",
            "runId": 43098606454,
            "runNumber": 16,
            "runUrl": "https://github.com/athmetry/athmetry-backend/actions/runs/43098606454",
            "commitSha": "a75dca316d3235318f832222d66ec222d8b950d3",
            "commitMessage": "feat(auth): implement password recovery and management",
            "commitAuthor": "mdtausif1",
            "startedAt": "2026-11-12T10:22:56Z",
            "completedAt": "2026-11-12T10:25:14Z",
            "jobs": [
              {
                "name": "build",
                "status": "completed",
                "conclusion": "success",
                "started_at": "2026-11-12T10:23:00Z",
                "completed_at": "2026-11-12T10:25:10Z"
              }
            ]
          },
          "history": [
            {
              "runNumber": 16,
              "status": "completed",
              "conclusion": "success",
              "commitSha": "a75dca316d3235318f832222d66ec222d8b950d3",
              "startedAt": "2026-11-12T10:22:56Z",
              "completedAt": "2026-11-12T10:25:14Z",
              "runUrl": "https://github.com/athmetry/athmetry-backend/actions/runs/43098606454"
            }
          ]
        }
      ]
    }
  ],
  "notes": "Populated by the collect-status GitHub Actions workflow. Do not edit by hand."
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | integer | Increment for breaking changes (current: 2) |
| `collectedAt` | ISO 8601 UTC | Timestamp when collector ran |
| `monitoredBranch` | string | Branch name (currently `main`) |
| `repositories[]` | array | One entry per monitored repo |
| `repo.name` | string | Display name (e.g., `athmetry-backend`) |
| `repo.owner` | string | GitHub owner (`athmetry`) |
| `repo.repo` | string | Repository name |
| `repo.error` | string/null | Collector error message or null |
| `repo.overallStatus` | string | Derived status: `success`|`failure`|`running`|`unknown` |
| `repo.workflows[]` | array | Array of workflow objects |
| `repo.workflows[].id` | integer | GitHub workflow ID |
| `repo.workflows[].name` | string | Workflow name |
| `repo.workflows[].path` | string | Workflow file path |
| `repo.workflows[].state` | string | `active`|`disabled`|`deleted` |
| `repo.workflows[].html_url` | string | GitHub Actions workflow URL |
| `repo.workflows[].effectiveStatus` | string | Derived: `success`|`failure`|`running`|`queued`|`unknown` |
| `repo.workflows[].latestStatus` | string | GitHub `status` of latest run |
| `repo.workflows[].latestConclusion` | string | GitHub `conclusion` of latest run |
| `repo.workflows[].latestRun` | object/null | Most recent run: `status`, `conclusion`, `runId`, `runNumber`, `runUrl`, `commitSha`, `commitMessage`, `commitAuthor`, `startedAt`, `completedAt`, `jobs[]` |
| `repo.workflows[].history[]` | array | Up to 5 runs (newest first) |

### History Entry Fields

| Field | Type | Description |
|-------|------|-------------|
| `runNumber` | integer | GitHub run number |
| `status` | string | GitHub `status` field |
| `conclusion` | string/null | GitHub `conclusion` field |
| `commitSha` | string | Commit SHA |
| `startedAt` | ISO 8601 | Run started timestamp |
| `completedAt` | ISO 8601 | Run completed timestamp |
| `runUrl` | string | GitHub Actions run URL |

---

## 4. Collector Output Logic

### Change Detection

```bash
# Write new content to temp file
printf '%s\n' "$new_content" > "$tmp_file"

# Compare with existing
if [[ -f "$STATUS_FILE" ]] && cmp -s "$tmp_file" "$STATUS_FILE"; then
  echo "Status data unchanged; skipping commit."
  exit 0
fi

# Only copy and commit if different
cp "$tmp_file" "$STATUS_FILE"
```

- Uses `cmp -s` (byte-for-byte comparison)
- Commits only when JSON content actually changes
- Prevents empty commits on every 5-minute run

### Commit Message Format

```
chore(status): update pipeline status data (2026-11-11T20:58:56Z)
```

- Timestamp matches `collectedAt` in JSON
- Conventional commit prefix `chore(status):`

---

## 5. Frontend Data Consumption

### Fetch Strategy

```javascript
// api.js
const url = `${STATUS_JSON_PATH}?t=${Date.now()}`;
const response = await fetch(url, { cache: "no-store" });
```

- **Cache-busting**: Query parameter `?t=<timestamp>`
- **Cache-Control**: `cache: "no-store"` (bypass browser cache)
- **No CDN cache-busting**: GitHub Pages may cache; timestamp helps

### Refresh Triggers

| Trigger | Interval | Function |
|---------|----------|----------|
| Auto-refresh | 60 seconds | `setInterval(renderDashboard, 60000)` |
| Manual refresh | On click | `handleManualRefresh()` → `renderDashboard()` |
| Initial load | Once | `init()` → `renderDashboard()` |

### Stale Data Detection

```javascript
// api.js
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

isStale() {
  return Date.now() - this.lastFetchAt > STALE_THRESHOLD_MS;
}
```

- **Frontend threshold**: 10 minutes (independent of collector schedule)
- **Collector schedule**: Every 5 minutes
- **Result**: Stale warning appears if collector fails for >2 consecutive runs

### Alert Conditions (Frontend)

1. **Stale Data**: `collectedAt` age > 10 minutes
2. **No Collection Timestamp**: `collectedAt` missing
3. **Repo Error**: `repo.error` present (collector API failure)
4. **Network / Validation Error**: `fetch` fails or data fails validation →
   `renderErrorState()` shows "Unable to load status data..." in the overall
   card and clears all three repository cards (counts reset to `0`)

---

## 6. Rendering Pipeline (Frontend)

```
renderDashboard(data)
    │
    ├─► No data or no repositories array?
    │     └─► renderErrorState(message): overall "Error",
    │           all three cards "Error loading data", counts 0
    │
    ├─► Header metadata
    │     ├─► monitored-branch: data.monitoredBranch
    │     ├─► last-collected-at: formatRelativeTime/formatDateTime(data.collectedAt)
    │     └─► last-updated: browser fetch time on initial load and each refresh (app.js)
    │
    ├─► renderOverallStatus(data)
    │     ├─► Aggregate repo.overallStatus across all repositories
    │     ├─► Update overall pill/detail text
    │     └─► Latest successful workflow completion → "Last successful build"
    │
    ├─► renderRepositoryPipelines(repo, repoKey, monitoredBranch) per repo
    │     ├─► Repo status pill from repo.overallStatus
    │     ├─► Pipeline count from repo.workflows.length
    │     ├─► Meta: "N pipelines · main branch" (dynamic from data)
    │     ├─► createPipelineRow(workflow) per workflow
    │     │     ├─► Icon: monitor (all three repos)
    │     │     ├─► Product tag: "ATHMETRY-WEB" or "ATHMETRY-SYSTEM-STATUS"
    │     │     ├─► Status dot/label from workflow.effectiveStatus
    │     │     ├─► Latest run number, relative time, duration
    │     │     └─► Details button → showPipelineDetail(workflow)
    │     └─► Layout:
    │           ├─► Left column: Athmetry Backend (full height)
    │           ├─► Right column top: Athmetry System Status
    │           └─► Right column bottom: Athmetry Frontend
    │           └─► Cards auto-size, no clipping, all pipelines visible
    │
    └─► checkAndShowAlerts(data)
          ├─► Repo errors (repo.error) → error alert
          └─► Stale data check (collectedAt > 10 min) → warning alert
```

### Pipeline Detail Dialog

Clicking a pipeline row opens the `pipeline-detail-dialog`. The dialog renders:

- Workflow name, path, and effective status
- Latest run metadata (run number, timestamps, duration, commit SHA/message/author)
- Jobs table from `latestRun.jobs`
- Up to five history entries from `workflow.history`
- "View on GitHub" button whose URL is `latestRun.runUrl` (no hardcoded repository map)

### Product Tags

| Repository | Product Tag |
|------------|-------------|
| `athmetry-backend` | `ATHMETRY-WEB` |
| `athmetry-frontend` | `ATHMETRY-WEB` |
| `athmetry-system-status` | `ATHMETRY-SYSTEM-STATUS` |

**Design**: Small pill/badge styled with blue text on subtle blue background. Independent of health-status badges.

### Dynamic Repository Metadata

- **Pipeline count**: From `repo.workflows.length`
- **Branch name**: From `data.monitoredBranch`
- **Format**: `"N pipelines · main branch"` (e.g., `"5 pipelines · main branch"`)
- **Renders dynamically** — no hardcoded counts

---

## 7. Data Contracts and Versioning

### Schema Versioning

- Current: `schemaVersion: 2`
- **Breaking changes** (require version bump):
  - Removing/renaming fields used by frontend
  - Changing field types
  - Changing status value enum
- **Non-breaking** (no version bump):
  - Adding optional fields
  - Adding new repositories to array
  - Adding new history entries

### Forward Compatibility

Frontend handles missing/optional fields gracefully:
- `repo.error` → null check
- `repo.workflows` → defaults to `[]`
- `repo.workflows[].history` → defaults to `[]`
- `commitSha` → substring with fallback

### Backward Compatibility

Collector always produces all fields (null if unavailable). No optional fields in practice.

---

## 8. Timing Summary

| Event | Frequency | Latency |
|-------|-----------|---------|
| Collector runs | Every 5 minutes | ~30-60 seconds (API calls) |
| JSON committed | On change only | Immediate after collector |
| Pages deploy | On push to main | ~1-3 minutes |
| Frontend auto-refresh | Every 60 seconds | Network RTT (~100-500ms) |
| Manual refresh | On demand | Network RTT + 10s timeout |
| Stale warning | Checked each render | Shows at >10 min data age |

---

## 9. Failure Scenarios and Data State

| Failure Point | Effect on Data | Frontend Behavior |
|---------------|----------------|-------------------|
| Collector API timeout | `repo.error` set, `latestRun` null | Shows error in alert banner |
| Collector auth failure | Workflow fails, no commit | Data stays at last successful commit |
| Git push fails | Workflow fails, no commit | Data stays at last successful commit |
| Pages deploy fails | New JSON not served | Frontend serves cached/old JSON |
| Frontend fetch fails | Network error caught | `renderErrorState()`: overall "Error", all three cards "Error loading data" |
| JSON parse error | Corrupted file | `renderErrorState()` with the parse failure message |
| JSON validation failure | Schema/data-contract violation | `renderErrorState()` with the validation failure message |
| Stale data (>10 min) | N/A (data exists) | Warning banner, data still shown |

---

## 10. Extending the Data Model

### Adding a New Repository

1. Edit `.github/scripts/collect-status.sh`
2. Add to `MONITORED_REPOS` array:
   ```bash
   MONITORED_REPOS=(
     "athmetry-backend athmetry athmetry-backend"
     "athmetry-frontend athmetry athmetry-frontend"
     "athmetry-system-status athmetry athmetry-system-status"
     "new-repo-name athmetry new-repo-name"
   )
   ```
3. Ensure `ATHMETRY_GITHUB_TOKEN` has read access to new repo
4. Commit and push → collector picks up on next run
5. Frontend automatically renders new repo card

**Self-monitoring**: The collector reports the most recent completed run of its own `collect-status.yml` so its card shows real health instead of the in-progress collection run.

### Adding a New Field

1. Update collector script to include field in `repo_entry` jq construction
2. Update frontend (`dashboard.js`) to read and render new field
3. No schema version bump needed if field is additive

### Monitoring a Different Branch

Currently: Single `BRANCH` variable for all repos.

Future: Per-repo branch config would require:
- Change `MONITORED_REPOS` format to include branch
- Update collector loop to use per-repo branch
- Update `monitoredBranch` in JSON to be per-repo or array