# Change Impact Map

Cross-reference table mapping change areas to affected files, required checks, and documentation updates.

---

## Quick Reference

| Change Area | Primary Files | Secondary Files | Tests Required | Docs to Update |
|-------------|---------------|-----------------|----------------|----------------|
| Header UI / Theme Toggle | `index.html`, `css/style.css`, `js/app.js` | `js/dashboard.js` (indirect) | Theme toggle, responsive (6 widths × 2 themes) | `APPLICATION_ARCHITECTURE.md`, `CODING_STANDARDS.md`, `TESTING_GUIDE.md` |
| Refresh Button / Manual Refresh | `index.html`, `css/style.css`, `js/app.js` | `js/api.js`, `js/dashboard.js` | Manual refresh (success/error/timeout), auto-refresh | `APPLICATION_ARCHITECTURE.md`, `CODING_STANDARDS.md`, `TESTING_GUIDE.md` |
| Auto-Refresh Interval | `js/app.js` (`REFRESH_INTERVAL_MS`) | `js/api.js` (`STALE_THRESHOLD_MS`) | Auto-refresh timing (60s) | `APPLICATION_ARCHITECTURE.md`, `DATA_FLOW.md` |
| Theme System (CSS Variables) | `css/style.css` (`:root`, `[data-theme="dark"]`) | `index.html` (inline script), `js/app.js` (initTheme) | Both themes, all breakpoints, no flash | `APPLICATION_ARCHITECTURE.md`, `CODING_STANDARDS.md`, `ARCHITECTURE_DECISIONS.md` |
| Responsive Breakpoints | `css/style.css` (media queries) | `index.html` (viewport meta) | 6 widths × 2 themes, no horizontal overflow | `APPLICATION_ARCHITECTURE.md`, `TESTING_GUIDE.md` |
| Status JSON Schema | `.github/scripts/collect-status.sh` (jq), `js/dashboard.js` | `js/api.js`, `scripts/validate-status-json.js`, `data/status.json` | JSON validation, schema validator, collector run, frontend render | `DATA_FLOW.md` (schema version if breaking) |
| Collector Logic | `.github/scripts/collect-status.sh` | `.github/workflows/collect-status.yml` | Isolated collector test | `DATA_FLOW.md`, `GITHUB_ACTIONS.md`, `TROUBLESHOOTING.md` |
| Collector Schedule | `.github/workflows/collect-status.yml` (cron) | — | Workflow triggers on schedule | `GITHUB_ACTIONS.md`, `DEPLOYMENT_GUIDE.md`, `SYSTEM_OVERVIEW.md` |
| Monitored Repositories | `.github/scripts/collect-status.sh` (`MONITORED_REPOS`) | PAT permissions, `js/dashboard.js` (repo ID mapping) | Collector run, new repo renders | `DATA_FLOW.md`, `SYSTEM_OVERVIEW.md`, `ENVIRONMENT_CONFIGURATION.md` |
| GitHub Actions Workflows | `.github/workflows/*.yml` | `.github/scripts/collect-status.sh`, `.github/zizmor.yml` | Local YAML parse + actionlint/zizmor (no dispatch) | `GITHUB_ACTIONS.md`, `DEPLOYMENT_GUIDE.md`, `ENVIRONMENT_CONFIGURATION.md` |
| Security Scanning | `.github/workflows/security-scan.yml`, `.github/zizmor.yml` | `package.json`, `scripts/validate-status-json.js` | YAML parse, actionlint, zizmor, gitleaks | `GITHUB_ACTIONS.md`, `TESTING_GUIDE.md` |
| Pages Deployment | `.github/workflows/deploy-pages.yml` | Repository Pages settings, Security Scan run history | Deploy workflow, gate decisions, live site verification | `DEPLOYMENT_GUIDE.md`, `GITHUB_ACTIONS.md`, `ROLLOVER_GUIDE.md` |
| Footer / Visitor Info / Release Version | `index.html`, `css/style.css`, `js/app.js` (`fetchVisitorInfo`, `fetchReleaseVersion`) | `package.json`, `assets/brand/` (logos) | IP lookup/fallback, version from `package.json` | `APPLICATION_ARCHITECTURE.md`, `TESTING_GUIDE.md` |
| Pipeline Detail Dialog | `index.html`, `js/dashboard.js` (`showPipelineDetail`, `showGitHubConfirmation`), `css/style.css` | `data/status.json` (`latestRun.runUrl`) | Dialog open/close, jobs, history, GitHub URL | `APPLICATION_ARCHITECTURE.md`, `TESTING_GUIDE.md` |
| Alert System (Stale/Error) | `js/dashboard.js` (`checkAndShowAlerts`), `js/api.js` (stale threshold) | `css/style.css` (.alert-card) | Stale data (>10min), repo error | `APPLICATION_ARCHITECTURE.md`, `DATA_FLOW.md`, `TROUBLESHOOTING.md` |
| Print Styles | `css/style.css` (@media print) | `index.html` | Print preview (Ctrl+P) | `APPLICATION_ARCHITECTURE.md`, `TESTING_GUIDE.md` |
| Accessibility | `index.html` (ARIA), `css/style.css` (focus-visible), `js/*.js` | — | Keyboard nav, screen reader, contrast | `CODING_STANDARDS.md`, `TESTING_GUIDE.md` |

---

## Detailed Impact Analysis

### Frontend UI Changes

#### Header / Theme Toggle
```
index.html
  ├── .site-header structure
  ├── .brand (logo + descriptor)
  ├── .header-actions (theme-toggle, refresh-btn, refresh-status)
  └── #last-updated

css/style.css
  ├── .site-header, .header-inner, .brand
  ├── .header-actions (flex layout, responsive)
  ├── .theme-toggle (icon-only, 36×36, backgrounds)
  ├── .refresh-btn (min-width, font-weight, states)
  ├── .refresh-status (loading/success/error)
  └── .last-updated (margin-left: auto, mobile wrap)

js/app.js
  ├── initTheme() — localStorage, data-theme, toggle handler
  └── (no direct header rendering — dashboard.js handles content)
```

**Impact Radius**: High — affects every page load, theme persistence, responsive header layout

#### Refresh Button / Manual Refresh
```
index.html
  ├── #refresh-btn (.btn.refresh-btn)
  │   ├── .refresh-icon (SVG spinner)
  │   └── .refresh-label ("Refresh" / "Refreshing...")
  └── #refresh-status (.refresh-status, aria-live)

css/style.css
  ├── .refresh-btn (min-width, font-weight, .refreshing state)
  ├── .refresh-btn.refreshing (spinner animation, color)
  ├── .refresh-status (.loading, .success, .error)
  └── @media (prefers-reduced-motion) — spinner fallback

js/app.js
  ├── handleManualRefresh() — Promise.race, timeout, states
  ├── setRefreshState() — button disabled, spinner, label
  └── showRefreshMessage() — toast with auto-clear
```

**Impact Radius**: Medium — user-facing action, loading states, error handling

#### Auto-Refresh
```
js/app.js
  ├── REFRESH_INTERVAL_MS = 60000
  ├── refreshTimer = setInterval(async () => renderDashboard(), 60000)
  └── beforeunload cleanup

js/api.js
  ├── STALE_THRESHOLD_MS = 600000 (10 min)
  └── isStale() — used for data freshness checks
```

**Impact Radius**: Low — internal timing, but affects data freshness perception

---

### Theme System

#### CSS Variables (Complete List)
```
:root (Light)
  ├── Backgrounds: --bg-primary, --bg-secondary, --bg-tertiary, --bg-card
  ├── Text: --text-primary, --text-secondary, --text-muted
  ├── Borders: --border-color, --border-strong
  ├── Brand: --color-lime, --color-cyan, --color-blue, --color-blue-hover, --color-teal, --color-midnight, --color-white
  ├── Status: --color-success, --color-success-bg, --color-success-border, --color-failure, --color-failure-bg, --color-failure-border, --color-running, --color-running-bg, --color-running-border, --color-queued, --color-queued-bg, --color-queued-border, --color-cancelled, --color-cancelled-bg, --color-cancelled-border, --color-skipped, --color-skipped-bg, --color-skipped-border, --color-unknown, --color-unknown-bg, --color-unknown-border, --color-warning, --color-warning-bg, --color-warning-border
  ├── Shadows: --shadow-sm, --shadow-md, --shadow-lg
  ├── Spacing: --space-xs, --space-sm, --space-md, --space-lg, --space-xl
  ├── Radius: --radius-sm, --radius-md, --radius-lg, --radius-pill
  └── Transitions: --transition-fast, --transition-normal

[data-theme="dark"]
  └── Overrides for all above (dark-appropriate values)
```

**Impact Radius**: Very High — every visual element depends on these

#### Theme Toggle Implementation
```
index.html (inline script in <head>)
  └── Reads localStorage, sets data-theme BEFORE paint

js/app.js
  ├── initTheme() — called on init, sets data-theme, updates button aria-label
  └── themeToggle click handler — toggles, updates localStorage

css/style.css
  ├── [data-theme="light"] .icon-moon { display: block }
  ├── [data-theme="dark"] .icon-sun { display: block }
  ├── [data-theme="light"] .header-logo-dark { display: none }
  ├── [data-theme="dark"] .header-logo-light { display: none }
  ├── [data-theme="light"] .footer-logo-dark { display: none }
  ├── [data-theme="dark"] .footer-logo-light { display: none }
  └── .theme-toggle backgrounds via variables
```

**Impact Radius**: High — flash prevention, logo swap, button styling

---

### Responsive Breakpoints

```
css/style.css media queries (mobile-first):

@media (max-width: 374px)       // Small mobile
@media (min-width: 375px) and (max-width: 429px)  // Medium mobile
@media (min-width: 430px) and (max-width: 767px)  // Large mobile
@media (min-width: 768px) and (max-width: 1023px) // Tablet
@media (min-width: 1024px)      // Desktop
```

**Key Responsive Behaviors**:
- Header: 3-area desktop → 2-row mobile (last-updated wraps with border-top)
- Repo grid: backend left, system status/frontend stacked right on desktop → 1-col mobile
- Footer: Horizontal desktop → stacked mobile
- Touch targets: ≥44px at all widths
- Horizontal overflow: ZERO at all 6 release test widths

**Test Widths**: 320, 375, 430, 768, 1024, 1440px

---

### Collector & Data Flow

#### Collector Script Structure
```
.github/scripts/collect-status.sh
  ├── Configuration (REPO_OWNER, BRANCH, MONITORED_REPOS, MAX_RUNS_PER_WORKFLOW)
  ├── Helpers (gh_api, json_escape, capitalize)
  ├── collect_repo() — per-repo API calls + normalization
  │   ├── GET /actions/workflows
  │   ├── GET /actions/workflows/{id}/runs?branch=main&per_page=5
  │   ├── GET /actions/runs/{id}/jobs
  │   ├── GET /commits/{sha}
  │   └── Excludes collect-status.yml for athmetry-system-status
  ├── Main loop — builds repos array
  └── JSON assembly + cmp -s change detection
```

#### Workflow Integration
```
.github/workflows/collect-status.yml
  ├── on: schedule (*/5 * * * *) + workflow_dispatch
  ├── permissions: contents: write
  ├── env: ATHMETRY_GITHUB_TOKEN (PAT)
  ├── Steps: checkout (with PAT) → git config → collect script → commit/push (with GITHUB_TOKEN)
  └── concurrency: collect-status (no cancel)
```

#### Data Schema (status.json)
```
{
  schemaVersion: 2,
  collectedAt: "ISO8601",
  monitoredBranch: "main",
  repositories: [{
    name, owner, repo, error,
    overallStatus: "success"|"failure"|"running"|"unknown",
    workflows: [{
      id, name, path, state, html_url,
      effectiveStatus: "success"|"failure"|"running"|"queued"|"unknown",
      latestStatus, latestConclusion,
      latestRun: { status, conclusion, runId, runNumber, runUrl, commitSha, commitMessage, commitAuthor, startedAt, completedAt, jobs[] },
      history: [{ runNumber, status, conclusion, commitSha, startedAt, completedAt, runUrl }]
    }]
  }]
}
```

**Impact Radius**: Very High — contract between collector and frontend

---

### Deployment

#### Pages Workflow
```
.github/workflows/deploy-pages.yml
  ├── on: push to main + workflow_dispatch
  ├── permissions: contents: read, pages: write, id-token: write
  ├── environment: github-pages
  ├── Steps: checkout → upload-pages-artifact (path: '.') → deploy-pages@v4
  └── concurrency: pages (no cancel)
```

#### Repository Settings Required
- Pages Source: GitHub Actions
- Actions: Allow all actions
- Workflow permissions: Read/write (for collector)

---

## Change Propagation Examples

### Example 1: Add New Status Color

| Step | File | Change |
|------|------|--------|
| 1 | `css/style.css` | Add `--color-new`, `--color-new-bg`, `--color-new-border` to `:root` and `[data-theme="dark"]` |
| 2 | `css/style.css` | Add `.status-pill.status-new` variant |
| 3 | `js/dashboard.js` | Add the key to `STATUS_COLORS` and `STATUS_LABELS` |
| 4 | `.github/scripts/collect-status.sh` | Ensure collector can produce the new `effectiveStatus` (if applicable) |
| 5 | Test | All themes, all breakpoints, status pill renders |
| 6 | Docs | Update `APPLICATION_ARCHITECTURE.md` status colors table |

### Example 2: Change Collector Schedule

| Step | File | Change |
|------|------|--------|
| 1 | `.github/workflows/collect-status.yml` | Change cron: `'*/10 * * * *'` |
| 2 | Test | Trigger manually, verify runs every 10 min |
| 3 | Docs | Update `GITHUB_ACTIONS.md`, `DEPLOYMENT_GUIDE.md`, `SYSTEM_OVERVIEW.md` schedule |

### Example 3: Add Monitored Repository

| Step | File | Change |
|------|------|--------|
| 1 | `.github/scripts/collect-status.sh` | Add to `MONITORED_REPOS` array |
| 2 | PAT | Ensure token has Actions: Read, Contents: Read on new repo |
| 3 | `js/dashboard.js` | Verify repo ID mapping (`REPO_KEYS` object) |
| 4 | Test | Collector run → status.json → frontend renders new card |
| 5 | Docs | Update `DATA_FLOW.md`, `SYSTEM_OVERVIEW.md`, `ENVIRONMENT_CONFIGURATION.md` |

### Example 4: Change Status Derivation Logic

| Step | File | Change |
|------|------|--------|
| 1 | `.github/scripts/collect-status.sh` | Modify `effectiveStatus` case block and/or `overallStatus` aggregation |
| 2 | `scripts/validate-status-json.js` | Update `VALID_WORKFLOW_STATUSES` / `VALID_REPO_STATUSES` if the enum changes |
| 3 | Test | All status combinations (completed+success, completed+failure, in_progress, queued, etc.) |
| 4 | `js/dashboard.js` | Update `STATUS_COLORS` / `STATUS_LABELS` only if new display states are introduced |
| 5 | Docs | Update `APPLICATION_ARCHITECTURE.md`, `DATA_FLOW.md` derivation table |

---

## Risk Matrix

| Change Type | Regression Risk | Test Effort | Doc Effort | Approval Needed |
|-------------|-----------------|-------------|------------|-----------------|
| CSS variable value | Low | Medium (visual) | Low | No |
| New CSS variable | Low | Medium | Low | No |
| Media query change | High | High (6×2) | Medium | Yes |
| JS function logic | Medium | Medium | Low | Yes |
| New JS module | Medium | High | High | Yes |
| HTML structure | High | High (6×2) | Medium | Yes |
| Collector script | High | Medium (isolated + workflow) | Medium | Yes |
| Workflow YAML | Medium | Low (local parse/lint) | Medium | Yes |
| JSON schema (breaking) | Very High | High | High | Yes |
| JSON schema (additive) | Low | Low | Low | No |
| New monitored repo | Medium | Medium | Low | Yes |
| PAT permissions | High | Low (workflow run) | Low | Yes (security) |