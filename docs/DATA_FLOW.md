# Collector Data Flow & Schema Contract

## 1. End-to-End Pipeline Flow

```text
Upstream Push (athmetry-backend / athmetry-frontend main)
  └─► Upstream CI / Security / DB workflows complete
        └─► Upstream Status Reporter writes data/status-events/{backend,frontend}.json to athmetry-system-status main
              │
              ▼
athmetry-system-status main Push (upstream event commit OR direct PR merge)
  ├─► CI Integration Tests (ci-test.yml) ──┐
  └─► Security Scan (security-scan.yml)  ──┴─► on workflow_run completed (main):
                                                 Collect System Status (collect-status.yml)
                                                   ├─► wait_for_commit_workflows(TRIGGER_HEAD_SHA)
                                                   ├─► collect_repo() × 3 repos via gh api (ATHMETRY_GITHUB_TOKEN)
                                                   ├─► merge_backend_event() & merge_frontend_event()
                                                   ├─► is_duplicate_commit_publish() idempotency check
                                                   └─► commit & push data/status.json (GITHUB_TOKEN)
                                                         └─► on workflow_run completed:
                                                               Deploy to GitHub Pages (deploy-pages.yml gate → Pages)
```

## 2. Collector Execution (`.github/scripts/collect-status.sh`)

1. **Commit-Settlement Wait (`wait_for_commit_workflows`):**
   - When `GITHUB_EVENT_NAME == "workflow_run"` and `TRIGGER_EVENT == "push"` with a valid 40-hex `TRIGGER_HEAD_SHA`, polls `/repos/athmetry/athmetry-system-status/actions/workflows/{ci-test.yml,security-scan.yml}/runs?head_sha=<sha>&branch=main&event=push&per_page=10` every `SETTLE_POLL_INTERVAL_SECONDS` (`5s`, max `SETTLE_MAX_WAIT_SECONDS=300`, discovery grace `SETTLE_DISCOVERY_GRACE_SECONDS=30`).
   - Selects the latest run by `(run_number, run_attempt, id)` and waits until both workflows reach `status == "completed"` with a non-empty `conclusion`.
2. **GitHub API Discovery (`collect_repo` per `MONITORED_REPOS` entry):**
   - `GET /repos/{owner}/{repo}/actions/workflows` → filters `.state == "active"`.
   - For standard workflows: `GET /repos/{owner}/{repo}/actions/workflows/{wf_id}/runs?branch=main&per_page=5`.
   - **Self-monitoring (`athmetry-system-status` + `.github/workflows/collect-status.yml`):** Queries `&status=completed&per_page=5` and excludes `GITHUB_RUN_ID` so active/queued collector runs never appear as `Running` and all 5 completed history slots are preserved. If no completed run exists yet, reports `effectiveStatus: "unknown"`, `latestRun: null`.
   - For the latest run: fetches `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs` and `GET /repos/{owner}/{repo}/commits/{head_sha}`.
   - **Run-vs-Jobs Lag Reconciliation:** If `/runs` returns a non-terminal status (`in_progress`, `queued`, `waiting`, `requested`, `pending`) while all jobs in `/jobs` have `status == "completed"`, pauses `RUN_RECONCILE_DELAY_SECONDS` (`2s`) and re-fetches `GET /repos/{owner}/{repo}/actions/runs/{run_id}`, updating `latestRun` and `history[0]` when completed.
3. **Upstream Event Merging (`read_backend_event` / `merge_backend_event`, `read_frontend_event` / `merge_frontend_event`):**
   - Reads `data/status-events/backend.json` and `data/status-events/frontend.json`.
   - Validates JSON syntax, repository (`athmetry/athmetry-backend` or `athmetry/athmetry-frontend`), product (`ATHMETRY-WEB`), branch (`main`), 40-hex `commit.sha`, HTTPS workflow `runUrl`, positive integer `runNumber`, `meta.sourceRunId`, and `meta.sourceRunAttempt`.
   - **Stale-event protection:** Compares `(meta.sourceRunId, meta.sourceRunAttempt)` against the existing workflow's `(latestRun.runId, latestRun.runAttempt)`. Updates only on a higher `runId`, or equal `runId` with higher `runAttempt`; deduplicates `history` by `runNumber` (newest first, max `5`).
4. **Duplicate-Trigger Idempotency (`is_duplicate_commit_publish`):**
   - Because both `Security Scan` and `CI Integration Tests` fire `workflow_run` on completion, the second run checks whether `data/status.json` already records completed runs for both workflows on `TRIGGER_HEAD_SHA` with identical normalized state across all repositories (ignoring `collectedAt`, `Deploy to GitHub Pages`, and collector self-history when `effectiveStatus` is unchanged). If already published, it exits `0` without writing a duplicate commit.

## 3. Status Mapping & `overallStatus` Rules

| GitHub `status` | GitHub `conclusion` | `effectiveStatus` | Counted in `repo.overallStatus`? |
| --- | --- | --- | --- |
| `completed` | `success`, `neutral` | `success` | Yes (unless hidden internal workflow) |
| `completed` | `failure`, `action_required`, `timed_out`, `startup_failure` | `failure` | Yes (unless hidden internal workflow) |
| `completed` | `cancelled`, `stale` | `cancelled` | No |
| `completed` | `skipped` | `skipped` | No |
| `in_progress` | `null` / any | `running` | Yes → `repo.overallStatus = "running"` (if no failure) |
| `queued`, `waiting`, `requested`, `pending` | `null` / any | `queued` | Yes → `repo.overallStatus = "running"` (if no failure) |
| `failure` | any | `failure` | Yes |
| any other / no runs | any | `unknown` | No |

- **Hidden internal workflows excluded from `repo.overallStatus`:** `Athmetry Backend Status Reporter`, `Athmetry Frontend Status Reporter`, and (`athmetry-system-status` only) `Deploy to GitHub Pages`.

## 4. `data/status.json` Schema Contract (`schemaVersion: 2`)

Validated by [`scripts/validate-status-json.js`](../scripts/validate-status-json.js) and `StatusApi.validateData()` in [`js/api.js`](../js/api.js):

```json
{
  "schemaVersion": 2,
  "collectedAt": "2026-11-21T00:32:38Z",
  "monitoredBranch": "main",
  "repositories": [
    {
      "name": "athmetry-system-status",
      "owner": "athmetry",
      "repo": "athmetry-system-status",
      "error": null,
      "overallStatus": "success",
      "workflows": [
        {
          "id": 414992531,
          "name": "Collect System Status",
          "path": ".github/workflows/collect-status.yml",
          "state": "active",
          "html_url": "https://github.com/athmetry/athmetry-system-status/actions/workflows/collect-status.yml",
          "effectiveStatus": "success",
          "latestStatus": "completed",
          "latestConclusion": "success",
          "latestRun": {
            "status": "completed",
            "conclusion": "success",
            "runId": 44842770486,
            "runNumber": 64,
            "runAttempt": 1,
            "runUrl": "https://github.com/athmetry/athmetry-system-status/actions/runs/44842770486",
            "commitSha": "9948db5f46b9392bc637a214ba867f62e0b9c4a0",
            "commitMessage": "chore(status-event): update frontend pipeline status (run 12)",
            "commitAuthor": "athmetry-status-bot",
            "startedAt": "2026-11-21T00:17:00Z",
            "completedAt": "2026-11-21T00:17:32Z",
            "jobs": [
              {
                "name": "Collect pipeline status",
                "status": "completed",
                "conclusion": "success",
                "started_at": "2026-11-21T00:17:02Z",
                "completed_at": "2026-11-21T00:17:30Z"
              }
            ]
          },
          "history": [
            {
              "runNumber": 64,
              "status": "completed",
              "conclusion": "success",
              "commitSha": "9948db5f46b9392bc637a214ba867f62e0b9c4a0",
              "startedAt": "2026-11-21T00:17:00Z",
              "completedAt": "2026-11-21T00:17:32Z",
              "runUrl": "https://github.com/athmetry/athmetry-system-status/actions/runs/44842770486"
            }
          ]
        }
      ]
    }
  ],
  "notes": "Populated by the collect-status GitHub Actions workflow. Do not edit by hand."
}
```

## 5. Adding a Monitored Repository

1. Add `"<repo_name> <owner> <repo>"` to `MONITORED_REPOS` in [`.github/scripts/collect-status.sh`](../.github/scripts/collect-status.sh).
2. Grant `ATHMETRY_GITHUB_TOKEN` `Actions: Read` and `Contents: Read` on the new repository.
3. Add the card container to [`index.html`](../index.html) and register the key in `REPO_KEYS` and `REPO_DISPLAY_NAMES` in [`js/dashboard.js`](../js/dashboard.js).
