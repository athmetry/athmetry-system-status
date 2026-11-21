# Athmetry System Status — Agent Instructions

## Scope & Pinned Stack

Static engineering CI/CD health monitoring dashboard (`athmetry-system-status`) for `athmetry-backend`, `athmetry-frontend`, and `athmetry-system-status` (`main` branch).
- **Live URL:** `https://athmetry.github.io/athmetry-system-status/` (`CNAME` reserved empty for future `status.athmetry.com`).
- **Stack:** Vanilla HTML5 (`index.html`), CSS3 custom-property themes (`css/style.css`), ES modules (`js/app.js`, `js/api.js`, `js/dashboard.js`), JSON (`data/status.json` schema v2, `data/status-events/{backend,frontend}.json`), Bash + `gh` + `jq` collector (`.github/scripts/collect-status.sh`), GitHub Actions, GitHub Pages.
- **No runtime framework or build step.** `package.json` (`version: "1.0.0"`, `@playwright/test`) is for dev/CI tests and is the **single source of truth** for the footer release label (`Release v<major>.<minor>`). Never hardcode release versions in HTML/JS or modify `athmetry-backend` / `athmetry-frontend` from this repository.

## Workflows, Collector & Portal Invariants

- **Four workflows (`.github/workflows/`):**
  1. `collect-status.yml` (`Collect System Status`) — Triggers on `workflow_run` completion of `CI Integration Tests` or `Security Scan` on `main`, `*/30 * * * *` fallback cron, and `workflow_dispatch`. Uses `ATHMETRY_GITHUB_TOKEN` (fine-grained PAT) for GitHub API reads + checkout and built-in `GITHUB_TOKEN` for `git push` of `data/status.json`. Concurrency `group: collect-status`, `cancel-in-progress: false` (never `true`, because `Collect System Status` is displayed on the dashboard).
  2. `deploy-pages.yml` (`Deploy to GitHub Pages`) — Triggers on `workflow_run` completion of `Security Scan` or `Collect System Status` on `main`. Deploys only when `main` HEAD matches the latest successful `Security Scan` SHA or differs from it solely by `data/status.json`.
  3. `security-scan.yml` (`Security Scan`) — Runs `gitleaks` `8.30.1` on tracked files and `zizmor` `1.32.0` against `.github/workflows/` using `.github/zizmor.yml` (`actions/checkout`, `actions/*`, `*` SHA-pinned; `actions/upload-pages-artifact` and `actions/deploy-pages` `@v4`).
  4. `ci-test.yml` (`CI Integration Tests`) — Runs `npm ci && npm run test:integration` on PRs and pushes to `main`.
- **Collector accuracy (`.github/scripts/collect-status.sh`):** Waits for sibling `push` workflows (`ci-test.yml`, `security-scan.yml`) on `TRIGGER_HEAD_SHA` to reach terminal `completed` state; queries `status=completed` and excludes active `GITHUB_RUN_ID` for self-monitoring (`collect-status.yml`); reconciles run-vs-jobs completion lag via `/actions/runs/{id}`; merges validated Backend/Frontend status events with stale-event protection (`runId`/`runAttempt`); excludes hidden internal workflows from `repo.overallStatus`; skips duplicate `workflow_run` publishes for an already-settled commit. Must remain macOS Bash 3.2+ and Linux Bash 5+ compatible.
- **Frontend invariants (`js/`):** Three-card layout (`athmetry-backend` left, `athmetry-system-status` top-right, `athmetry-frontend` bottom-right); 60s auto-refresh (`REFRESH_INTERVAL_MS = 60000`); manual refresh re-fetches published `data/status.json` with cache busting, 10s timeout, and 1.5s minimum scroll-locked loading overlay (never triggers collection); 10-min stale warning (`STALE_THRESHOLD_MS = 600000`); presentation filtering (`getDisplayWorkflows`) hides `Athmetry Backend Status Reporter`, `Athmetry Frontend Status Reporter`, and `Deploy to GitHub Pages`; `resolveEffectiveStatus` reconciles completed `latestRun` data; all dynamic HTML uses `escapeHtml()`; inline `<head>` theme script prevents flash; zero horizontal overflow across `320, 375, 430, 768, 1024, 1440px` in light and dark themes.

## Validation, Security & Release Gates

- **Run and pass before any PR/merge:**
  - `for f in js/*.js; do node --check "$f"; done`
  - `bash -n .github/scripts/collect-status.sh`
  - `jq empty data/status.json package.json && node scripts/validate-status-json.js`
  - `ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/*.yml .github/zizmor.yml`
  - `zizmor --config .github/zizmor.yml --offline .github/workflows/`
  - `npx --yes html-validate@11.21.1 --rule void-style:off --rule no-implicit-button-type:off --rule no-trailing-whitespace:off index.html`
  - `npx --yes csstree-validator@4.0.1 css/style.css`
  - `npm run test:integration` and `npm run test:browser`
- **Safety rules:** Never commit, push, merge, deploy, or edit secrets/schedules without explicit user authorization. Never expose tokens or secrets in code, logs, or docs. Keep `git status` clean (no `.bak` or temp files) and verify zero broken relative Markdown links.

## Documentation Hierarchy & Skills (Load Minimal Context)

1. **Tier 1 (Session Start):** Read [`AGENTS.md`](AGENTS.md), [`PROJECT_STATE.md`](PROJECT_STATE.md), and [`MEMORY.md`](MEMORY.md).
2. **Tier 2 (On-Demand):** Consult [`docs/README.md`](docs/README.md) and load only the single reference needed (`ARCHITECTURE.md`, `DATA_FLOW.md`, `CI_CD_AND_DEPLOYMENT.md`, `DEVELOPMENT_AND_TESTING.md`, `OPERATIONS.md`).
3. **Tier 3 (Archive):** Historical audits live in [`docs/archive/README.md`](docs/archive/README.md); do not load for routine tasks.
- **Task skills (`.agent/skills/`):** `frontend-development`, `github-actions`, `production-release`, `repository-investigation`, `testing-and-regression`.
