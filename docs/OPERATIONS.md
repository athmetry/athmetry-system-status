# Operations, Troubleshooting & Known Limitations

## 1. Health & Freshness Monitoring

- **Primary health signals:**
  1. **Live portal (`https://athmetry.github.io/athmetry-system-status/`):** Overall status pill (`Success` / `Failure` / `Running`), `Last collected` timestamp (`< 10 min` fresh threshold), and absence of the `#alert-card` warning banner.
  2. **Published JSON endpoint:** `curl -sS https://athmetry.github.io/athmetry-system-status/data/status.json | jq '{collectedAt, repos: [.repositories[] | {name, overallStatus}]}'`
  3. **GitHub Actions runs:** `gh run list -R athmetry/athmetry-system-status --limit 10`
- **Collection cadence:** Event-driven on every `main` commit pipeline completion (`CI Integration Tests` / `Security Scan` via `workflow_run`, including upstream Backend/Frontend status-event commits), plus a `*/30 * * * *` scheduled fallback and `workflow_dispatch`.

## 2. Symptom-Based Troubleshooting

| Symptom | Root Cause | Resolution |
| --- | --- | --- |
| Portal displays a completed workflow as **Running** | Collector ran before sibling `push` workflows finished, or `/runs` lagged behind `/jobs`, or stale `effectiveStatus` mismatched `latestRun.status == "completed"`. | Handled by `workflow_run` trigger + `wait_for_commit_workflows`, single-run `/actions/runs/{id}` lag reconciliation, `status=completed` self-monitoring, and `resolveEffectiveStatus` in `js/dashboard.js`. If stale data persists from an older commit, trigger `Collect System Status` via `workflow_dispatch`. |
| Pipeline Detail dialog shows `Unknown` for run/job Status or Conclusion | Raw GitHub status (`completed`, `in_progress`, `waiting`) or conclusion (`timed_out`, `action_required`, `startup_failure`, `neutral`) was missing from `STATUS_LABELS`. | Mapped in `STATUS_LABELS` and `STATUS_COLORS` in [`js/dashboard.js`](../js/dashboard.js); verify with `node tests/integration/test_dashboard_filtering.js`. |
| Yellow alert: `Data is N minutes old. Collector may not be running.` | No commits/events occurred recently and GitHub Free throttled the `*/30 * * * *` scheduled workflow beyond 10 minutes, or `Collect System Status` failed. | Check **Actions → Collect System Status**. If throttled with no errors, dispatch manually (`gh workflow run collect-status.yml -R athmetry/athmetry-system-status`) or wait for the next commit/schedule. |
| Red alert: `Failed to fetch workflows from GitHub API.` | `ATHMETRY_GITHUB_TOKEN` expired, was revoked, or lacks `Actions: Read` / `Contents: Read` on one of the monitored repositories. | Rotate `ATHMETRY_GITHUB_TOKEN` in **Settings → Secrets and variables → Actions** (see [`CI_CD_AND_DEPLOYMENT.md`](CI_CD_AND_DEPLOYMENT.md)) and re-run `Collect System Status`. |
| `Deploy to GitHub Pages` skipped with `unvalidated changes since <sha>` | `main` contains non-`data/status.json` changes for which `Security Scan` has not yet completed with `conclusion == "success"`. | Wait for `Security Scan` to pass on `main` (or fix any `gitleaks`/`zizmor` finding and merge the fix). |
| `Deploy to GitHub Pages` skipped with `revision was already deployed` | Duplicate guard in `deploy-pages.yml` detected an existing successful Pages deployment for the same `head_sha`. | Expected behavior; no action required. |
| Footer shows `Visitor IP: Unavailable` or `Release v—` | `ipwho.is` was blocked by a browser privacy extension / network timeout (5s), or `package.json` could not be fetched. | `ipwho.is` fallback is intentional and non-blocking. For `Release v—`, verify `package.json` is present at the deployed root and contains valid JSON with `"version"`. |

## 3. Incident Response Runbook

- **SEV-1 (Live portal unreachable / broken render / secret exposure):**
  1. If sensitive data is exposed or the UI is severely broken, disable Pages immediately (**Settings → Pages → Source: None**).
  2. If a secret was committed, revoke the token in GitHub Developer Settings immediately and rotate `ATHMETRY_GITHUB_TOKEN`.
  3. Revert the offending commit via PR to `main`, verify `CI Integration Tests` + `Security Scan` pass, re-enable Pages (`Source: GitHub Actions`), and confirm deployment.
- **SEV-2 (Collector or deployment failing repeatedly):**
  1. Inspect run logs (`gh run view <run-id> -R athmetry/athmetry-system-status --log-failed`).
  2. Fix token permissions, workflow YAML, or script issue on a branch, run `npm run test:integration` and `zizmor`, merge via PR, and verify post-merge `Collect System Status` and `Deploy to GitHub Pages` runs.

## 4. Known Limitations (By Design)

- **Public read-only dashboard:** Hosted on public GitHub Pages without authentication; exposes only non-sensitive CI metadata (workflow names, run numbers, statuses, truncated first-line commit messages, authors, timestamps).
- **Single monitored branch:** Monitors `main` only (`BRANCH=main` in `collect-status.sh`).
- **Bounded history:** Retains up to `5` runs per workflow (`MAX_RUNS_PER_WORKFLOW=5`) in `data/status.json`; no historical database or trend analytics.
- **Manual Refresh scope:** Re-fetches published `data/status.json` with cache busting; does not dispatch `collect-status.yml`.
- **Stale threshold vs cron throttling:** The frontend 10-minute stale banner (`STALE_THRESHOLD_MS = 600000`) is independent of the 30-minute fallback cron (`*/30 * * * *`). Active development updates promptly via `workflow_run`; idle periods rely on the fallback schedule.
- **Custom domain:** `CNAME` is reserved empty until `status.athmetry.com` DNS is provisioned.
