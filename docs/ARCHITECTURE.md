# Architecture & Frontend Design

## 1. System Overview

Athmetry System Status (`https://athmetry.github.io/athmetry-system-status/`) is a zero-cost, static CI/CD health portal monitoring the `main` branch of `athmetry-backend`, `athmetry-frontend`, and `athmetry-system-status`.
- **Static runtime:** Served directly from the repository root by GitHub Pages (`index.html`, `css/style.css`, `js/{app,api,dashboard}.js`, `data/status.json`, `package.json`, `assets/brand/`). No backend server, database, bundler, or runtime npm dependencies exist.
- **Security boundary:** The browser only fetches same-origin `data/status.json`, `package.json`, and non-blocking `https://ipwho.is/`. All cross-repository GitHub API calls using `ATHMETRY_GITHUB_TOKEN` happen inside GitHub Actions (`collect-status.yml`).

## 2. Frontend Module Boundaries

| File | Responsibility |
| --- | --- |
| [`index.html`](../index.html) | Semantic markup, inline `<head>` theme-init script (prevents FOUC), full-screen loading overlay, overall status card, 3 repository cards, `<dialog id="pipeline-detail-dialog">`, `<dialog id="github-actions-dialog">`, and footer. |
| [`css/style.css`](../css/style.css) | `:root` (light) and `[data-theme="dark"]` custom properties, 3-area header, asymmetric 2-column repo grid, status pills/dots/badges, dialogs, loading scroll-lock (`body.loading-open`, `body.modal-open`), responsive breakpoints, `@media print` and `prefers-reduced-motion`. |
| [`js/app.js`](../js/app.js) | Entry module: theme toggle (`localStorage["athmetry-theme"]`, default `"light"`), initial load, 60s auto-refresh (`REFRESH_INTERVAL_MS = 60000`), manual refresh with 1.5s minimum loading overlay (`MIN_OVERLAY_VISIBLE_MS = 1500`), visitor IP lookup (`ipwho.is`, 5s timeout), and dynamic release version (`package.json` → `Release v<major>.<minor>`). |
| [`js/api.js`](../js/api.js) | `StatusApi` singleton (`statusApi`): cache-busted fetch (`data/status.json?t=<ms>`, `cache: "no-store"`, 10s `AbortController` timeout), schema v2 validation, `lastValidData` fallback, 10-min stale threshold (`STALE_THRESHOLD_MS = 600000`), `deriveEffectiveStatus`, `isHiddenInternalWorkflow`, and `fetchLiveStatus` helper. |
| [`js/dashboard.js`](../js/dashboard.js) | Pure rendering and status helpers: `getDisplayWorkflows`, `resolveEffectiveStatus`, `calculateOverallStatus`, `getStatusClass`, `getStatusLabel`, `escapeHtml`, `renderDashboard`, `renderErrorState`, pipeline detail modal, GitHub confirmation modal, and stale/collector error alerts. |

## 3. Layout, Presentation Filtering & Status Resolution

- **Three-Card Grid:**
  - Left column (`repo-col-left`): **Athmetry Backend** (`athmetry-backend`, tag `ATHMETRY-WEB`)
  - Right column top (`repo-col-right`): **Athmetry System Status Page** (`athmetry-system-status`, tag `ATHMETRY-SYSTEM-STATUS`)
  - Right column bottom (`repo-col-right`): **Athmetry Frontend** (`athmetry-frontend`, tag `ATHMETRY-WEB`)
- **Presentation-Layer Workflow Filtering (`getDisplayWorkflows(repo)`):**
  - Hides internal coordination workflows (`Athmetry Backend Status Reporter`, `Athmetry Frontend Status Reporter`) across all repos and hides `Deploy to GitHub Pages` on `athmetry-system-status`.
  - Never mutates `repo.workflows`; displayed pipeline counts, card pills, and the overall system status banner are computed from `getDisplayWorkflows(repo)`.
- **Authoritative Status Resolution (`resolveEffectiveStatus(workflow)`):**
  - If `workflow.latestRun.status === "completed"` with a terminal `conclusion` (`success`, `neutral`, `failure`, `action_required`, `timed_out`, `startup_failure`, `cancelled`, `stale`, `skipped`), derives effective status directly from that conclusion so a completed run never renders as `Running` even if `workflow.effectiveStatus` is stale.
  - Maps raw GitHub run/job statuses (`completed` → `Completed`/`success`, `in_progress` → `Running`/`running`, `waiting|requested|pending` → `Queued`/`queued`, `timed_out` → `Timed Out`/`failure`, `action_required` → `Action Required`/`failure`, `startup_failure` → `Startup Failure`/`failure`, `neutral` → `Neutral`/`success`, `stale` → `Stale`/`cancelled`) so detail tables never display `Unknown` for valid GitHub states.
- **Overall Status Precedence (`calculateOverallStatus`):** `failure` > `running` (includes `queued`) > `success` > `unknown`. Any `repo.error` forces overall system status to `failure` and renders an alert banner.

## 4. Theme, Responsive & Accessibility Invariants

- **Theme System:** All colors use CSS custom properties (`--bg-*`, `--text-*`, `--border-*`, `--color-success*`, `--color-failure*`, `--color-running*`, `--color-queued*`, `--color-cancelled*`, `--color-unknown*`). Light/dark brand logos swap purely via CSS (`[data-theme="dark"] .logo-light { display: none; }`).
- **Responsive Gate (Zero Horizontal Overflow at All 6 Widths in Both Themes):**
  - `320px`, `375px`, `430px`, `768px`, `1024px`, `1440px` (`document.documentElement.scrollWidth <= document.documentElement.clientWidth`).
  - Header uses a 3-area flex layout (Brand | Actions | Last Checked); below `430px`, Last Checked wraps to a full-width second row. Below `1024px`, the pipeline duration column hides so workflow names wrap cleanly without truncation.
- **Accessibility & Print:** Semantic landmarks, native `<dialog>` elements with Escape/backdrop dismissal and body scroll lock, visible `:focus-visible` outlines, `aria-live="polite"` status regions, `prefers-reduced-motion: reduce` support, and `@media print` hiding interactive buttons/dialogs/overlays.

## 5. Key Architecture Decisions (ADRs)

| ID | Decision | Rationale |
| --- | --- | --- |
| ADR-01 | Static site + Git-committed `data/status.json` (schema v2) | Zero hosting cost, full Git audit trail, works with private monitored repos without exposing tokens to browsers. |
| ADR-02 | Vanilla ES modules + CSS custom properties (no build step) | Zero dependency churn, instant local serving (`python3 -m http.server`), direct file deployment to GitHub Pages. |
| ADR-03 | Commit-completion `workflow_run` collection + 30-min fallback | Publishes status right after `main` pipelines settle instead of racing `push` workflows or relying solely on throttled cron. |
| ADR-04 | Self-monitoring via `status=completed` + `GITHUB_RUN_ID` exclusion | Keeps failed collector runs visible without pinning `Collect System Status` to `Running` during its own execution. |
| ADR-05 | Manual Refresh fetches published `data/status.json` only | Browser has no GitHub PAT and cannot dispatch workflows; cache-busted fetch with `lastValidData` retention is safe and deterministic. |
| ADR-06 | Quality-gated Pages deployment via `workflow_run` | `GITHUB_TOKEN` collector pushes do not trigger `push` workflows; gating on `Security Scan` lineage blocks unvalidated code while allowing `data/status.json`-only updates. |
