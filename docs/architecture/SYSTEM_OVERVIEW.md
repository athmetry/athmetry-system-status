# System Overview

## Purpose

The Athmetry System Status dashboard provides centralized, at-a-glance operational visibility into the CI/CD pipeline health of three Athmetry repositories:

- **athmetry-backend** — Backend services (`ATHMETRY-WEB`)
- **athmetry-frontend** — Frontend application (`ATHMETRY-WEB`)
- **athmetry-system-status** — This monitoring dashboard (`ATHMETRY-SYSTEM-STATUS`)

Target audience: Athmetry owners (2–3 users initially). No public access control; hosted on public GitHub Pages.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                           │
├─────────────────────────────────────────────────────────────────┤
│  collect-status.yml (every 5 min)                               │
│       │                                                         │
│       ▼                                                         │
│  .github/scripts/collect-status.sh                              │
│       │                                                         │
│       ├── gh api /repos/athmetry/athmetry-backend/actions/...   │
│       ├── gh api /repos/athmetry/athmetry-frontend/actions/...  │
│       ├── gh api /repos/athmetry/athmetry-system-status/...     │
│       │     (own collector reported via latest completed run)   │
│       └── gh api /repos/{owner}/{repo}/actions/runs/{id}/jobs   │
│       │                                                         │
│       ▼                                                         │
│  data/status.json (committed only when changed)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Pages Deployment                       │
├─────────────────────────────────────────────────────────────────┤
│  deploy-pages.yml (workflow_run after security/collector)        │
│       │                                                         │
│       ▼                                                         │
│  actions/upload-pages-artifact (path: '.')                      │
│       │                                                         │
│       ▼                                                         │
│  actions/deploy-pages@v4                                        │
│       │                                                         │
│       ▼                                                         │
│  https://athmetry.github.io/athmetry-system-status/             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Browser (Client)                           │
├─────────────────────────────────────────────────────────────────┤
│  index.html                                                     │
│       │                                                         │
│       ├── js/app.js (bootstrap, auto-refresh, theme, refresh)  │
│       ├── js/api.js (fetch status.json with cache-busting)     │
│       └── js/dashboard.js (DOM rendering)                       │
│       │                                                         │
│       ▼                                                         │
│  fetch data/status.json?t=timestamp (every 60s + manual)       │
│       │                                                         │
│       ▼                                                         │
│  Render: Overall status, repo cards, pipeline lists, alerts     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Security Workflow                            │
├─────────────────────────────────────────────────────────────────┤
│  security-scan.yml (PR / push to main / weekly / dispatch)      │
│       │                                                         │
│       └── gitleaks (secrets) + zizmor (workflow policy)         │
│           Read-only; does not deploy or modify repository data  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| Collector Workflow | Scheduling, auth, commit/push | GitHub Actions (YAML) |
| Collector Script | API calls, normalization, JSON generation | Bash + gh CLI + jq |
| Status JSON | Data contract between collector and frontend | JSON (schemaVersion: 2) |
| Pages Deployment | Quality-gated static site hosting | GitHub Pages + Actions |
| Security Scan | Secret and workflow-misconfiguration scanning | GitHub Actions + gitleaks + zizmor |
| Frontend (HTML/CSS/JS) | Rendering, interaction, theme, refresh | Vanilla ES modules |
| Theme System | Light/dark mode, persistence, no flash | CSS variables + localStorage |

---

## Data Flow Summary

1. **Collection** (server-side, every 5 min):
   - GitHub Actions runner executes `collect-status.sh`
   - Script calls GitHub REST API via `gh` CLI (auth: `ATHMETRY_GITHUB_TOKEN`)
   - Normalizes workflow run data → `data/status.json`
   - Commits and pushes only if JSON content changed

2. **Deployment** (quality-gated):
   - `deploy-pages.yml` runs on `workflow_run` completion of Security Scan or
     Collect System Status on `main` (not on `push`, because `GITHUB_TOKEN`
     commits do not trigger push workflows)
   - The gate allows deployment only for the latest security-validated revision,
     or one that differs from it only by `data/status.json`
   - It checks out that exact SHA, uploads the repository root as the Pages
     artifact, and deploys to GitHub Pages

3. **Security checks** (independent of deployment, but gate deployment):
   - `security-scan.yml` scans tracked files for secrets and workflow
     definitions for misconfigurations
   - It never modifies repository contents or deploys the site
   - Static validation (JS/JSON/HTML/CSS/schema/assets) is run locally before a
     push; it is not a workflow

4. **Consumption** (client-side):
   - Browser loads `index.html` → imports `js/app.js`
   - `app.js` calls `renderDashboard()` → `api.js.fetchStatus()`
   - Fetches `data/status.json?t=<timestamp>` (cache-busting)
   - `dashboard.js` renders repository cards and pipeline rows; pipeline details open in a dialog
   - Auto-refresh every 60 seconds; manual refresh on demand
   - Footer release label is fetched from `package.json` (`fetchReleaseVersion()`)

---

## Technology Stack

| Layer | Technology | Version/Pinning |
|-------|------------|-----------------|
| HTML | HTML5 | — |
| CSS | CSS3 (custom properties, grid, flex) | — |
| JavaScript | Vanilla ES2020 modules | — |
| Data | JSON | Schema version 2 |
| Collector Runtime | Ubuntu GitHub-hosted runner | `ubuntu-latest` |
| Collector Tools | `gh` CLI, `jq` | Pre-installed on runners |
| CI/CD | GitHub Actions | Pinned action SHAs; Pages actions on `@v4` |
| Validation Tools | `node --check`, `jq`, `html-validate`, `csstree-validator` | Pinned npm versions via `npx` |
| Security Tools | gitleaks 8.30.1, zizmor 1.32.0 | Checksum/pinned acquisition |
| Hosting | GitHub Pages | Static, no build step |
| Auth (Collector) | Fine-grained PAT | `ATHMETRY_GITHUB_TOKEN` secret |
| Auth (Deploy) | `GITHUB_TOKEN` + OIDC | Built-in |

---

## Explicitly NOT Used

- React, Angular, Vue, Svelte, or any frontend framework
- Node.js, Express, Spring Boot, or any backend server
- Databases (SQL, NoSQL, time-series)
- Paid monitoring services (Datadog, New Relic, etc.)
- Build tools (Webpack, Vite, esbuild)
- TypeScript (plain JavaScript only)
- CSS frameworks (Tailwind, Bootstrap)

---

## Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Production | https://athmetry.github.io/athmetry-system-status/ | Live dashboard |
| Local Development | `http://localhost:8000/index.html` | Manual testing via static server |

No staging, preview, or feature-branch deployments exist.

---

## Monitoring and Observability

- **Collector Health**: GitHub Actions run history (success/failure/duration)
- **Data Freshness**: Frontend shows "Stale data" alert if `collectedAt` > 10 min
- **Frontend Errors**: Browser console (no external error tracking)
- **Deployment Status**: GitHub Pages deployment workflow runs
- **Quality/Security Status**: `security-scan.yml` run history (static validation runs locally)
- **Visitor Info**: IP/location via ipwho.is (displayed in footer, not stored)

---

## Security Model

- **Collector Token**: Fine-grained PAT (`ATHMETRY_GITHUB_TOKEN`)
  - Read: Actions, Contents on `athmetry-backend`, `athmetry-frontend`, `athmetry-system-status`
  - Read/Write: Contents on `athmetry-system-status` (for commit)
  - Never exposed to frontend
- **Deployment Token**: Built-in `GITHUB_TOKEN` (OIDC, `pages: write`)
- **Frontend**: No authentication, no secrets, public GitHub Pages
- **Data**: `status.json` contains only public GitHub Actions metadata (run IDs, URLs, commit SHAs, authors)

---

## Scalability and Limits

- **Monitored Repos**: Currently 3 (backend, frontend, system-status). Extensible via `MONITORED_REPOS` array.
- **Self-Monitoring**: the collector's own `collect-status.yml` is included; its most recent completed run is reported. All three System Status workflows (`collect-status.yml`, `deploy-pages.yml`, `security-scan.yml`) are visible.
- **History Depth**: 5 runs per workflow (`MAX_RUNS_PER_WORKFLOW=5`, `per_page=5` in collector)
- **Collector Frequency**: Every 5 minutes (cron `*/5 * * * *`)
- **Frontend Refresh**: Every 60 seconds (auto) + manual
- **GitHub API Rate Limits**: Fine-grained PAT has generous limits; 3 repos × (1 workflow listing + 1 run list per workflow + jobs/commit for the latest run) × 12/hr, well within limits.
- **Pages Bandwidth**: GitHub Pages limits apply (soft limits, suitable for low-traffic internal tool)

---

## Future Extensibility (Design Intent)

The data structure (`schemaVersion: 2`) and collector architecture are designed to support:

- Additional repositories (add to `MONITORED_REPOS`)
- Multiple branches per repository (future: per-repo branch config)
- API health checks, Vercel deployments, infrastructure status (new `type` field in repo entry)
- Webhook-based real-time updates (replace/enhance polling)
- Authentication/authorization for dashboard access