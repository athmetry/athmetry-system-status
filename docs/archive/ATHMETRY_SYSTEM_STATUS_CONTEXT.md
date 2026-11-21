# Athmetry System Status — Complete Engineering Handover & Technical Audit

**Audit Timestamp:** `2026-11-20T18:45Z` (`2026-11-21T00:15+05:30`) `[VERIFIED]`  
**Audited Repository:** `athmetry/athmetry-system-status` (Public, default branch `main`) `[VERIFIED]`  
**Live Deployment URL:** https://athmetry.github.io/athmetry-system-status/ `[VERIFIED]`  
**Local Checkout Audited:** `acba6bbc38dba0e0558d5c1320bd6189b58b2c4e` (`2026-11-16T11:40:09Z`, clean working tree) `[VERIFIED]`  
**Remote `origin/main` at Audit Time:** `ff34e96` (`2026-11-20T10:45:43Z`, 13 automated `athmetry-status-bot` commits ahead of local `HEAD`, touching only `data/status.json`) `[VERIFIED]`  
**Audit Scope & Mode:** Strictly read-only technical audit; no existing files were modified, no workflows were dispatched, no collector jobs were pushed, and no deployments or settings were altered `[VERIFIED]`.

---

## Evidence Classification Legend

Every claim in this handover document is tagged with one of the following classifications:

| Tag | Meaning |
|-----|---------|
| `[VERIFIED]` | Directly observed in repository files, git history, local command output, live GitHub REST API responses, or live HTTP/JSON responses during this audit. |
| `[DOCUMENTED]` | Stated in repository documentation (`README.md`, `AGENTS.md`, `CHANGELOG.md`, `docs/*`) or inline workflow/code comments, where behavior was either not independently tested live or differs from code/live reality. |
| `[REPORTED]` | Stated in the handover/audit prompt as historical or prior design context, or in historical changelog notes. |
| `[INFERRED]` | Engineering conclusion drawn logically from multiple `[VERIFIED]` facts (for example, GitHub Actions scheduled cron throttling from observed run timestamps). |
| `[UNKNOWN]` | Could not be inspected due to access/API permission restrictions (for example, repository Actions secrets list and repository Actions policy endpoints returned HTTP 403) or unexecuted checks (for example, runtime Playwright suite). |

---

## Executive Summary of Critical & High Findings

1. **CRITICAL — Broken `escapeHtml()` enables DOM XSS:** In `js/dashboard.js:184-192`, `escapeHtml()` replaces `&`, `<`, `>`, and `"` with themselves (`'&'`, `'<'`, `'>'`, `'"'`) instead of HTML entities, while GitHub-sourced text (`workflow.name`, `commitMessage`, `commitAuthor`, `job.name`, `repo.error`) is interpolated directly into `innerHTML` with no Content Security Policy on GitHub Pages `[VERIFIED]`.
2. **HIGH — Permanent Stale Data Alert on Production Site:** `.github/workflows/collect-status.yml:6` configures `cron: '*/30 * * * *'`, while `js/api.js:9` and `js/dashboard.js:771` treat `collectedAt` older than 10 minutes as stale. Compounding this, GitHub Actions load-throttled scheduled collector runs between `2026-11-16` and `2026-11-20` to **4h52m–9h20m intervals** (13 runs over ~90 hours), so the live dashboard's `collectedAt` (`2026-11-20T10:45:15Z`, ~8h old at audit time) displays a near-permanent stale-data warning `[VERIFIED]`.
3. **HIGH — Stale, Missing, and Partially Failing Data Can Still Show Green `Success`:** `renderOverallStatus()` in `js/dashboard.js:507-584` does not degrade overall status when data is stale (>10 min) or when a monitored repository is missing or has `workflows: []` without `repo.error` `[VERIFIED]`. Furthermore, API failures in `.github/scripts/collect-status.sh:987-1277` wipe prior valid workflows instead of retaining last-known-good data, and subsequent event merging (`lines 554-555, 974-975`) resets `repo.error = null` while keeping only a single workflow `[VERIFIED]`.
4. **HIGH — Pipeline Detail Dialog Shows `"Unknown"` for `"completed"` / `"in_progress"` Runs:** `createPipelineDetailContent()` (`js/dashboard.js:306,334,366`) passes raw GitHub `status` values (`"completed"`, `"in_progress"`) to `getStatusLabel()` (`lines 65-73`), which only maps normalized `effectiveStatus` keys (`success`, `failure`, `running`, `queued`, `cancelled`, `skipped`, `unknown`), causing raw run, job, and history status fields to display `"Unknown"` `[VERIFIED]`.
5. **HIGH — Public Exposure of Private Repository Metadata & Internal Repo Files:** `athmetry/athmetry-system-status` is `public`, whereas `athmetry/athmetry-backend` and `athmetry/athmetry-frontend` are `private` `[VERIFIED]`. Both `data/status.json` and `data/status-events/*.json` publicly expose private commit messages, author names, workflow/job names, and run URLs; additionally, `deploy-pages.yml:160` uploads `path: '.'`, serving `AGENTS.md`, `docs/*`, `scripts/validate-status-json.js`, `data/status-events/*`, and `package.json` over HTTP 200 `[VERIFIED]`.
6. **MEDIUM — Unconditional Commits & Deploys (`cmp -s` Defeated by `collectedAt`):** `.github/scripts/collect-status.sh:40,1368,1379` injects a new UTC `collectedAt` timestamp before comparing with `cmp -s`, causing every scheduled run to commit `data/status.json` and trigger a Pages deployment even when zero workflow runs changed `[VERIFIED]`.
7. **MEDIUM — Deployment #80 Artifact Race & Missing CI Gate:** `.github/workflows/deploy-pages.yml` does not gate on `CI Integration Tests` (`ci-test.yml`) and has no retry logic; run `#80` (`44623809300`, `2026-11-19T21:56:51Z`) failed in `actions/deploy-pages@v4` with `"No artifacts named 'github-pages' were found"` 338 ms after `upload-pages-artifact@v4` finalized artifact `14578167716` `[VERIFIED]`.

---

## 1. System Purpose

- **Original Scope (`[REPORTED]` / `[DOCUMENTED]` in `README.md:3-19`):** Provide a lightweight, zero-framework, database-free, public engineering health dashboard deployed via GitHub Pages showing backend and frontend pipeline status, calculated overall status, latest collected metadata, manual refresh, light/dark themes, and a mobile-friendly layout `[REPORTED]`, `[DOCUMENTED]`.
- **Current Implemented Scope (`[VERIFIED]`):**
  - Monitors **three** repositories: `athmetry-backend`, `athmetry-frontend`, and self-monitoring `athmetry-system-status` (`.github/scripts/collect-status.sh:45-49`) `[VERIFIED]`.
  - Uses a **hybrid collection architecture**: event-driven pushes from upstream Backend and Frontend Status Reporter workflows (`data/status-events/backend.json`, `data/status-events/frontend.json`) combined with a 30-minute scheduled GitHub Actions polling fallback and manual `workflow_dispatch` (`.github/workflows/collect-status.yml:3-15`) `[VERIFIED]`.
  - Publishes per-workflow latest runs, jobs, commit metadata, and up to 5 historical runs (`schemaVersion: 2`) in `data/status.json`, rendered by vanilla ES modules (`index.html`, `js/api.js`, `js/app.js`, `js/dashboard.js`) `[VERIFIED]`.
  - Enforces a quality-gated Pages deployment pipeline (`.github/workflows/deploy-pages.yml`) tied to `.github/workflows/security-scan.yml` `[VERIFIED]`.
  - Includes automated integration tests (`tests/integration/*`), Playwright browser tests (`tests/browser/manual-refresh.spec.js`), and schema validation (`scripts/validate-status-json.js`) `[VERIFIED]`.
- **Truthfulness Invariant (`[DOCUMENTED]` vs `[VERIFIED]`):** `README.md:121-123,437` and `docs/agent-context/PROJECT_CONTEXT.md:70` state that missing data is shown as `"Unknown"` and never fabricated as healthy `[DOCUMENTED]`. While the collector never invents fake workflow runs `[VERIFIED]`, the frontend overall-status logic currently reports green `Success` even when data is stale, when a repository is missing/empty without `repo.error`, or when an API failure is masked by an event merge (see Sections 8 and 14) `[VERIFIED]`.

---

## 2. Repository Inventory

Comparison of the previously reported 12-item file list `[REPORTED]` against the verified repository tree at local `HEAD` `acba6bb` `[VERIFIED]`:

| Path / Directory | Prior Audit Status | Current Status | Notes / Size / Lines | Evidence |
|------------------|--------------------|----------------|----------------------|----------|
| `index.html` | Reported | Present (updated) | 326 lines; semantic HTML5, inline theme script, 3 repo cards, 2 `<dialog>`s, loading overlay | `[VERIFIED]` |
| `css/style.css` | Reported | Present (updated) | 2,816 lines; CSS custom properties (`:root` + `[data-theme="dark"]`), responsive rules, print CSS | `[VERIFIED]` |
| `js/api.js` | Reported | Present (expanded) | 677 lines; `StatusApi` (`fetchStatus()`, `validateData()`, `isDataStale()`, plus unused `fetchLiveStatus()` code) | `[VERIFIED]` |
| `js/app.js` | Reported | Present (updated) | 379 lines; theme, scroll-locked loading overlay, 60s auto-refresh, manual refresh, `ipwho.is` IP lookup, `package.json` version | `[VERIFIED]` |
| `js/dashboard.js` | Reported | Present (rewritten) | 819 lines; schema v2 rendering, presentation filtering (`getDisplayWorkflows`), detail & confirm dialogs, alerts | `[VERIFIED]` |
| `data/status.json` | Reported | Present (schema v2) | 1,038 lines locally (2026-11-16); 44,348 bytes live on Pages (`2026-11-20T10:45:15Z`) | `[VERIFIED]` |
| `assets/logo.svg` | Reported | **Removed / Replaced** | Replaced by `assets/brand/` directory with 12 files (light/dark SVGs, app icons, favicons, PNGs) | `[VERIFIED]` |
| `assets/brand/*` | Not listed | **Added** | 12 files: `athmetry-{app-icon,logo,logo-transparent}-{light,dark}.svg`, `athmetry-icon-{black,white}.svg`, `favicon.ico`, `athmetry-favicon.ico`, `icon-{16,32}.png` | `[VERIFIED]` |
| `.github/scripts/collect-status.sh` | Reported | Present (expanded) | 1,393 lines; REST polling + `backend.json`/`frontend.json` validation & merging + self-monitoring | `[VERIFIED]` |
| `.github/workflows/collect-status.yml` | Reported | Present (updated) | 76 lines; `*/30` cron, `workflow_dispatch`, `push` on event files | `[VERIFIED]` |
| `.github/workflows/deploy-pages.yml` | Reported | Present (rewritten) | 164 lines; `workflow_run`-triggered quality gate + Pages deploy | `[VERIFIED]` |
| `.github/workflows/security-scan.yml` | Not listed | **Added** | 73 lines; Gitleaks 8.30.1 + Zizmor 1.32.0 | `[VERIFIED]` |
| `.github/workflows/ci-test.yml` | Not listed | **Added** | 38 lines; runs `npm run test:integration` on PR/push to `main` (undocumented in `AGENTS.md`/`README.md`) | `[VERIFIED]` |
| `.github/zizmor.yml` | Not listed | **Added** | 15 lines; pins `actions/*` and `*` to hash except Pages actions (`ref-pin`) | `[VERIFIED]` |
| `.github/PULL_REQUEST_TEMPLATE.md` | Not listed | **Added** | PR template | `[VERIFIED]` |
| `.github/dependabot.yml` | Not listed | **Absent** | No Dependabot config present in repository | `[VERIFIED]` |
| `data/status-events/backend.json` | Not listed | **Added** | 117 lines; Backend Status Reporter payload (`runNumber: 46` locally) | `[VERIFIED]` |
| `data/status-events/frontend.json` | Not listed | **Added** | 42 lines; Frontend Status Reporter payload (`runNumber: 10` locally) | `[VERIFIED]` |
| `CNAME` | Reported | Present (empty) | 0 bytes; reserved for `status.athmetry.com` | `[VERIFIED]` |
| `README.md` | Reported | Present (updated) | 443 lines; project overview, schema v2, setup, troubleshooting | `[VERIFIED]` |
| `AGENTS.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `.gitignore` | Not listed | **Added** | Governance, agent rules, changelog (127 lines), contributing guide (211 lines), ignores (23 lines) | `[VERIFIED]` |
| `package.json`, `package-lock.json`, `playwright.config.js` | Not listed | **Added** | `version: "1.0.0"`, `@playwright/test: "^1.65.0"`, integration test script, Playwright config (port `4173`) | `[VERIFIED]` |
| `scripts/validate-status-json.js` | Not listed | **Added** | 154 lines; Node.js schema v2 contract validator | `[VERIFIED]` |
| `tests/` | Not listed | **Added** | `tests/browser/manual-refresh.spec.js` (238 lines), 5 files in `tests/integration/`, 3 JSON fixtures in `tests/fixtures/` | `[VERIFIED]` |
| `docs/` | Not listed | **Added** | 20 markdown docs across `architecture/`, `deployment/`, `development/`, `operations/`, `agent-context/`, plus `docs/README.md` | `[VERIFIED]` |
| `.agent/skills/` | Not listed | **Added** | 5 agent skill folders (`frontend-development`, `github-actions`, `production-release`, `repository-investigation`, `testing-and-regression`) | `[VERIFIED]` |
| `node_modules/`, `test-results/`, `.DS_Store` | N/A | Local gitignored / untracked | Local Playwright dependencies, previous test run state, macOS metadata | `[VERIFIED]` |

---

## 3. Monitoring Architecture

The system operates as a **static three-tier architecture** entirely hosted on GitHub infrastructure (GitHub Actions + GitHub Pages) with zero backend servers or databases `[VERIFIED]`:

1. **Tier 1 — Upstream Status Reporters (`athmetry-backend` & `athmetry-frontend`):**
   - `athmetry/athmetry-backend/.github/workflows/status-reporter.yml` (`lines 1-128`) triggers on `workflow_run` completion of `'Athmetry Backend Validation'`, `'Athmetry Security & Supply Chain'`, and `'Athmetry Database Validation'` on `main` (plus `workflow_dispatch`), aggregates the commit's workflows via `scripts/status-reporter/cli.mjs`, and pushes `data/status-events/backend.json` to `athmetry/athmetry-system-status` using `ATHMETRY_STATUS_REPORTER_TOKEN` `[VERIFIED]`.
   - `athmetry/athmetry-frontend/.github/workflows/status-reporter.yml` (`lines 1-489`) triggers on `workflow_run` completion of `"Athmetry Frontend CI"` on `main`, checks stale-event protection against existing `data/status-events/frontend.json`, and commits/pushes `data/status-events/frontend.json` via `gh api --method PUT` using `ATHMETRY_STATUS_REPORTER_TOKEN` `[VERIFIED]`.
2. **Tier 2 — Collector, Security Gate & Pages Publisher (`athmetry-system-status`):**
   - `.github/workflows/collect-status.yml` executes `.github/scripts/collect-status.sh`, which polls the GitHub REST API across all three monitored repos using `ATHMETRY_GITHUB_TOKEN`, merges fresher `backend.json` / `frontend.json` events, derives `effectiveStatus` and `overallStatus`, writes `data/status.json`, and pushes via built-in `GITHUB_TOKEN` `[VERIFIED]`.
   - `.github/workflows/security-scan.yml` validates code commits (Gitleaks + Zizmor); `.github/workflows/ci-test.yml` runs integration tests `[VERIFIED]`.
   - `.github/workflows/deploy-pages.yml` fires on `workflow_run` completion of `Security Scan` or `Collect System Status` on `main`, verifies security lineage, and publishes the static tree to the `github-pages` environment `[VERIFIED]`.
3. **Tier 3 — Client Presentation Layer (`index.html` + `css/` + `js/`):**
   - Pure static HTML5, CSS3, and native ES2020 modules served from GitHub Pages `[VERIFIED]`.
   - `js/api.js` fetches **only** same-origin `data/status.json?t=<timestamp>` on initial load, every 60s (`REFRESH_INTERVAL_MS`), and on manual refresh (`js/app.js:11,179,301,319`) `[VERIFIED]`.
   - Although `js/api.js:211-674` contains an unused `fetchLiveStatus()` implementation that attempts direct browser requests to `https://api.github.com/repos/...`, it is never called anywhere in `app.js` or `dashboard.js` `[VERIFIED]`.

### Verified Monitored Repositories

| Config Key (`collect-status.sh:45-49`) | GitHub Owner/Repo | Visibility (GitHub API) | Default Branch | Monitored Branch | Dashboard Product Tag (`index.html:133,170,205`) | Active Workflows | Evidence |
|----------------------------------------|-------------------|-------------------------|----------------|------------------|---------------------------------------------------|------------------|----------|
| `athmetry-backend` | `athmetry/athmetry-backend` | `private` | `main` | `main` | `ATHMETRY-WEB` | 6 (5 shown, 1 hidden) | `[VERIFIED]` |
| `athmetry-frontend` | `athmetry/athmetry-frontend` | `private` | `main` | `main` | `ATHMETRY-WEB` | 3 (2 shown, 1 hidden) | `[VERIFIED]` |
| `athmetry-system-status` | `athmetry/athmetry-system-status` | `public` | `main` | `main` | `ATHMETRY-SYSTEM-STATUS` | 4 (3 shown, 1 hidden) | `[VERIFIED]` |

---

## 4. Data Collection Flow

### Verification of End-to-End Sequence

The prompt asked to verify whether the system actually executes:  
`Scheduler → Collector script → GitHub API → Backend/frontend workflow data → data/status.json → Repository update → GitHub Pages deployment → Public dashboard`.

**Finding:** Yes — the sequence runs end-to-end as designed, with **two major structural evolutions** since the original design `[VERIFIED]`:
1. Collection is **hybrid** (upstream event pushes to `data/status-events/{backend,frontend}.json` trigger prompt collection, backed by a 30-minute cron fallback and `workflow_dispatch`) `[VERIFIED]`.
2. Pages deployment is **not** triggered by `on: push` (because commits pushed with `GITHUB_TOKEN` do not trigger `push` workflows per GitHub loop prevention); instead, `deploy-pages.yml` triggers via `workflow_run` completion of `Collect System Status` or `Security Scan` `[VERIFIED]`.

```text
[Trigger 1: Backend/Frontend Reporter PUTs data/status-events/*.json on main]
[Trigger 2: GitHub Actions cron '*/30 * * * *' (throttled to ~5–9h live)]
[Trigger 3: Manual workflow_dispatch]
        │
        ▼
collect-status.yml (group: collect-status, cancel-in-progress: false)
        │  Runs ./.github/scripts/collect-status.sh (with ATHMETRY_GITHUB_TOKEN)
        ▼
GitHub REST API polling across 3 repos (workflows → runs?branch=main&per_page=5 → jobs → commit)
        │  Self-monitoring: filters collect-status.yml to status == "completed"
        ▼
Event merge: read_backend_event() + merge_backend_event()
             read_frontend_event() + merge_frontend_event()
        │  Compares meta.sourceRunId & meta.sourceRunAttempt vs API-collected latestRun
        ▼
Writes data/status.json (if cmp -s differs — always differs because collectedAt changes!)
        │
        ▼
collect-status.yml step "Commit and push status data" uses GITHUB_TOKEN → git push origin HEAD:main
        │  (Note: GITHUB_TOKEN push does NOT trigger push workflows!)
        ▼
GitHub fires workflow_run [completed] for "Collect System Status" on main
        │
        ▼
deploy-pages.yml (group: pages, cancel-in-progress: false)
  ├─► Job 1: gate (verifies branch==main, conclusion==success, latest Security Scan SHA
  │                matches HEAD or differs only by data/status.json, not already deployed)
  └─► Job 2: deploy (checks out gate.sha, verifies git rev-parse HEAD, upload-pages-artifact path='.',
                     deploy-pages@v4 → environment: github-pages)
        │
        ▼
Public Dashboard (https://athmetry.github.io/athmetry-system-status/)
  └─► Fetches data/status.json?t=<Date.now()> on load, every 60s, and on Manual Refresh
```

### Schedule Configuration vs. Actual Behavior

- **Schedule commit history (`[VERIFIED]` via `git log -p -- .github/workflows/collect-status.yml`):**
  - `eb85766` (Phase 1): `*/5 * * * *` (5 min).
  - `92c4352` (`2026-11-14`): changed to `*/30 * * * *` (30 min).
  - `3e4f373` (`2026-11-14`): temporarily changed to `*/15 * * * *` (15 min — matching the `[REPORTED]` 15-minute discussion).
  - `c72fe00` (`2026-11-15`): reverted back to `*/30 * * * *`, and `tests/integration/test_workflow_triggers.sh:17` now asserts `cron == "*/30 * * * *"`.
- **Actual live cadence (`[VERIFIED]` via `actions/runs` API):** Across `2026-11-16T16:43Z` to `2026-11-20T10:45Z`, `Collect System Status` runs #46–#58 triggered via `schedule` only 13 times over ~90 hours, with inter-run intervals ranging from **4h52m to 9h20m** (`16:43` → `00:34` → `08:41` → `17:59` → `00:44` → `08:04` → `17:24` → `23:28` → `04:24` → `13:39` → `21:56` → `02:48` → `10:45`) `[VERIFIED]`. `[INFERRED]` This reflects standard GitHub Actions shared-runner `schedule` cron throttling/delays on public repositories.

### Event Consumption vs. API Polling Merge Mechanics

- `main()` (`collect-status.sh:1298-1358`) always polls the GitHub REST API for all 3 repos first, then attempts `read_backend_event()` + `merge_backend_event()` and `read_frontend_event()` + `merge_frontend_event()` `[VERIFIED]`.
- Both merge functions reject stale or duplicate events (`meta.sourceRunId < existing_latest_run_id`, or equal `runId` with `meta.sourceRunAttempt <= existing_latest_run_attempt`) (`collect-status.sh:361-377, 781-797`) `[VERIFIED]`.
- **Scope difference `[VERIFIED]`:** While `data/status-events/backend.json:64-105` includes an aggregated `.payload.pipeline.workflows` list (3 workflows) and 5 combined prefixed jobs, `merge_backend_event()` (`lines 325-518`) ignores `.payload.pipeline` and merges only `.payload.workflow` into the single matching workflow (`Athmetry Backend Validation`).
- **Normal steady-state outcome `[VERIFIED]`:** When the API already sees the latest run (as with `runId: 43851415668, attempt: 1` for backend and `43722386997, attempt: 1` for frontend), `merge_*_event()` logs `"Existing ... data has same run ID with higher/equal attempt"` and preserves the API-collected data (which keeps authoritative workflow `id`, `html_url`, and per-workflow `jobs`).

### Change Detection, Commits, Concurrency, and Retries

- **`cmp -s` defeated by `collectedAt` (`collect-status.sh:40,1368,1379`):** `COLLECTED_AT` is computed at script startup and embedded into `new_content` before `cmp -s "$tmp_file" "$STATUS_FILE"`. Consequently, every run produces a byte-different file, a new `chore(status): update pipeline status data (...)` commit, and a new `deploy-pages.yml` run even when zero pipeline states changed `[VERIFIED]`.
- **Concurrency (`collect-status.yml:20-22`):** `group: collect-status`, `cancel-in-progress: false`, `timeout-minutes: 10` — serializes runs without aborting active collections `[VERIFIED]`.
- **Push step (`collect-status.yml:51-76`):** Checks `git diff --quiet -- data/status.json`; if changed, sets remote URL with `GITHUB_TOKEN`, executes `git push origin HEAD:main`, and restores clean HTTPS remote URL in both branches. **No pull/rebase retry exists** if another commit (such as a status-event push) lands during the ~30s collection window `[VERIFIED]`.
- **Retries (`[VERIFIED]`):** `collect-status.sh` has **zero retry/backoff logic** on `gh_api` failures. Upstream `athmetry-frontend/.github/workflows/status-reporter.yml:382-423` retries HTTP 409 content conflicts up to 3 times (`sleep 2`).

---

## 5. GitHub API Integration

### Endpoints Consumed

| Component | Endpoint | Purpose | Auth Token | Source |
|-----------|----------|---------|------------|--------|
| Collector (`collect-status.sh:996`) | `GET /repos/{owner}/{repo}/actions/workflows` | Discover workflows per repo | `ATHMETRY_GITHUB_TOKEN` | `[VERIFIED]` |
| Collector (`collect-status.sh:1030`) | `GET /repos/{owner}/{repo}/actions/workflows/{wf_id}/runs?branch=main&per_page=5` | Fetch last 5 runs on `main` | `ATHMETRY_GITHUB_TOKEN` | `[VERIFIED]` |
| Collector (`collect-status.sh:1084`) | `GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs` | Fetch job breakdown for latest run | `ATHMETRY_GITHUB_TOKEN` | `[VERIFIED]` |
| Collector (`collect-status.sh:1100`) | `GET /repos/{owner}/{repo}/commits/{sha}` | Fetch commit subject line and author | `ATHMETRY_GITHUB_TOKEN` | `[VERIFIED]` |
| Pages Gate (`deploy-pages.yml:66`) | `GET /repos/{repo}/git/ref/heads/main` | Read current `main` HEAD SHA | `GITHUB_TOKEN` | `[VERIFIED]` |
| Pages Gate (`deploy-pages.yml:75`) | `GET /repos/{repo}/actions/workflows/security-scan.yml/runs?branch=main&per_page=30` | Find latest successful Security Scan SHA | `GITHUB_TOKEN` | `[VERIFIED]` |
| Pages Gate (`deploy-pages.yml:85`) | `GET /repos/{repo}/compare/{validated}...{head}` | Ensure only `data/status.json` changed | `GITHUB_TOKEN` | `[VERIFIED]` |
| Pages Gate (`deploy-pages.yml:103`) | `GET /repos/{repo}/actions/workflows/deploy-pages.yml/runs?head_sha={sha}&per_page=30` | Duplicate deployment guard | `GITHUB_TOKEN` | `[VERIFIED]` |
| Upstream Reporters | `GET/PUT /repos/athmetry/athmetry-system-status/contents/data/status-events/{backend,frontend}.json` | Read prior event SHA/meta & push new event | `ATHMETRY_STATUS_REPORTER_TOKEN` | `[VERIFIED]` |

### Rate Limiting & Token Handling

- **API Call Budget (`[VERIFIED]`):** Per collector execution across 3 repos and 13 active workflows: `3` workflow-list calls + `13` runs calls + `13` jobs calls + `13` commit calls = **`42` REST API calls/run** (assuming every workflow has ≥1 run on `main`). `deploy-pages.yml` gate adds `3–4` calls per deploy. At the configured `*/30` schedule (`2` runs/hr), steady-state consumption is **~92 calls/hr** (<2% of the 5,000/hr authenticated PAT quota). Live `gh api rate_limit` showed `limit: 5000, remaining: 4987, used: 13` `[VERIFIED]`. *(Note: `docs/operations/KNOWN_LIMITATIONS.md:37` and `MONITORING.md:261` erroneously document outdated 5-minute math of "12 collections/hr" and "~300 calls/hr" `[DOCUMENTED]`.)*
- **API Error Handling (`[VERIFIED]`):**
  - `gh_api()` (`collect-status.sh:66-68`) executes `gh api --hostname github.com "$@" 2>/dev/null`, discarding HTTP status codes and stderr diagnostics `[VERIFIED]`.
  - If `/actions/workflows` fails, `collect_repo()` sets `error="Failed to fetch workflows from GitHub API."`, `workflows=[]`, and `overallStatus="unknown"` (`lines 996-998, 1265-1274`) `[VERIFIED]`.
  - If `/runs`, `/jobs`, or `/commits/{sha}` fails for an individual workflow (`lines 1030, 1083, 1099`), the failure is silently swallowed: `runs_array="[]"` (making `effectiveStatus: "unknown"`, `latestRun: null`), `jobs_array="[]"`, or empty commit strings without populating `repo.error` `[VERIFIED]`.
  - `collect-status.sh` exits `0` even when all three repositories encounter API errors, writing `repo.error` into `data/status.json` (while `merge_*_event` can subsequently erase `repo.error` for backend/frontend if a valid event file exists) `[VERIFIED]`.

---

## 6. Workflow and Branch Coverage

### Complete Workflow Inventory Across All Three Repositories (`[VERIFIED]`)

| Repository | Workflow Name | Path | State | Upstream Triggers | Monitored (`status.json`) | Displayed on UI (`dashboard.js`) | Latest Live `main` Run (as of `2026-11-20T10:45Z`) |
|------------|---------------|------|-------|-------------------|---------------------------|----------------------------------|-----------------------------------------------------|
| `athmetry-backend` | `Athmetry Backend Validation` | `.github/workflows/ci.yml` | `active` | `push`/`PR` (`main`) | Yes | Yes | `#46` `completed`/`success` (`2026-11-16T10:44:41Z`) |
| `athmetry-backend` | `Athmetry Code Security` | `.github/workflows/codeql.yml` | `active` | `schedule` Mon 04:23 UTC, `workflow_dispatch` | Yes | Yes | `#21` `completed`/`success` (`2026-11-16T12:57:27Z`) |
| `athmetry-backend` | `Athmetry Database Validation` | `.github/workflows/database-ci.yml` | `active` | `push`/`PR` (`main`, path-filtered) | Yes | Yes | `#25` `completed`/`success` (`2026-11-16T10:45:31Z`) |
| `athmetry-backend` | `Athmetry Dependency Audit` | `.github/workflows/security-audit.yml` | `active` | `schedule` Mon 04:17 UTC, `workflow_dispatch` | Yes | Yes | `#7` `completed`/`success` (`2026-11-16T12:45:27Z`) |
| `athmetry-backend` | `Athmetry Security & Supply Chain` | `.github/workflows/security.yml` | `active` | `push` (`**`), `PR` (`main`), `schedule`, `dispatch` | Yes | Yes | `#28` `completed`/`success` (`2026-11-16T12:44:31Z`) |
| `athmetry-backend` | `Athmetry Backend Status Reporter` | `.github/workflows/status-reporter.yml` | `active` | `workflow_run` (3 workflows on `main`), `dispatch` | Yes | **Hidden** (`INTERNAL_REPORTER_WORKFLOWS`) | `#20` `completed`/`skipped` (`2026-11-16T12:44:40Z`) |
| `athmetry-frontend` | `Athmetry Frontend CI` | `.github/workflows/ci.yml` | `active` | `push`/`PR` (`main`) | Yes | Yes | `#10` `completed`/`success` (`2026-11-15T14:06:27Z`) |
| `athmetry-frontend` | `Dependency Audit` | `.github/workflows/dependency-audit.yml` | `active` | `schedule` Mon 04:17 UTC, `workflow_dispatch` | Yes | Yes | `#2` `completed`/`success` (`2026-11-16T12:45:01Z`) |
| `athmetry-frontend` | `Athmetry Frontend Status Reporter` | `.github/workflows/status-reporter.yml` | `active` | `workflow_run` (`Athmetry Frontend CI` on `main`) | Yes | **Hidden** (`INTERNAL_REPORTER_WORKFLOWS`) | `#6` `completed`/`success` (`2026-11-15T14:06:40Z`) |
| `athmetry-system-status` | `CI Integration Tests` | `.github/workflows/ci-test.yml` | `active` | `push`/`PR` (`main`) | Yes | Yes | `#9` `completed`/`success` (`2026-11-16T11:40:37Z`) |
| `athmetry-system-status` | `Collect System Status` | `.github/workflows/collect-status.yml` | `active` | `schedule`, `dispatch`, `push` (events on `main`) | Yes (completed only) | Yes | `#57` live (`#58` triggered `#82`) `completed`/`success` |
| `athmetry-system-status` | `Deploy to GitHub Pages` | `.github/workflows/deploy-pages.yml` | `active` | `workflow_run` (`Security Scan`/`Collect` on `main`) | Yes | **Hidden** (`HIDDEN_WORKFLOWS_BY_REPO`) | `#81` live (`#82` ran after collection) `completed`/`success` |
| `athmetry-system-status` | `Security Scan` | `.github/workflows/security-scan.yml` | `active` | `push`/`PR` (`main`), `schedule` Mon 03:17 UTC, `dispatch` | Yes | Yes | `#24` `completed`/`success` (`2026-11-16T11:40:26Z`) |

### Branch Filtering, Latest Run Selection & Lifecycle Edge Cases

- **Branch monitoring (`[VERIFIED]`):** Hardcoded default `BRANCH="${BRANCH:-main}"` (`collect-status.sh:36`), passed as `?branch=${BRANCH}` (`line 1030`). Non-`main` activity is excluded; for example, `athmetry-backend` branch `fix/status-reporter-runtime` experienced two failures on `2026-11-20T10:34Z` (Security #29 and Database #26) that are rightly excluded from `main` status `[VERIFIED]`.
- **Latest run vs. latest successful run (`[VERIFIED]`):**
  - Every workflow reports its **latest run** on `main` regardless of conclusion (so failures/cancellations/running states surface immediately), **except** `.github/workflows/collect-status.yml` (`collect-status.sh:1044-1050`), which selects the most recent `status == "completed"` run (falling back to the raw array only if zero completed runs exist) so self-monitoring does not permanently show `"Running"` `[VERIFIED]`.
  - Overall card `"Last successful build"` (`js/dashboard.js:542-550,577-583`) scans only `wf.latestRun` where `wf.latestConclusion === 'success'` across visible workflows. **Defect:** It ignores `wf.history[]`, so if every visible workflow's latest run is currently failing or running, `"Last successful build"` degrades to `"—"` even when successful runs exist in `history[]` `[VERIFIED]`.
- **Deleted/disabled vs. renamed workflows (`[VERIFIED]`):**
  - Deleted or disabled workflows (`state != "active"`) are cleanly filtered out by `select(.state == "active")` (`collect-status.sh:1010`), causing no errors `[VERIFIED]`.
  - **Renaming hazard 1 (Presentation filters):** `INTERNAL_REPORTER_WORKFLOWS` and `HIDDEN_WORKFLOWS_BY_REPO` (`js/dashboard.js:90-101`) match strictly by `wf.name`. Renaming any hidden workflow exposes it on the dashboard and changes calculated card/overall health `[VERIFIED]`.
  - **Renaming hazard 2 (Event merge):** `merge_backend_event` / `merge_frontend_event` (`collect-status.sh:332-346, 515-518, 752-766, 935-938`) match existing workflows by `.name` first, default `workflow_path` to `.github/workflows/ci.yml` when missing, and replace by `select(.path != $new_wf.path)`. Renaming a CI workflow or changing its YAML path causes an old entry and synthetic entry to collide or duplicate `[VERIFIED]`.
- **Pagination assumption (`[VERIFIED]`):** `/actions/workflows` defaults to `per_page=30` without pagination; safe today (max 6 workflows/repo), fragile if a repo exceeds 30 workflow definitions `[VERIFIED]`.

---

## 7. JSON Data Schema

### Published Snapshot: `data/status.json` (`schemaVersion: 2`) `[VERIFIED]`

Verified against `.github/scripts/collect-status.sh:1120-1276, 1361-1372`, `scripts/validate-status-json.js:18-105`, `js/api.js:28-84`, and live `https://athmetry.github.io/athmetry-system-status/data/status.json`:

| Path | Type | Nullable / Optional | Producer | Validator (`validate-status-json.js` / `api.js`) | Notes |
|------|------|---------------------|----------|---------------------------------------------------|-------|
| `schemaVersion` | integer | Required (`2`) | Collector (`1367`) | Both assert `=== 2` | Breaking schema changes must bump this |
| `collectedAt` | string (ISO 8601 UTC) | Required | Collector (`40,1368`) | `validate-status-json` checks ISO parseability; `api.js` checks non-empty string only | Generated at collector start (`date -u +"%Y-%m-%dT%H:%M:%SZ"`) |
| `monitoredBranch` | string | Required | Collector (`36,1369`) | Both check non-empty string | Currently `"main"` |
| `repositories[]` | array | Required | Collector (`1298-1318`) | Both check `Array.isArray` | Contains 3 objects (`backend`, `frontend`, `system-status`) |
| `repositories[].name` | string | Required | Collector (`1269`) | Both check string | Matched by `REPO_KEYS` in `dashboard.js:49-53` |
| `repositories[].owner` | string | Required | Collector (`1270`) | Both check string | `"athmetry"` |
| `repositories[].repo` | string | Required | Collector (`1271`) | Both check string | Repository slug |
| `repositories[].error` | string \| `null` | Nullable | Collector (`1272`) | Not validated by either | Populated only if `/actions/workflows` fails; cleared by event merge |
| `repositories[].overallStatus` | enum string | Required | Collector (`1273`) | Both allow `success\|failure\|running\|unknown` | **Ignored by frontend** (`dashboard.js` recomputes over filtered visible workflows) |
| `repositories[].workflows[]` | array | Required | Collector (`1274`) | Both check `Array.isArray` | Only `state == "active"` workflows |
| `workflows[].id` | number | Required | Collector (`1196`) / `cksum` (`485,905`) | Both check `typeof === 'number'` | Event merge synthesizes `cksum(path)` when workflow absent from API |
| `workflows[].name` | string | Required | Collector (`1197`) | Both check string | Used for hidden-workflow filtering |
| `workflows[].path` | string | Required | Collector (`1198`) | Not checked | e.g. `.github/workflows/ci.yml` |
| `workflows[].state` | string | Required | Collector (`1199`) | Not checked | `"active"` |
| `workflows[].html_url` | string | Required | Collector (`1200`) | Not checked | **Defect:** Event merge writes `workflow_run_url` here instead of workflow blob URL (`494,914`) |
| `workflows[].effectiveStatus` | enum string | Required | Collector (`1201`) | Both allow `success\|failure\|running\|queued\|cancelled\|skipped\|unknown` | Used directly for row dots and `calculateOverallStatus()` |
| `workflows[].latestStatus` | string | Required | Collector (`1202`) | Not checked | Raw GitHub `status` or `"unknown"` |
| `workflows[].latestConclusion` | string | Required | Collector (`1203`) | Not checked | Raw GitHub `conclusion` or `"unknown"` |
| `workflows[].latestRun` | object \| `null` | Nullable | Collector (`1120-1146`) | `validate-status-json` checks `runNumber` & `status`; `api.js` skips | Fields: `status`, `conclusion`, `runId`, `runNumber`, `runAttempt`, `runUrl`, `commitSha`, `commitMessage`, `commitAuthor`, `startedAt`, `completedAt`, `jobs[]` |
| `latestRun.jobs[]` | array | Required (`[]`) | Collector (`1086-1092`) | Not checked | `{ name, status, conclusion, started_at, completed_at }` |
| `workflows[].history[]` | array | Required (`[]`) | Collector (`1149-1158`) | `validate-status-json` checks `runNumber` & `status`; `api.js` skips | Up to `MAX_RUNS_PER_WORKFLOW=5`; `{ runNumber, status, conclusion, commitSha, startedAt, completedAt, runUrl }` |
| `notes` | string | Optional | Collector (`1371`) | Not checked | Static warning text |

### Event Payloads: `data/status-events/{backend,frontend}.json` (`[VERIFIED]`)

- Both files share top-level `{ payload: { repository, displayName, product, branch, commit: { sha, message, author }, workflow: {...}, reportedAt, source }, meta: { reportedAt, sourceRunId, sourceRunAttempt, version: 1 } }` `[VERIFIED]`.
- **Verified structural asymmetries:**
  - `backend.json` (`117 lines`) uses `source: "pipeline_completion"`, includes `workflow.path`, `workflow.startedAt`, `workflow.triggeredAt`, and a multi-workflow `.payload.pipeline` summary + `meta.pipelineRevision`.
  - `frontend.json` (`42 lines`) uses `source: "workflow_run"`, omits `workflow.path` and `workflow.startedAt` (sets `triggeredAt` only; `collect-status.sh:805` falls back via `.triggeredAt // .startedAt // ""`).
  - **URL validation mismatch:** `read_backend_event()` enforces regex `^https://github\.com/athmetry/athmetry-backend/actions/runs/[0-9]+$` (`collect-status.sh:115`), whereas `read_frontend_event()` only checks non-empty string (`lines 643-646`).

---

## 8. Status Calculation Rules

### Historical Bug & Fix Verification (`[VERIFIED]`)

- **Historical Bug `[REPORTED]` / `[VERIFIED]`:** Prior to `c997d08` (`2026-11-12 00:56 +0530`), `computeOverallStatus()` in `js/dashboard.js` only recognized `"failure"`, `"in_progress"`, `"queued"`, and `"success"`, so GitHub's actual `"completed"` run status fell into the `else` branch and made Overall Status display `"Unknown"`.
- **Verified Fix (`c997d08`):** Added explicit `status === "completed"` inspection branching on `conclusion` (`"success"` → `anyData=true`; `"failure"|"cancelled"|"timed_out"` → `hasFailure=true`), which resolved the Phase 1 bug `[VERIFIED]`.
- **Current Architecture (Schema v2):** Collector computes `effectiveStatus` and `repo.overallStatus` (`collect-status.sh:1162-1180, 1231-1257`), and the frontend **re-computes** both per-repo card status (`renderRepositoryPipelines`, `js/dashboard.js:600-604`) and global overall status (`renderOverallStatus`, `lines 507-584`) over `getDisplayWorkflows(repo)` (`lines 110-116`) so hidden internal workflows never pollute displayed health `[VERIFIED]`.

### Complete 10-State Mapping Table (`[VERIFIED]`)

| Condition / State | GitHub Raw (`status` / `conclusion`) | Collector `effectiveStatus` (`collect-status.sh:1162-1180`) | Repo Card Pill (`dashboard.js:600-604`) | Overall Pill & Detail (`dashboard.js:507-574`) | Detail Dialog (`dashboard.js:306-367`) | Alert Card (`dashboard.js:748-799`) |
|-------------------|--------------------------------------|--------------------------------------------------------------|------------------------------------------|-----------------------------------------------|---------------------------------------|------------------------------------|
| **Success** | `completed` / `success` | `success` | `Success` (if no failure/running) | `Success` — `"All pipelines are healthy."` | Effective pill: `Success`; Status col: **`Unknown`** (bug); Conclusion col: `Success` | Hidden |
| **Failure** | `completed` / `failure`, `timed_out`, `action_required`, or raw status `failure` | `failure` | `Failure` (highest priority) | `Failure` — `"One or more pipelines are failing..."` | Effective pill: `Failure`; Status col: **`Unknown`** (bug); Conclusion col: `Failure` / **`Unknown`** (for `timed_out`/`action_required`) | Hidden |
| **Cancelled** | `completed` / `cancelled` | `cancelled` | Ignored by `calculateOverallStatus`; yields `Unknown` if alone | Ignored; yields `Unknown` if no other repo has data, else other repos win (`Success`/`Failure`/`Running`) | Effective pill: `Cancelled`; Status col: **`Unknown`**; Conclusion col: `Cancelled` | Hidden |
| **In progress** | `in_progress` / `null` (collector normalizes `null` conclusion to `"unknown"`) | `running` | `Running` (unless any failure) | `Running` — `"One or more pipelines are currently running."` (unless any failure) | Effective pill: `Running`; Status col: **`Unknown`** (bug); Conclusion col: `Unknown` | Hidden |
| **Queued** | `queued` / `null` | `queued` | `Running` (merged with `running` at `line 492`) | `Running` (unless any failure) | Effective pill: `Queued`; Status col: `Queued`; Conclusion col: `Unknown` | Hidden |
| **Skipped** | `completed` / `skipped` | `skipped` | Ignored by `calculateOverallStatus`; yields `Unknown` if alone | Ignored; yields `Unknown` if alone, else other repos' status | Effective pill: `Skipped`; Status col: **`Unknown`**; Conclusion col: `Skipped` | Hidden |
| **Unknown** | Missing runs or unmapped `status`/`conclusion` (e.g. `neutral`, `stale`, `startup_failure`, `waiting`) | `unknown` | `Unknown` (if no `success`/`failure`/`running`/`queued`) | `Unknown` — `"No pipeline data available."` (only if **no** repo has `success`/`failure`/`running`) | Effective pill: `Unknown`; Status/Conclusion: `Unknown` | Hidden |
| **Stale data** | N/A | N/A | Unchanged from stored values | **BUG:** Still renders `Success` (`"All pipelines are healthy."`) if workflows succeeded | Unchanged | Yellow warning at `Math.floor(age/60000) > 10` (`≥ 11m`); `api.js:95` warns in console at `> 10m` |
| **API errors** | HTTP non-200 or network failure on `/actions/workflows` | `workflows: []`, `overallStatus: "unknown"`, `repo.error` set | **BUG:** Shows `Unknown` (`renderRepositoryPipelines` ignores `repo.error`) | `Failure` (`line 522` checks `repo.error`), unless masked by event merge | N/A (`"No active pipelines found"`) | Red collector alert naming repo + error |
| **Missing repository data** | Repo omitted from `data.repositories` or `workflows: []` with `error: null` | Repo missing or `overallStatus: "unknown"` | Remains static `"Loading pipelines..."` / `Unknown` if omitted, or `"No active pipelines found"` / `Unknown` if empty | **BUG:** Still renders green `Success` if remaining repos are healthy; only renders `Unknown` if **all** repos have zero usable data | N/A | **None** (no alert raised for missing repo!) |

### Overall Status Scenario Verification (`[VERIFIED]`)

| Scenario | Expected Engineering Behavior | Actual Implementation Behavior | Correct? |
|----------|-------------------------------|--------------------------------|----------|
| All repositories healthy | Overall `Success` | `calculateOverallStatus()` returns `success` for each card; `renderOverallStatus()` renders `Success` — `"All pipelines are healthy."` (`dashboard.js:555,572`). | **Yes** |
| One repository fails | Overall `Failure` | `repoStatus === 'failure'` sets `hasFailure = true` (`lines 532-534`); `overallStatus = 'failure'` wins over `running` and `success`. | **Yes** |
| One repository unavailable (`repo.error` set) | Overall non-green (`Failure`/`Degraded`) and affected card reflects error | Overall becomes `Failure` + red alert banner (`lines 522-525, 757-763`), **but** affected repo card pill incorrectly displays `Unknown` (`line 601`). | **Partial (Card Bug)** |
| One repository missing from JSON / `workflows: []` without `error` | Overall must NOT show green `Success` | **DEFECT:** Missing repo is never iterated; `workflows: []` yields `repoStatus = 'unknown'`; remaining healthy repos still drive Overall to green `Success`! | **No (Bug)** |
| Visible workflow running or queued | Overall `Running` (unless failure) | `running` / `queued` sets `hasRunning = true` (`lines 492-494, 535-537`), yielding `Running` unless `hasFailure` is true. *(Hidden running workflows such as Reporters or Pages Deploy are intentionally excluded by `getDisplayWorkflows`, explaining why live `status.json` `overallStatus: "running"` can render `"Success"` on the dashboard.)* | **Yes** |
| Data is stale (>10 min) | Overall should warn / avoid misleading fresh green `Success` | **DEFECT:** Overall card remains bright green `Success` — `"All pipelines are healthy."`; only `#alert-card` below the repository grid warns of age. | **No (Bug)** |
| Collection partially fails (1 repo API error + event file present) | Surface partial collection failure and preserve prior workflows | **DEFECT:** API failure wipes repo `workflows` to `[]`; if an event file exists, `merge_*_event()` overwrites `.error = null` and puts only the 1 event workflow back (`collect-status.sh:554-555,974-975`), hiding both the outage and all other workflows! | **No (Bug)** |

---

## 9. Reliability and Freshness Behavior

- **Timestamps & Timezone Handling (`[VERIFIED]`):**
  - Collector records `collectedAt` in UTC ISO 8601 (`date -u +"%Y-%m-%dT%H:%M:%SZ"`, `collect-status.sh:40`), and GitHub timestamps (`startedAt`, `completedAt`) are UTC (`...Z`).
  - Frontend `formatDateTime()` (`js/dashboard.js:124-132`) formats timestamps in the **viewer's local browser timezone** (`toLocaleString(undefined, { ..., hour12: false })`) without appending a timezone indicator (e.g., `IST`/`UTC`), which can confuse distributed teams.
  - `formatRelativeTime()` (`lines 139-159`) returns `${diffSec}s ago` without clamping negative skew (`diffMs < 0` if client clock lags server).
- **Last Successful Collection vs. Last Successful Build (`[VERIFIED]`):**
  - No `lastSuccessfulCollectedAt` field exists in `data/status.json`. `collectedAt` updates on every run even if an API error occurred for a repo (`collect-status.sh:40, 1368`).
  - `"Last successful build"` (`js/dashboard.js:542-550`) inspects only `wf.latestRun` of visible workflows (does not inspect `wf.history[]`).
- **Concurrency & Race Conditions (`[VERIFIED]`):**
  - Overlapping collector runs are prevented by `concurrency: group: collect-status, cancel-in-progress: false` (`collect-status.yml:20-22`).
  - **Git push race:** `collect-status.yml:68` executes `git push origin HEAD:main` with no rebase/retry; if a status reporter commits `data/status-events/*.json` during the ~30s collection window, the push will fail (leaving the newly triggered collector run to pick it up).
  - **Older reporter overwriting newer data:** Mitigated on both sides — reporters compare `meta.sourceRunId`/`sourceRunAttempt` and use GitHub Contents API `sha` optimistic concurrency (`frontend/status-reporter.yml:284-423`); collector compares `meta.sourceRunId` and `meta.sourceRunAttempt` in `merge_backend_event` / `merge_frontend_event` (`collect-status.sh:360-377, 780-797`).
  - **History re-run deduplication bug:** In `collect-status.sh:471-480, 891-900`, `. + [$new_entry] | unique_by(.runNumber)` appends `$new_entry` and `jq` `unique_by` keeps the **first** (older attempt) occurrence rather than the newer attempt, contradicting the code comment.
- **Partial Failure / Data Erasure (`[VERIFIED]`):**
  - `collect-status.sh` does **not** read existing `data/status.json` as a fallback when API calls fail (`collect_repo()` builds fresh objects every run). An upstream GitHub API outage therefore erases previously collected workflow rows and history for that repo until the API recovers.
- **Frontend Resilience to Malformed/Failed JSON (`[VERIFIED]`):**
  - `StatusApi.fetchStatus()` (`js/api.js:103-159`) applies a 10s `AbortController` timeout, `cache: "no-store"`, `?t=${Date.now()}`, JSON parse protection, and `validateData()` (`lines 28-84`).
  - On initial load failure (`js/app.js:307-313`), `renderErrorState()` clears all 3 repo cards to `"Error loading data"` and sets Overall text to `"Error"`. On manual or automatic refresh failure (`lines 183-199, 325-336`), `statusApi.getLastValidData()` preserves the prior dashboard state and surfaces an explicit error message — verified by Playwright tests (`tests/browser/manual-refresh.spec.js:174-238`).
  - Note: `validateData()` (`api.js:28-84`) checks `collectedAt` type only (not date validity), and does not validate `latestRun` or `history` item shapes (`scripts/validate-status-json.js` does).

---

## 10. Security and Permissions

### Critical & High Security Findings

1. **CRITICAL — Broken `escapeHtml()` Causes Stored/Reflected DOM XSS (`js/dashboard.js:184-192`) `[VERIFIED]`:**
   - Verified verbatim via `sed -n '183,193p' js/dashboard.js | cat -vet`:
     ```js
     function escapeHtml(text) {
       if (!text) return '';
       return String(text)
         .replace(/&/g, '&')
         .replace(/</g, '<')
         .replace(/>/g, '>')
         .replace(/"/g, '"')
         .replace(/'/g, '&#039;');
     }
     ```
   - Characters `&`, `<`, `>`, and `"` are NOT escaped. Any repository workflow name, commit message, commit author, job name, or error string containing HTML/script tags (for example `<img src=x onerror=...>`) injected into `innerHTML` (`lines 240-259, 291-380, 786-799`) executes directly in visitors' browsers, and GitHub Pages serves no Content Security Policy (`CSP`) header (`curl -sI` confirmed) `[VERIFIED]`.
   - Furthermore, `tests/integration` and `TESTING_GUIDE.md:280-281` assume `escapeHtml()` escapes these characters, yet no automated test exercises `escapeHtml()` `[VERIFIED]`.
2. **HIGH — Public Exposure of Private Repository Metadata & Internal Repo Files (`[VERIFIED]`):**
   - `athmetry/athmetry-backend` and `athmetry/athmetry-frontend` are **private** repositories (`gh api` verified `private: true`), while `athmetry/athmetry-system-status` is **public** (`private: false`) `[VERIFIED]`.
   - `data/status.json` and `data/status-events/{backend,frontend}.json` expose private commit messages, commit authors, workflow/job names, and run IDs/URLs publicly on GitHub and Pages `[VERIFIED]`.
   - `deploy-pages.yml:160` uploads `path: '.'`, publishing non-runtime repository files (`AGENTS.md`, `docs/README.md`, `scripts/validate-status-json.js`, `data/status-events/backend.json`, `data/status-events/frontend.json`, `package.json`) with HTTP 200 (tested live; dotfiles like `.github/` return 404 because `include-hidden-files: false`) `[VERIFIED]`.
3. **MEDIUM — Weak Frontend Event URL & Confirmation Dialog Validation (`[VERIFIED]`):**
   - `read_frontend_event()` (`collect-status.sh:643-646`) checks only that `runUrl` is non-empty, not that it begins with `https://github.com/athmetry/athmetry-frontend/actions/runs/`.
   - `showGitHubConfirmation()` (`js/dashboard.js:702`) assigns `continueBtn.href = githubUrl` without verifying `https://` protocol, permitting `javascript:` URLs if `status.json` is tampered with.

### Permissions, Secrets & Token Hygiene Matrix (`[VERIFIED]` / `[DOCUMENTED]` / `[UNKNOWN]`)

| Token / Workflow | Declared / Scope Permissions | Actual Usage | Findings & Minimization Gaps | Evidence |
|------------------|------------------------------|--------------|------------------------------|----------|
| `collect-status.yml` (`GITHUB_TOKEN`) | `permissions: contents: write` (workflow-level) | `git push origin HEAD:main` (`lines 55, 67`) | Embeds `GITHUB_TOKEN` temporarily in `origin` URL (safe if `set +x`; restored immediately at `lines 70, 73`); checkout uses PAT unnecessarily instead of `GITHUB_TOKEN` (`line 35`) | `[VERIFIED]` |
| `ATHMETRY_GITHUB_TOKEN` (Repo Secret) | `[DOCUMENTED]` Fine-grained PAT: `Actions: Read`, `Contents: Read` on backend/frontend/status; `Contents: Read+Write` on `athmetry-system-status` | Exported as `GH_TOKEN` in `collect-status.sh:1290`; also passed to `actions/checkout` (`collect-status.yml:35`) | Checkout step has `persist-credentials: false` and never pushes with PAT (`GITHUB_TOKEN` pushes), so passing PAT to `actions/checkout` is unnecessary privilege exposure. Also expires periodically (≤1 yr max for fine-grained PATs). Actual secret presence/permissions via API returned HTTP 403 (`[UNKNOWN]` via API). | `[VERIFIED]`, `[DOCUMENTED]`, `[UNKNOWN]` |
| `ATHMETRY_STATUS_REPORTER_TOKEN` | `[DOCUMENTED]` Fine-grained PAT with `Contents: Write` on `athmetry/athmetry-system-status` | Used by backend & frontend `status-reporter.yml` to `PUT data/status-events/*.json` | Scoped away from `status.json` and workflows (though PAT `contents:write` inherently covers all files in `athmetry-system-status` without branch protection) | `[DOCUMENTED]`, `[VERIFIED]` |
| `deploy-pages.yml` (`GITHUB_TOKEN`) | Workflow `contents: read`; `gate`: `contents: read, actions: read`; `deploy`: `contents: read, pages: write, id-token: write` | Gate API checks; OIDC artifact deploy to `github-pages` | Minimal privilege; `workflow_run` guarded by `branches: [main]`, `TRIGGER_BRANCH`, `head` check, and `github-pages` branch policy | `[VERIFIED]` |
| `security-scan.yml` (`GITHUB_TOKEN`) | `permissions: contents: read` | Exports `HEAD` via `git archive`, runs Gitleaks `8.30.1` + Zizmor `1.32.0` | Does **not** scan git commit history (only `HEAD` tree); does **not** run `npm audit` on `package-lock.json` (`@playwright/test`) | `[VERIFIED]` |
| `ci-test.yml` (`GITHUB_TOKEN`) | `permissions: contents: read` | Runs `npm ci` + `npm run test:integration` on PR/push to `main` | No secrets exposed; pinned actions | `[VERIFIED]` |

### Supply-Chain, Fork, and Third-Party Dependencies (`[VERIFIED]`)

- **Fork & Branch Protection (`[VERIFIED]`):** `allow_forking: true`, `main` `protected: false`. Fork PRs trigger `security-scan.yml` and `ci-test.yml` (both read-only, no secrets); `deploy-pages.yml` rejects non-`main` `workflow_run` events and restricts `github-pages` environment to `main`. However, with `main` unprotected, anyone with push access (or a compromised write PAT) can commit directly without PR review or status checks.
- **GitHub Actions Pinning (`[VERIFIED]`):**
  - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` (`v7.0.1`) — SHA-pinned.
  - `zizmorcore/zizmor-action@45d7276c9ca790aabd705e31ca99c6185c3e76dd` (`v0.8.1`, zizmor `1.32.0`) — SHA-pinned.
  - `actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444` (`v4.0.0` in `ci-test.yml:29`) — SHA-pinned (uses Node 20; Node 20 deprecation warning observed in `deploy-pages` run #80 logs).
  - `actions/upload-pages-artifact@v4` & `actions/deploy-pages@v4` (`deploy-pages.yml:158,164`) — tag-pinned (`ref-pin` exception in `.github/zizmor.yml:12-13`).
  - Gitleaks `8.30.1` verified against pinned SHA-256 checksum (`security-scan.yml:35-48`).
- **Dependabot & Security Advisories (`[VERIFIED]`):** No `.github/dependabot.yml` exists; `security_and_analysis: null` on repo metadata.
- **Third-Party Client Endpoint (`[VERIFIED]`):** `js/app.js:15, 224-262` calls `https://ipwho.is/` directly from every visitor's browser (5s timeout, non-blocking).

---

## 11. GitHub Pages Deployment

| Property | Observed Value | Evidence |
|----------|----------------|----------|
| Pages API config (`repos/athmetry/athmetry-system-status/pages`) | `build_type: "workflow"`, `source: { branch: "main", path: "/" }`, `public: true`, `cname: null`, `custom_404: false`, `https_enforced: true`, `html_url: "https://athmetry.github.io/athmetry-system-status/"` | `[VERIFIED]` |
| Deployment environment (`environments/github-pages`) | Custom branch policy restricted strictly to `branch: "main"` | `[VERIFIED]` |
| Trigger & Gate (`.github/workflows/deploy-pages.yml:23-123`) | `workflow_run` on `["Security Scan", "Collect System Status"]` (`completed`, `main`); deploys iff triggering run succeeded on `main`, `main` HEAD equals latest successful `Security Scan` SHA or differs only by `data/status.json`, and SHA not already deployed | `[VERIFIED]` |
| Missing CI Gate | `deploy-pages.yml` does **not** check `CI Integration Tests` (`ci-test.yml`) before deploying | `[VERIFIED]` |
| Build artifact | Uploads entire repo root `path: '.'` (~234,947 bytes compressed in run #80) — no build step | `[VERIFIED]` |
| Live HTTP headers (`curl -sI` on `index.html` & `status.json`) | `HTTP/2 200`, Fastly CDN (`via: 1.1 varnish`), `strict-transport-security: max-age=31556952`, `cache-control: max-age=600`, `etag`, `access-control-allow-origin: *`, no CSP header | `[VERIFIED]` |
| Custom domain (`CNAME` & DNS) | `CNAME` is empty (0 bytes); `dig status.athmetry.com A` and `CNAME` return empty; `athmetry.com A` resolves to `148.251.82.243` | `[VERIFIED]` |
| Live vs. Local Parity | Live `index.html` (`16,087` bytes, `last-modified: Fri, 20 Nov 2026 10:46:19 GMT`) matches local `index.html` (`16,087` bytes at `acba6bb`). Remote `origin/main` (`ff34e96`) is 13 commits ahead of local `acba6bb`, differing **only** in `data/status.json`. Live `data/status.json` (`collectedAt: 2026-11-20T10:45:15Z`, `44,348` bytes) corresponds to collector run #58 + Pages deploy #82. | `[VERIFIED]` |
| Deployment Failure Handling | No automatic retry; failed run #80 (`44623809300`, `2026-11-19T21:56:51Z`) failed in `actions/deploy-pages@v4` with `No artifacts named "github-pages" were found` 338 ms after `upload-pages-artifact@v4` finalized artifact `14578167716` (`[INFERRED]` transient GitHub Actions/Pages artifact propagation race). Subsequent scheduled run #57 / deploy #81 succeeded automatically. | `[VERIFIED]` / `[INFERRED]` |

---

## 12. UI/UX Architecture

### Design Alignment vs. Actual Implementation (`[VERIFIED]`)

| Aspect | Reported / Established Spec | Actual Implementation | Finding |
|--------|----------------------------|-----------------------|---------|
| **Header Branding** | `[REPORTED]` "Athmetry A symbol only. No unnecessary subtitle." | `index.html:53-65` renders full horizontal wordmark SVG (`athmetry-logo-transparent-{light,dark}.svg` — A symbol + divider + `ATHMETRY`) + `<span class="header-descriptor">SYSTEM STATUS</span>` | Diverges from reported A-symbol-only spec `[VERIFIED]` |
| **Brand Palette** | `[REPORTED]` Electric Lime `#B4FF39`, Cyan `#00E5FF`, Athletic Blue `#0095FF`, Midnight `#080B12`, White `#FFFFFF` | `css/style.css:21-27,93-99`: `--color-lime: #b4ff39` (unused in CSS, used in SVG gradient); `--color-cyan: #00e5c3` (differs from `#00E5FF`; used only on `.loading-spinner`); `--color-blue: #007bff` light / `#4da8ff` dark (SVG uses `#0095FF`); `--color-midnight: #080b12` (unused in CSS; dark theme uses `#0f1318`/`#131921`, dark app icon uses `#080B12`); `--color-white: #ffffff` | Palette discrepancy on Cyan/Blue; Lime/Midnight unused in CSS `[VERIFIED]` |
| **Card Grid & Grouping** | Backend + Frontend cards (`[REPORTED]`); 3 cards (`[DOCUMENTED]`) | `index.html:114-227` places all 3 cards inside `<article class="card web-repositories-card">` titled `<h3>ATHMETRY WEB</h3>`: left column `Backend` (`ATHMETRY-WEB`), right top `System Status Page` (`ATHMETRY-SYSTEM-STATUS`), right bottom `Frontend` (`ATHMETRY-WEB`); single-column below `768px` | `System Status Page` (`ATHMETRY-SYSTEM-STATUS`) is visually nested inside `ATHMETRY WEB` `[VERIFIED]` |
| **Header `#last-updated` on Mobile** | `[DOCUMENTED]` (`APPLICATION_ARCHITECTURE.md:127-128`) wraps `#last-updated` onto row 2 at `<= 429px` | `css/style.css:483-493` defines row-2 wrap at `<= 429px`, **but** later rules at `lines 2003, 2215, 2347` set `.last-updated { display: none; }` across `<= 767px` | CSS cascade hides `#last-updated` on all mobile widths (`<= 767px`), contradicting docs `[VERIFIED]` |
| **Timestamp Formatting** | Compact timestamp | `#last-updated` (`app.js:113-122`) sets `"just now"`, then an uncancelled 5s timer sets `"a few seconds ago"` permanently until next successful fetch. `#last-collected-at` (`dashboard.js:436`) renders relative + local `24h` `toLocaleString` without timezone label | Header check timer stalls at `"a few seconds ago"`; local datetime lacks timezone suffix `[VERIFIED]` |
| **Refresh Behavior** | Functional manual refresh + 60s auto-refresh | Fetches `data/status.json?t=${Date.now()}` (`cache: "no-store"`, 10s timeout), locks body scroll via `body.loading-open`, keeps overlay visible `>= 1500ms` (`app.js:65`), preserves `lastValidData` on error/timeout | Works reliably as published-data refresh; does not trigger collection `[VERIFIED]` |
| **Theme Persistence** | Light/dark toggle with persistence | Defaults strictly to `"light"` (ignores `prefers-color-scheme`, `app.js:26-29`); inline `<head>` script (`index.html:14-24`) reads `localStorage["athmetry-theme"]` pre-paint; CSS swaps `header-logo`, `footer-logo`, `dialog-logo`, `loading-logo` | Zero flash of wrong theme; works cleanly `[VERIFIED]` |
| **Release Version** | Single source of truth in `package.json` | `index.html:296` hardcodes `Release v1.0` placeholder (docs claim `Release v—`), updated dynamically by `fetchReleaseVersion()` (`app.js:270-285`) | Minor placeholder discrepancy `[VERIFIED]` |
| **Accessibility & CSS Hygiene** | Semantic HTML, ARIA, keyboard nav, reduced motion | Good baseline (`aria-modal`, `aria-live="polite"`, `prefers-reduced-motion`, `:focus-visible`, `<noscript>` unlock), **but**: (1) `.pipeline-row` is a non-focusable `<div>` while `.pipeline-view-btn` is `display: none` at `<= 429px` (`style.css:1487`), blocking mobile keyboard access; (2) `<button>` elements omit `type="button"`; (3) `showPipelineDetail()` (`dashboard.js:644-689`) leaks duplicate listeners on repeat opens; (4) `--font-mono` (`style.css:2760,2766`) is undefined | Multiple a11y & resource-leak defects `[VERIFIED]` |

---

## 13. Historical Bugs and Fixes

Verified timeline from `git log` in `athmetry-system-status` `[VERIFIED]`:

| Date (UTC) | Commit | Milestone / Fix | Evidence |
|------------|--------|-----------------|----------|
| `2026-11-11 17:37Z` | `4ec85df` | Initial Phase 1 repository upload | `[VERIFIED]` |
| `2026-11-11 18:19–18:37Z` | `50a8692`, `6629355`, `c924537`, `b616cad` | Fixed `deploy-pages` `@v4` refs, wired `ATHMETRY_GITHUB_TOKEN`, fixed `GITHUB_TOKEN` push | `[VERIFIED]` |
| `2026-11-11 19:06Z` | `995c18f` | Fixed `gh_api` query parameter handling and `jq` compatibility in `collect-status.sh` | `[VERIFIED]` |
| `2026-11-11 19:08Z` | `f5e419e` | Manual collector run recording **Backend run `#29`** (`completed`/`success`) and **Frontend run `#4`** (`completed`/`success`) — directly verifying the `[REPORTED]` historical snapshot | `[VERIFIED]` |
| `2026-11-11 19:26Z` | `c997d08` | Fixed `"Unknown"` overall status bug by explicitly handling `status === "completed"` + `conclusion` in `js/dashboard.js` | `[VERIFIED]` |
| `2026-11-12 00:13Z` | `57238f7` | Phase 1 production deployment (`schemaVersion: 1`, 2 repos, `*/5` cron) | `[VERIFIED]` |
| `2026-11-13 14:22Z` | `3bca66e` | v1.0 Release Candidate: `schemaVersion: 2`, 3rd repo + self-monitoring, `deploy-pages` quality gate, `security-scan.yml`, docs suite | `[VERIFIED]` |
| `2026-11-13 20:18Z` | `92c4352` | Added Backend event consumption (`data/status-events/backend.json`), changed cron `*/5` → `*/30`, UI polish & loading overlay | `[VERIFIED]` |
| `2026-11-13 23:33–23:59Z` | `5b81518`, `3e4f373` | Activated `push` trigger for `backend.json`, added Playwright tests, temporarily changed cron to `*/15 * * * *` | `[VERIFIED]` |
| `2026-11-14 13:59Z–19:49Z` | `acb572c`, `1eb3797` | Integrated Frontend event reporting (`data/status-events/frontend.json`) & `merge_frontend_event()` | `[VERIFIED]` |
| `2026-11-15 00:16–00:38Z` | `66267b9`, `c72fe00` | Hid `Deploy to GitHub Pages` on UI; added `ci-test.yml` + frontend integration tests; reverted cron `*/15` → `*/30` | `[VERIFIED]` |
| `2026-11-16 11:40Z` | `acba6bb` (`HEAD`) | Hid `Athmetry Backend/Frontend Status Reporter` on UI; added scroll lock (`body.loading-open`) on initial load and manual refresh | `[VERIFIED]` |
| `2026-11-16 → 2026-11-20` | `f74c59b`..`ff34e96` | 13 automated `athmetry-status-bot` commits updating `data/status.json` (plus `8a5a22b` Backend run `#46` event) | `[VERIFIED]` |

---

## 14. Current Health and Pipeline Findings

### Live Production Snapshot (`2026-11-20T18:45Z`) `[VERIFIED]`

- **Live `data/status.json`:** `collectedAt: "2026-11-20T10:45:15Z"` (from scheduled run #58, deployed by `Deploy to GitHub Pages` run #82 at `2026-11-20T10:46:26Z`). At audit time (`18:45Z`), data age was **~8 hours**, actively triggering the frontend's >10-minute stale warning `[VERIFIED]`.
- **Workflow health on `main`:**
  - `athmetry-backend`: All 5 visible workflows (`Validation` #46, `Code Security` #21, `Database Validation` #25, `Dependency Audit` #7, `Security & Supply Chain` #28) are `completed` / `success`; hidden `Backend Status Reporter` #20 is `completed` / `skipped` (causing live `data/status.json` `overallStatus: "success"`). *(Note: two failed runs on non-monitored branch `fix/status-reporter-runtime` on `2026-11-20T10:34Z` are correctly excluded `[VERIFIED]`.)*
  - `athmetry-frontend`: `Frontend CI` #10, `Dependency Audit` #2, and hidden `Status Reporter` #6 are all `completed` / `success` `[VERIFIED]`.
  - `athmetry-system-status`: `CI Integration Tests` #9, `Security Scan` #24, `Collect System Status` #58 (live JSON records #57 before #58 committed), and hidden `Deploy to GitHub Pages` #82 (live JSON records #81) all succeeded `[VERIFIED]`. (Earlier run #80 failed transiently during `deploy-pages@v4` artifact lookup.)
- **Local static checks executed during audit (`[VERIFIED]`):**
  - `node --check js/*.js`: **PASS** (0 syntax errors).
  - `jq empty data/status.json package.json`: **PASS**.
  - `node scripts/validate-status-json.js`: **PASS** (exited `0`, warning `Data is 6237 minutes old` on local Nov 16 fixture).
  - `ruby -ryaml` on `.github/workflows/*.yml` and `.github/zizmor.yml`: **PASS** (all 5 files valid YAML).
  - Playwright & integration tests: **`[UNKNOWN]`** (not executed in this audit to strictly honor read-only constraints and sandbox isolation).

### Prioritized Defect Register (`[VERIFIED]`)

| ID | Severity | Location | Defect Description |
|----|----------|----------|--------------------|
| **D-01** | **CRITICAL** | `js/dashboard.js:184-192` | `escapeHtml()` does not escape `&`, `<`, `>`, or `"` (replaces them with themselves); exposes dashboard to XSS from GitHub-sourced metadata without CSP. |
| **D-02** | **HIGH** | `.github/workflows/collect-status.yml:6`, `js/api.js:9`, `js/dashboard.js:771` | 10-minute stale threshold mismatches 30-minute configured cron and 5–9 hour actual GitHub Actions scheduled execution cadence, causing a near-permanent stale warning on production. |
| **D-03** | **HIGH** | `js/dashboard.js:507-584` | Overall status remains green `Success` (`"All pipelines are healthy."`) even when data is stale (>10m) or when a monitored repo is missing/empty (`workflows: []` with `error: null`). |
| **D-04** | **HIGH** | `.github/scripts/collect-status.sh:996-1277, 554, 974` | API failures wipe a repository's previously known workflows/history (`workflows: []`); if an event file exists, `merge_*_event()` overwrites `.error = null` and silently leaves only 1 workflow, masking API failures. |
| **D-05** | **HIGH** | `js/dashboard.js:306, 334, 366` | Pipeline Detail Dialog passes raw GitHub statuses (`"completed"`, `"in_progress"`) to `getStatusLabel()`, displaying `"Unknown"` for completed runs, jobs, and history rows. |
| **D-06** | **HIGH** | Repo visibility & `deploy-pages.yml:160` | Public repo and Pages upload (`path: '.'`) expose private repo commit messages/authors/jobs and publish internal docs, scripts, `AGENTS.md`, and `data/status-events/*.json`. |
| **D-07** | **MEDIUM** | `.github/scripts/collect-status.sh:40, 1368, 1379` | `collectedAt` is regenerated before `cmp -s`, defeating unchanged-data detection and creating unnecessary commits and Pages deployments on every collector run. |
| **D-08** | **MEDIUM** | `js/dashboard.js:600-604` | `renderRepositoryPipelines()` ignores `repo.error`, so an API-failed repository card shows `Unknown` while the Overall card shows `Failure`. |
| **D-09** | **MEDIUM** | `.github/workflows/deploy-pages.yml` & `collect-status.yml:68` | `deploy-pages.yml` omits `ci-test.yml` from its gate and lacks retry on transient `deploy-pages@v4` artifact errors (run #80); `collect-status.yml` lacks `git pull --rebase` push-conflict retry. |
| **D-10** | **MEDIUM** | `.github/scripts/collect-status.sh:473-475, 643-646, 893-895` | `merge_*_event` history deduplication appends then calls `unique_by(.runNumber)` (retaining old attempt instead of new attempt on re-runs); `read_frontend_event` omits strict `runUrl` origin/regex validation; `merge_*_event` overwrites `workflow.html_url` with `runUrl` and synthesizes `cksum` IDs. |
| **D-11** | **MEDIUM** | `css/style.css:1487, 2003, 2215, 2347`; `js/dashboard.js:225-273, 543, 632-691` | Mobile (`<= 429px`) hides `.pipeline-view-btn` while `.pipeline-row` is unfocusable via keyboard; `#last-updated` is hidden `<= 767px` despite docs; `"Last successful build"` ignores `history[]`; `showPipelineDetail()` accumulates listeners; `showGitHubConfirmation()` lacks URL protocol guard. |
| **D-12** | **LOW** | `js/api.js:211-674`, `js/dashboard.js:452-479`, `css/style.css:2760`, `index.html:296`, `docs/*` | ~470 lines of dead `fetchLiveStatus()` code; unused `--color-lime`/`--color-midnight`; undefined `--font-mono`; `diffMin > 10` (`>= 11m`) vs `> 600000ms` stale boundary drift; `app.js` uncancelled 5s `"a few seconds ago"` timer; `docs/`/`AGENTS.md`/`README.md` still claim "3 workflows", "private repo", "Backend-only events", "12 collections/hr", and "no browser suite". |

---

## 15. Known Limitations

- **Documented Accepted Phase 1 Boundaries (`[DOCUMENTED]` in `docs/operations/KNOWN_LIMITATIONS.md`):**
  - Polling-based client refresh (60s) with no WebSockets/SSE; Manual Refresh pulls published JSON only and never triggers collection.
  - No authentication/RBAC on the dashboard (public static GitHub Pages).
  - Single-branch monitoring (`main` only) and bounded history depth (`MAX_RUNS_PER_WORKFLOW=5`, no MTTR/SLA trend storage).
  - Client-side `ipwho.is` dependency for visitor IP/location (may fail under blockers; sends visitor IP to third party).
  - Commit message truncated to subject line (`head -n 1`); in-progress runs use `updated_at` as `completedAt`.
- **Newly Verified Operational Constraints (`[VERIFIED]`):**
  - GitHub Actions `schedule` cron on public repositories experiences multi-hour throttling (5–9h actual gaps observed), making sub-hour freshness impossible without external triggers or universal event-driven reporting.
  - GitHub Pages provides no configurable HTTP response headers (no CSP, no custom `Cache-Control` shorter than `max-age=600` on `data/status.json`).
  - `ATHMETRY_GITHUB_TOKEN` and `ATHMETRY_STATUS_REPORTER_TOKEN` are fine-grained PATs requiring manual rotation (≤1 year) and are single points of failure if expired or revoked.
  - `main` branch on `athmetry-system-status` has no branch protection (`protected: false`), and local repository is missing `.github/dependabot.yml`.

---

## 16. Future Improvements (Assessment Only — Not Implemented)

All recommendations preserve the static, database-free architecture (no database or Supabase is justified unless multi-year SLA reporting, user authentication, or high-frequency runtime telemetry is explicitly approved):

1. **Defect & Security Remediation (Immediate Priority):**
   - Fix `escapeHtml()` in `js/dashboard.js:184-192` using DOM `textContent`/`innerHTML` or proper entity replacements (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`), and validate `https://github.com/` URLs in `showGitHubConfirmation()` and `read_frontend_event()`.
   - Fix Detail Dialog status badges (`js/dashboard.js:306,334,366`) by normalizing raw statuses or formatting `"completed"`/`"in_progress"` cleanly; map `repo.error` to `"Failure"` on the repo card pill; fall back to `history[]` for `"Last successful build"`.
   - Degrade Overall Status to `Stale` / `Degraded` (never green `Success`) when `collectedAt` exceeds the stale threshold, when expected repositories are missing, or when `workflows` is empty due to an API error.
   - Make `.pipeline-row` keyboard-accessible (`<button>` or `role="button"` + `tabindex="0"` + Enter/Space handler), clean up modal listeners, remove dead `fetchLiveStatus()` code, and resolve the `#last-updated` mobile CSS conflict.
2. **Stale Detection, Last-Known-Good & Data Retention (No Database Required):**
   - Preserve last-known-good workflows in `collect-status.sh` by reading existing `data/status.json` on per-repo API failures, setting `repo.error` and a new `lastSuccessfulCollectedAt` field without erasing valid history or letting `merge_*_event()` drop non-CI workflows.
   - Separate collector **heartbeat** / **state-hash** from `data/status.json` (or only bump `collectedAt` when workflow data changes while aligning the frontend stale threshold with actual reporter + scheduled cadence, e.g., differentiating "last event/change" from "collector heartbeat") so `cmp -s` prevents noisy empty commits and wasted Pages deploys.
   - For lightweight long-term **status history** without a database, append daily/run summaries into a bounded rolling file (e.g., `data/history-30d.json`, capped at 30 days) during collector runs.
3. **Event-Driven Coverage vs. Polling & API Rate Limits:**
   - Extend `status-reporter.yml` in backend and frontend (or emit `repository_dispatch`) for **all** monitored workflows—including scheduled security/audit workflows (`codeql.yml`, `security-audit.yml`, `dependency-audit.yml`)—so `collect-status.yml` becomes event-complete for upstream changes and cron serves strictly as a low-frequency reconciliation fallback.
   - Add bounded exponential backoff on transient GitHub API errors (`gh_api`), `git pull --rebase` retry on push conflict, and conditional commit-SHA caching (reuse `commitMessage`/`commitAuthor` from existing `status.json` when `commitSha` is unchanged, cutting API calls by ~30%).
4. **Deployment Isolation, CI Gates, Monitoring Alerts & Multi-Environment Readiness:**
   - Stage only public runtime files (`index.html`, `css/`, `js/`, `assets/`, `data/status.json`, and a minimal `version.json` instead of `package.json`) into a `_site/` directory for `actions/upload-pages-artifact` so `AGENTS.md`, `docs/`, `scripts/`, and `data/status-events/` are not served publicly; evaluate redacting private commit subjects/authors if public visibility is unintended.
   - Include `CI Integration Tests` (`ci-test.yml`) in `deploy-pages.yml`'s gate check, add retry logic around `actions/deploy-pages@v4` for transient artifact errors, migrate `actions/setup-node` off Node 20, remove unnecessary `ATHMETRY_GITHUB_TOKEN` from `collect-status.yml`'s checkout step, and add `.github/dependabot.yml` + `main` branch protection.
   - Add an optional webhook notification step (Slack/Discord/email) triggered on `collect-status.yml` / `deploy-pages.yml` failure or transition to `failure`/`stale` state.
   - To support **multiple environments** and **backend/frontend health endpoints** later without a database, introduce an optional `environments[]` / `endpoints[]` block in `schemaVersion: 3` probed via a scheduled workflow checking public `/health` and storefront endpoints (status code + latency).

---

## 17. Exact Source Paths and Line References

### Primary Repository (`athmetry-system-status`) `[VERIFIED]`

| File (Absolute Path) | Total Lines | Key Symbols / Sections & Line Ranges |
|----------------------|-------------|--------------------------------------|
| [`index.html`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/index.html) | 326 | Pre-paint theme script `11-25`; `<noscript>` unlock `27-40`; `body.loading-open` `47`; header branding `50-81`; overall card `85-107`; `ATHMETRY WEB` 3-card grid `114-227`; dialogs `231-261`; alerts `264-267`; footer & hardcoded `Release v1.0` `270-308`; overlay `312-322` |
| [`css/style.css`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/css/style.css) | 2,816 | `:root` palette `8-76`; `[data-theme="dark"]` `81-131`; scroll lock `191-196`; `<=429px` `.last-updated` wrap `470-499`; grid layout `795-838`; mobile `.pipeline-view-btn` hide `1487-1489`; mobile `.last-updated` hide `2003,2215,2347`; overlay `2632-2735`; undefined `--font-mono` `2760,2766`; print `2791-2816` |
| [`js/api.js`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/js/api.js) | 677 | Config constants (`10m`, `10s`, `v2`) `7-13`; `validateData()` `28-84`; `isDataStale()` `91-96`; `fetchStatus()` `103-159`; `isStale()` `164-169`; dead `fetchLiveStatus()`/`processWorkflow()`/`normalizeRepoData()`/`updateOverallStatus()` `211-674` |
| [`js/app.js`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/js/app.js) | 379 | Config (`60s`, `5s`, `ipwho.is`) `11-15`; theme `24-56,124-138`; overlay & scroll lock `62-111`; `updateLastUpdatedNow()` `113-122`; `handleManualRefresh()` `161-209`; `fetchVisitorInfo()` `224-262`; `fetchReleaseVersion()` `270-285`; `init()` & auto-refresh `291-379` |
| [`js/dashboard.js`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/js/dashboard.js) | 819 | Constants `49-79`; `INTERNAL_REPORTER_WORKFLOWS` / `HIDDEN_WORKFLOWS_BY_REPO` / `getDisplayWorkflows()` `90-116`; date/duration formatters `119-181`; broken `escapeHtml()` `184-192`; `createPipelineRow()` `225-274`; `createPipelineDetailContent()` (status bugs `306,334,366`) `277-383`; `renderDashboard()` `406-449`; dead `renderLiveRefreshIndicator()` `452-479`; `calculateOverallStatus()` `482-504`; `renderOverallStatus()` `507-584`; `renderRepositoryPipelines()` `587-629`; `showPipelineDetail()` & `showGitHubConfirmation()` `632-745`; `checkAndShowAlerts()` `748-800`; `renderErrorState()` `803-819` |
| [`.github/scripts/collect-status.sh`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/.github/scripts/collect-status.sh) | 1,393 | Config & `MONITORED_REPOS` `35-58`; validators `95-138`; `read_backend_event()` `147-286`; `merge_backend_event()` `291-559` (history append bug `471-480`, `.error=null` `554`); `read_frontend_event()` `568-706`; `merge_frontend_event()` `711-979` (history bug `891-900`, `.error=null` `974`); `collect_repo()` `987-1277` (self-monitoring `1044-1050`, `effectiveStatus` `1162-1180`, `overallStatus` `1231-1257`); `main()` `1283-1388` (`cmp -s` `1379`) |
| [`.github/workflows/collect-status.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/.github/workflows/collect-status.yml) | 76 | Triggers (`*/30`, `dispatch`, event `push`) `3-15`; permissions & concurrency `17-22`; PAT checkout `31-36`; script exec `43-49`; `GITHUB_TOKEN` commit/push `51-76` |
| [`.github/workflows/deploy-pages.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/.github/workflows/deploy-pages.yml) | 164 | `workflow_run` trigger `22-26`; workflow/job permissions `30-45,128-131`; `gate` job `38-122`; `deploy` job (`checkout`, `rev-parse`, `upload-pages-artifact path='.'`, `deploy-pages@v4`) `124-164` |
| [`.github/workflows/security-scan.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/.github/workflows/security-scan.yml) | 73 | Triggers `3-11`; permissions `13-14`; Gitleaks `8.30.1` on `git archive HEAD` `32-61`; `zizmorcore/zizmor-action` `63-73` |
| [`.github/workflows/ci-test.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/.github/workflows/ci-test.yml) | 38 | PR/push `main` triggers `3-7`; permissions `9-10`; `setup-node` `20` & `npm run test:integration` `28-38` |
| [`.github/zizmor.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/.github/zizmor.yml) | 15 | `unpinned-uses` pinning policy `7-15` |
| [`scripts/validate-status-json.js`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/scripts/validate-status-json.js) | 154 | Schema constants `11-16`; `validateData()` `18-105`; CLI summary `107-154` |
| [`data/status.json`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/data/status.json) | 1,038 | Local snapshot (`2026-11-16T10:45:42Z`): `athmetry-backend` `6-502`, `athmetry-frontend` `503-712`, `athmetry-system-status` `713-1035` |
| [`data/status-events/backend.json`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/data/status-events/backend.json) | 117 | Consolidated backend pipeline payload `1-109`, metadata `110-116` |
| [`data/status-events/frontend.json`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/data/status-events/frontend.json) | 42 | Frontend workflow payload `1-35`, metadata `36-41` |
| [`package.json`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/package.json) | 12 | `version: "1.0.0"`, `test:browser`, `test:integration`, `@playwright/test: "^1.65.0"` |
| [`playwright.config.js`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/playwright.config.js) | 21 | Test dir `./tests/browser`, Python HTTP server on `127.0.0.1:4173` |
| [`tests/browser/manual-refresh.spec.js`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/browser/manual-refresh.spec.js) | 238 | Reporter hiding `55-85`, scroll lock `87-145`, cache busting & refresh retention `147-238` |
| [`tests/integration/test_dashboard_filtering.js`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/integration/test_dashboard_filtering.js) | 342 | `getDisplayWorkflows()` & `calculateOverallStatus()` unit tests |
| [`tests/integration/test_workflow_triggers.sh`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/integration/test_workflow_triggers.sh) | 35 | Enforces `*/30` cron, `workflow_dispatch`, event push paths, concurrency, `contents: write` |
| [`tests/integration/test_collector_preservation.sh`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/integration/test_collector_preservation.sh) | 162 | End-to-end mocked `gh` test of `collect-status.sh` |
| [`tests/integration/test_backend_integration.sh`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/integration/test_backend_integration.sh) | 411 | 20 tests for `read_backend_event()` & `merge_backend_event()` |
| [`tests/integration/test_frontend_integration.sh`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/integration/test_frontend_integration.sh) | 512 | 30 tests for `read_frontend_event()` & `merge_frontend_event()` |
| [`README.md`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/README.md), [`CHANGELOG.md`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/CHANGELOG.md), [`CONTRIBUTING.md`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/CONTRIBUTING.md), [`CNAME`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-system-status/CNAME) | 443 / 127 / 211 / 0 | System docs, changelog (`57238f7` history + `[Unreleased]`), contributor guide, empty CNAME |
| `docs/**/*` | 20 files | Architecture (`DATA_FLOW.md`, `APPLICATION_ARCHITECTURE.md`, `ARCHITECTURE_DECISIONS.md`, `SYSTEM_OVERVIEW.md`), Deployment (`GITHUB_ACTIONS.md`, `DEPLOYMENT_GUIDE.md`, etc.), Development (`TESTING_GUIDE.md`, etc.), Operations (`KNOWN_LIMITATIONS.md`, `MONITORING.md`, etc.), Agent Context (`PROJECT_CONTEXT.md`, etc.) |

### Monitored Upstream Repositories (`athmetry-backend` & `athmetry-frontend`) `[VERIFIED]`

| File (Absolute Path) | Total Lines | Role in Monitoring System |
|----------------------|-------------|---------------------------|
| [`athmetry-backend/.github/workflows/status-reporter.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-backend/.github/workflows/status-reporter.yml) | 128 | Pushes `data/status-events/backend.json` on completion of `ci.yml`, `security.yml`, `database-ci.yml` on `main` |
| [`athmetry-backend/.github/workflows/ci.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-backend/.github/workflows/ci.yml) | 63 | `Athmetry Backend Validation` (`push`/`PR` on `main`) |
| [`athmetry-backend/.github/workflows/database-ci.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-backend/.github/workflows/database-ci.yml) | 298 | `Athmetry Database Validation` (`push`/`PR` on `main`, path-filtered) |
| [`athmetry-backend/.github/workflows/security.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-backend/.github/workflows/security.yml) | 127 | `Athmetry Security & Supply Chain` (`push` `**`, `PR` `main`, weekly, `dispatch`) |
| [`athmetry-backend/.github/workflows/security-audit.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-backend/.github/workflows/security-audit.yml) | 126 | `Athmetry Dependency Audit` (weekly Mon 04:17 UTC, `dispatch`) |
| [`athmetry-backend/.github/workflows/codeql.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-backend/.github/workflows/codeql.yml) | 73 | `Athmetry Code Security` (weekly Mon 04:23 UTC, `dispatch`, `upload: false`) |
| [`athmetry-frontend/.github/workflows/status-reporter.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-frontend/.github/workflows/status-reporter.yml) | 489 | Pushes `data/status-events/frontend.json` on completion of `ci.yml` on `main` (lines `1-489`) |
| [`athmetry-frontend/.github/workflows/ci.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-frontend/.github/workflows/ci.yml) | 54 | `Athmetry Frontend CI` (`push`/`PR` on `main`) |
| [`athmetry-frontend/.github/workflows/dependency-audit.yml`](file:///Users/tausif/Documents/Projects/athmetry/athmetry-frontend/.github/workflows/dependency-audit.yml) | 127 | `Dependency Audit` (weekly Mon 04:17 UTC, `dispatch`) |
