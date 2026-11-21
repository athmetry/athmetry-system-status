# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- Commit-completion pipeline reporting on `.github/workflows/collect-status.yml` via `workflow_run` completion of `CI Integration Tests` and `Security Scan` on `main`, with bounded sibling-workflow settlement (`wait_for_commit_workflows`) and duplicate-trigger idempotency (`is_duplicate_commit_publish`).
- Automated CI workflow (`.github/workflows/ci-test.yml`) running `npm run test:integration` on pull requests and pushes to `main`.
- Frontend (`data/status-events/frontend.json`) and Backend (`data/status-events/backend.json`) status-event consumption with stale-event protection (`sourceRunId` / `sourceRunAttempt`).
- Integration test suites (`tests/integration/test_{backend_integration,frontend_integration,workflow_triggers,collector_preservation,collector_status_accuracy,dashboard_filtering}.*`) and Playwright browser regression tests (`tests/browser/manual-refresh.spec.js`).
- Three-tier AI context and documentation hierarchy: Tier 1 (`AGENTS.md`, `PROJECT_STATE.md`, `MEMORY.md`), Tier 2 (`docs/README.md`, `docs/{ARCHITECTURE,DATA_FLOW,CI_CD_AND_DEPLOYMENT,DEVELOPMENT_AND_TESTING,OPERATIONS}.md`), and Tier 3 (`docs/archive/`).
- Security Scan workflow (`.github/workflows/security-scan.yml`) with `gitleaks` `8.30.1` and `zizmor` `1.32.0` governed by `.github/zizmor.yml`.
- Three-card dashboard layout monitoring `athmetry-backend`, `athmetry-system-status`, and `athmetry-frontend` with pipeline detail modal, dynamic `package.json` release label, and `scripts/validate-status-json.js` schema v2 validator.

### Changed
- Quality-gated `.github/workflows/deploy-pages.yml` on `workflow_run` completion of `Security Scan` or `Collect System Status` on `main`, verifying `Security Scan` lineage before deployment.
- Consolidated 21 legacy `docs/` files into 6 focused Tier 2 reference documents and archived `ATHMETRY_SYSTEM_STATUS_CONTEXT.md` under `docs/archive/`.
- Hid internal coordination and self-deployment workflows (`Athmetry Backend Status Reporter`, `Athmetry Frontend Status Reporter`, `Deploy to GitHub Pages`) from dashboard cards (`getDisplayWorkflows`) and excluded them from `repo.overallStatus`.
- Locked background scrolling while the manual-refresh loading overlay is active (1.5s minimum visibility).

### Fixed
- Fixed completed workflows displaying as **Running** on the status portal by replacing the premature `push` trigger on `collect-status.yml` with `workflow_run` + sibling commit-workflow settlement, querying `status=completed` with active `GITHUB_RUN_ID` exclusion for `collect-status.yml` self-monitoring (preserving all 5 completed history entries), reconciling GitHub API run-vs-jobs completion lag via `/actions/runs/{id}`, and adding `resolveEffectiveStatus()` in `js/dashboard.js`.
- Mapped raw GitHub run/job statuses (`completed`, `in_progress`, `waiting`, `requested`, `pending`) and conclusions (`timed_out`, `action_required`, `startup_failure`, `neutral`, `stale`) in `js/dashboard.js` so pipeline detail tables no longer display `Unknown` for completed runs.
- Fixed HTML entity replacements in `escapeHtml()` (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#039;`) and excluded `in_progress` runs from `StatusApi.processWorkflow` self-monitoring history.

---

## [1.0.0] — 2026-11-12

- Initial Phase 1 static dashboard deployment (`57238f7`): overall health banner, repository cards, light/dark theme with inline `<head>` pre-paint script and `localStorage` persistence, 60s auto-refresh, cache-busted manual refresh with 10s timeout, 10-min stale warning banner, responsive layout across `320–1440px`, non-blocking visitor IP lookup, print stylesheet, fine-grained PAT collector (`ATHMETRY_GITHUB_TOKEN`), and GitHub Pages deployment via OIDC.

---

## [0.x] — 2026-11 (Pre-Phase 1)

- Initial repository scaffold, HTML/CSS theme prototypes, and early collector/workflow drafts.
