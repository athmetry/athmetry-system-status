# Athmetry System Status — Working Memory

**Updated:** 2026-11-26 | **Target:** Static engineering health portal (`athmetry-system-status`, HTML5/CSS3/Vanilla ES Modules, GitHub Actions, GitHub Pages)  
**Local `main`:** `d1d9888` | **Remote `origin/main`:** `1b512d2` (`0` open PRs; diverges only by automated `chore(status)` / `chore(status-event)` data commits)

## Architecture & File Map

- **Frontend (`/`):** `index.html` (markup, dialogs, inline theme script), `css/style.css` (`:root` + `[data-theme="dark"]` tokens, responsive breakpoints, print styles), `js/app.js` (bootstrap, theme toggle, 60s timer, scroll-locked manual refresh, `ipwho.is` lookup, `package.json` release version), `js/api.js` (`StatusApi`: `fetchStatus`, schema v2 validation, 10-min stale detection, `fetchLiveStatus` helper), `js/dashboard.js` (`getDisplayWorkflows`, `resolveEffectiveStatus`, `calculateOverallStatus`, DOM rendering, detail & confirmation dialogs, `escapeHtml`).
- **Data & Validator:** `data/status.json` (generated schema v2 output), `data/status-events/{backend,frontend}.json` (upstream reporter payloads), `scripts/validate-status-json.js` (schema v2 CLI validator), `package.json` (`version: "1.0.0"`, `test:integration`, `test:browser`).
- **Automation (`.github/`):** `scripts/collect-status.sh` (Bash 3.2+ collector), `workflows/{collect-status,deploy-pages,security-scan,ci-test}.yml`, `zizmor.yml` (action-pinning policy).
- **Tests (`tests/`):** `integration/{test_backend_integration.sh,test_frontend_integration.sh,test_workflow_triggers.sh,test_collector_preservation.sh,test_collector_status_accuracy.sh,test_dashboard_filtering.js}`, `browser/manual-refresh.spec.js`, `fixtures/{backend.json,backend-run-38.json,frontend.json}`.

## Critical Operational Gotchas

- **Why `workflow_run` instead of `push` on `collect-status.yml` and `deploy-pages.yml`:**
  1. Commits pushed with built-in `GITHUB_TOKEN` (used by `collect-status.yml` to push `data/status.json`) do **not** trigger `push` workflows (GitHub loop prevention). `deploy-pages.yml` therefore triggers on `workflow_run` completion of `Security Scan` and `Collect System Status`.
  2. Pushes to `main` by developers or PAT-authenticated upstream status reporters (`data/status-events/*.json`) start `CI Integration Tests` and `Security Scan`. Triggering `collect-status.yml` on `push` raced those workflows and froze `CI Integration Tests` as `running` in `data/status.json`. Triggering `collect-status.yml` on `workflow_run` completion of `["CI Integration Tests", "Security Scan"]` (plus `wait_for_commit_workflows` on `TRIGGER_HEAD_SHA`) ensures collection always records completed commit results.
- **Never set `cancel-in-progress: true` on `collect-status.yml`:** Unlike hidden upstream reporters, `Collect System Status` is displayed on the portal. Cancelling an active run produces a `completed`/`cancelled` run that would render as `Cancelled`. Instead, `cancel-in-progress: false` serializes runs and `is_duplicate_commit_publish` skips the redundant second `workflow_run` for an already-published commit SHA.
- **Self-monitoring & API-lag guards:** `collect-status.sh` and `js/api.js` query `status=completed&per_page=5` for `.github/workflows/collect-status.yml` and exclude `GITHUB_RUN_ID` (never falling back to `in_progress`). When `/runs` lags as `in_progress` while all `/jobs` are `completed`, `collect-status.sh` re-fetches `/actions/runs/{id}`. In `js/dashboard.js`, `resolveEffectiveStatus` reconciles completed `latestRun` conclusions so completed runs never display as `Running`.
- **Hidden internal workflows:** `Athmetry Backend Status Reporter`, `Athmetry Frontend Status Reporter`, and (`athmetry-system-status`) `Deploy to GitHub Pages` stay in `data/status.json` `workflows[]` for auditability, are excluded from `repo.overallStatus` in `collect-status.sh` / `js/api.js`, and are filtered from display by `getDisplayWorkflows()` in `js/dashboard.js`.
- **Zizmor & portability:** `.github/zizmor.yml` requires full-SHA pinning for `actions/checkout`, `actions/*`, and `*` (`@v4` allowed only for `actions/upload-pages-artifact` and `actions/deploy-pages`). `workflow_run` requires `# zizmor: ignore[dangerous-triggers]` on the `on:` line. Keep `collect-status.sh` compatible with macOS `/bin/bash` `3.2` (no `declare -A`, `mapfile`, or unguarded empty array expansion under `set -u`).
- **Observed Pages artifact transient failure:** `Deploy to GitHub Pages` succeeded on `948d348` (`45706179034`, `2026-11-25T21:38:23Z`), while automated data commit `1b512d2` hit a transient `No artifacts named "github-pages" were found` failure in `Deploy static site to GitHub Pages` (`45748071339`), leaving the prior `948d348` Pages site live.

## Verified Commands & Handoff

- `npm run test:integration` · `npm run test:browser` · `node scripts/validate-status-json.js` · `zizmor --config .github/zizmor.yml --offline .github/workflows/`
- **Next session handoff:** Read [`PROJECT_STATE.md`](PROJECT_STATE.md), [`AGENTS.md`](AGENTS.md), and consult [`docs/README.md`](docs/README.md) for single-topic Tier 2 references.
