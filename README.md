# Athmetry System Status

Lightweight, static CI/CD engineering health portal for Athmetry. Centralizes pipeline status across `athmetry-backend`, `athmetry-frontend`, and `athmetry-system-status` (`main` branch) in a single zero-cost dashboard.

- **Live Portal (GitHub Pages):** https://athmetry.github.io/athmetry-system-status/
- **Reserved Custom Domain:** `status.athmetry.com` (`CNAME` kept empty until DNS is provisioned)

## Stack & Repository Layout

- **Runtime:** HTML5 ([`index.html`](index.html)), CSS3 custom properties ([`css/style.css`](css/style.css)), vanilla ES2020 modules ([`js/app.js`](js/app.js), [`js/api.js`](js/api.js), [`js/dashboard.js`](js/dashboard.js)), and JSON ([`data/status.json`](data/status.json) schema v2). No frontend framework, backend server, database, or build step.
- **Dev & Test Tooling ([`package.json`](package.json)):** Single source of truth for the footer release label (`version: "1.0.0"` → `Release v1.0`), integration test runner (`npm run test:integration`), and Playwright browser tests (`npm run test:browser`).
- **Automation (`.github/`):**
  - [`workflows/collect-status.yml`](.github/workflows/collect-status.yml) & [`scripts/collect-status.sh`](.github/scripts/collect-status.sh) — Triggers on `workflow_run` completion of `CI Integration Tests` or `Security Scan` on `main` (covering both direct commits and upstream `data/status-events/{backend,frontend}.json` pushes), `*/30 * * * *` fallback cron, and `workflow_dispatch`. Waits for sibling commit workflows to settle, queries `status=completed` for self-monitoring, reconciles run-vs-jobs completion lag, merges Backend/Frontend events with stale-event protection, and commits `data/status.json` via `GITHUB_TOKEN` only when changed.
  - [`workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) — Quality-gated GitHub Pages deployment via `workflow_run`; deploys only `Security Scan`-validated revisions or revisions differing solely by `data/status.json`.
  - [`workflows/security-scan.yml`](.github/workflows/security-scan.yml) & [`zizmor.yml`](.github/zizmor.yml) — Runs `gitleaks` `8.30.1` and `zizmor` `1.32.0`.
  - [`workflows/ci-test.yml`](.github/workflows/ci-test.yml) — Runs `npm ci && npm run test:integration` on PRs and pushes to `main`.

## Quick Start & Validation

```bash
# Install dev tooling (Playwright)
npm ci

# Serve locally (no build step)
python3 -m http.server 8000
# Open http://localhost:8000/index.html

# Run automated integration, browser, and static validation checks
npm run test:integration
npm run test:browser
for f in js/*.js; do node --check "$f"; done
bash -n .github/scripts/collect-status.sh
jq empty data/status.json package.json && node scripts/validate-status-json.js
zizmor --config .github/zizmor.yml --offline .github/workflows/
```

## Documentation

Start at [`docs/README.md`](docs/README.md) for the complete 3-tier documentation index:
- **Tier 1 (Session Context):** [`AGENTS.md`](AGENTS.md), [`PROJECT_STATE.md`](PROJECT_STATE.md), [`MEMORY.md`](MEMORY.md)
- **Tier 2 (Technical References):** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/DATA_FLOW.md`](docs/DATA_FLOW.md), [`docs/CI_CD_AND_DEPLOYMENT.md`](docs/CI_CD_AND_DEPLOYMENT.md), [`docs/DEVELOPMENT_AND_TESTING.md`](docs/DEVELOPMENT_AND_TESTING.md), [`docs/OPERATIONS.md`](docs/OPERATIONS.md)
- **Tier 3 (Historical Archive):** [`docs/archive/README.md`](docs/archive/README.md)

## License

Private repository — Athmetry.
