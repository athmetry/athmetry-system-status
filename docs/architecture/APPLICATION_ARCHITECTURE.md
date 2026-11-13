# Application Architecture

## Frontend Architecture

The frontend is a **vanilla JavaScript ES module application** with no build step, no bundler, and no framework.

### Entry Point

- `index.html` — Static HTML with inline theme-initialization script (prevents flash)
- Loads `js/app.js` as `<script type="module">`

### Module Structure

```
js/
├── api.js          # Data access layer (singleton: statusApi)
├── app.js          # Application bootstrap, lifecycle, UI handlers
└── dashboard.js    # Pure rendering logic (no side effects)
```

### Module Responsibilities

| Module | Responsibilities | Exports |
|--------|-----------------|---------|
| `api.js` | Fetch `status.json`, cache-busting, schema validation, stale detection, error handling | `StatusApi` class, `statusApi` singleton |
| `app.js` | Theme init, initial render, auto-refresh timer, manual refresh handler, visitor IP lookup, release version lookup | — (side effects only) |
| `dashboard.js` | DOM rendering: overall status, repo cards, pipeline rows, pipeline detail dialog, alerts | `renderDashboard()` |

### Data Flow (Client-Side)

```
app.js.init()
    │
    ├─► initTheme() ──────────────────────► localStorage + data-theme on <html>
    │
    ├─► renderDashboard() ──► statusApi.fetchStatus() ──► fetch(data/status.json?t=timestamp)
    │       │                                              │
    │       │                                              ▼
    │       │                                         Response → JSON → validate
    │       │                                              │
    │       ▼                                              ▼
    │   dashboard.js.renderDashboard(data) ◄───────── Parsed data
    │       │
    │       ├─► renderOverallStatus(data)
    │       ├─► renderRepositoryPipelines(repo) per repo
    │       ├─► createPipelineRow(workflow) per workflow
    │       └─► checkAndShowAlerts(data)
    │
    ├─► setInterval(renderDashboard, 60000)  # Auto-refresh
    │
    ├─► refreshBtn.click → handleManualRefresh()
    │       └─► renderDashboard() + loading/error/success states
    │
    ├─► fetchVisitorInfo() → ipwho.is (fire-and-forget)
    │
    └─► fetchReleaseVersion() → package.json (footer label)
```

### State Management

**No global state library.** State is held in:

| State | Location | Persistence |
|-------|----------|-------------|
| Theme | `localStorage.athmetry-theme` + `document.documentElement.dataset.theme` | Cross-session |
| Last fetched data | `statusApi.lastData` (module-scoped) | Session only |
| Last fetch timestamp | `statusApi.lastFetchAt` | Session only |
| Refresh in-progress flag | `app.js: isRefreshing` (module-scoped) | Session only |
| Auto-refresh timer | `app.js: refreshTimer` (module-scoped) | Session only |

---

## Theme System

### Implementation

- **CSS Variables**: All colors, spacing, shadows, radii defined in `:root` (light) and `[data-theme="dark"]`
- **No Flash**: Inline `<script>` in `<head>` reads localStorage and sets `data-theme` before paint
- **Toggle**: Button in header → toggles `data-theme` → updates localStorage → CSS handles rest
- **Logo Variants**: Separate light/dark logo images; CSS `[data-theme]` selectors show/hide

### Theme Variables (Key Subset)

| Category | Light (Default) | Dark |
|----------|-----------------|------|
| Backgrounds | `--bg-primary: #fafafa`, `--bg-card: #ffffff` | `--bg-primary: #0f1318`, `--bg-card: #131921` |
| Text | `--text-primary: #1a1d21`, `--text-secondary: #525860` | `--text-primary: #f1f3f5`, `--text-secondary: #a0a8b0` |
| Borders | `--border-color: #e1e4e8`, `--border-strong: #d0d5dd` | `--border-color: #2a3340`, `--border-strong: #3a4555` |
| Status Colors | `--color-success: #16a34a`, `--color-failure: #dc2626` | `--color-success: #4ade80`, `--color-failure: #f87171` |
| Brand | `--color-blue: #007bff`, `--color-teal: #009688` | `--color-blue: #4da8ff`, `--color-teal: #26d4b8` |

### Theme Toggle Button

- **HTML**: Single button with two SVG icons (moon, sun)
- **CSS**: `[data-theme="light"] .icon-moon { display: block }` / `[data-theme="dark"] .icon-sun { display: block }`
- **Backgrounds**: Light theme uses `--bg-secondary`; dark theme uses `--bg-tertiary` + `--border-strong`
- **Size**: 36×36px, icon-only, `border-radius: var(--radius-sm)`

---

## Responsive Design

### Breakpoints (Mobile-First)

| Range | Label | Key Behaviors |
|-------|-------|---------------|
| ≤ 374px | Small mobile | Single column, compact header, hidden last-updated, smaller logos |
| 375–429px | Medium mobile | Similar to small, slightly larger touch targets |
| 430–767px | Large mobile | Header wraps, last-updated visible inline, single-column repo grid |
| 768–1023px | Tablet | Two-column repo grid, full header actions |
| ≥ 1024px | Desktop | Full layout, balanced two-column repository grid |

### Test Widths (Release Gate)

The current release regression standard is six widths in both themes:
**320, 375, 430, 768, 1024, 1440px**. Intermediate widths (360, 390, 412px)
are useful spot checks but are not required for the release gate.

### Header Layout (Three-Area)

```
Desktop (≥768px):     [Brand] ──────── [Actions] ──────── [Last Updated]
Mobile (≤429px):      [Brand] ──── [Actions]
                      [Last Updated wraps to row 2 with border-top]
```

- **Brand**: Left, `flex-shrink: 0`
- **Actions**: Center, `flex-shrink: 1`, `min-width: 0` (allows shrink)
- **Last Updated**: Right via `margin-left: auto` (desktop) / wraps to row 2 (mobile)

### Key Responsive Strategies

- **Fluid typography**: `rem` units, media queries adjust base sizes
- **Flexible grids**: repository grid uses `grid-template-columns: 1fr 1fr` on desktop, `1fr` below 768px
- **Touch targets**: Minimum 44×44px (buttons, tabs)
- **Pipeline lists**: Cards use `overflow: visible` and auto height so all pipelines remain visible
- **Pipeline rows**: Workflow names wrap (never ellipsis to a couple of characters) below 1024px; duration is hidden below 1024px to protect the name column; tablet rows use a compact 4-column grid
- **No horizontal overflow**: Release-verified at 320, 375, 430, 768, 1024, and 1440px

---

## CSS Architecture

### Organization

```
style.css
├── Theme Variables (:root + [data-theme="dark"])
├── Base (reset, typography, focus-visible)
├── Utilities (.hidden, .visually-hidden)
├── Header (.site-header, .brand, .header-actions, buttons)
├── Buttons (.btn, .btn-primary, .icon-btn, .refresh-btn, .theme-toggle)
├── Refresh Status (.refresh-status, .last-updated)
├── Cards (.card, .overall-card, .repo-card)
├── Repository Grid (.web-repositories-grid, .repo-card-stack)
├── Pipelines (.pipelines-list, .pipeline-row, .pipeline-*)
├── Status Pills (all variants + dark mode)
├── Alerts (.alert-card)
├── Dialogs (.pipeline-detail-dialog, .github-actions-dialog)
├── Footer (.site-footer, .footer-visitor)
├── Responsive (5 breakpoint ranges)
└── Print (hides interactive elements)
```

### Naming Convention

- **BEM-like**: `.component__element--modifier` (e.g., `.status-pill--success`)
- **Utility prefixes**: `.status-`, `.repo-`, `.pipeline-`, `.footer-`
- **State classes**: `.active`, `.loading`, `.success`, `.error`, `.refreshing`

### Dark Mode Strategy

- **Single source of truth**: All colors as CSS custom properties
- **Override via attribute**: `[data-theme="dark"] { --var: value }`
- **No JavaScript DOM manipulation** for colors (only toggles attribute)
- **Images**: Separate light/dark logo files; CSS show/hide

---

## JavaScript Conventions

### Module Pattern

```javascript
// Named exports for classes/functions
export class StatusApi { ... }
export const statusApi = new StatusApi();

// Default export for single-purpose modules (not used here)
```

### Async/Await

- All async operations use `async/await`
- Errors caught and handled locally; never propagate unhandled
- Timeouts via `Promise.race([operation, timeoutPromise])`

### DOM Access

- Elements cached in `const EL = { ... }` object (dashboard.js)
- Query once at module load; re-query only when necessary (e.g., tab clone)
- No jQuery, no selectors in hot paths

### Event Handling

- Listeners added once at init (app.js) or via `replaceWith(cloneNode)` pattern (dashboard tabs)
- `aria-*` attributes maintained for accessibility
- `prefers-reduced-motion` respected for spinner animation

### Security

- **XSS Prevention**: `escapeHtml()` utility used for all dynamic content
- **No `innerHTML` with user data**: Only controlled template strings
- **External links**: `rel="noopener noreferrer"` on all `target="_blank"`
- **CSP**: Not configured (GitHub Pages limitation); rely on static content + no eval

---

## Component Details

### Overall Status Card

- **Computed**: `computeOverallStatus(repos)` — priority: failure > running/queued > success > unknown
- **Pill**: `.status-pill` with `.dot` indicator; color via CSS variables
- **Detail Text**: `overallDetailMessage()` — human-readable summary
- **Meta Row**: Monitored branch, last successful build, last collected timestamp

### Repository Health Cards

- **Layout**: Backend on the left (full column height); System Status top-right; Frontend bottom-right. Single column below 768px.
- **Card Structure**: Header (monitor icon + display name + dynamic metadata + product tag + status pill) → Pipelines (count header + rows)
- **Dynamic Metadata**: `"<N> pipelines · <branch> branch"` derived from `repo.workflows.length` and `data.monitoredBranch`
- **Product Tags**: `ATHMETRY-WEB` for Backend/Frontend, `ATHMETRY-SYSTEM-STATUS` for System Status
- **Status Derivation**: Collector maps GitHub `status` + `conclusion` to `effectiveStatus`; frontend renders that value.
- **Pipeline Rows**: Status dot, workflow name/path, latest run number/time, duration, and a details button. Rows grow naturally without clipping.

### Pipeline Detail Dialog

- **Trigger**: Click a pipeline row or its details button
- **Content**: Effective status, run metadata, commit details, jobs table, and up to five history runs for that workflow
- **GitHub Link**: "View on GitHub" opens a confirmation dialog, then the latest run URL supplied by the collector
- **Accessibility**: `aria-modal="true"`, Escape to close, backdrop click to close, body scroll lock

### Visitor Information

- **Source**: `https://ipwho.is/` (5s timeout, AbortController)
- **Display**: Footer, always visible
- **Failure**: Shows "Unavailable" silently; never blocks dashboard

### Release Version

- **Source**: `package.json` fetched by `fetchReleaseVersion()` in `app.js`
- **Display**: Footer `Release v<major>.<minor>` (e.g. `1.0.0` → `Release v1.0`)
- **Fallback**: If the fetch fails, the placeholder `Release v—` remains
- **Single Source of Truth**: No hardcoded version in HTML or JavaScript

### GitHub Actions Dialog

- **Trigger**: "View on GitHub" action in the pipeline detail dialog
- **Content**: Warning message + "Cancel" / "Continue to GitHub" buttons
- **URL**: The latest run URL from `workflow.latestRun.runUrl` (not a hardcoded map)
- **Accessibility**: `aria-modal="true"`, Escape to close, backdrop click to close

### Alerts

- **Stale Data**: If `collectedAt` > 10 minutes → warning banner
- **Repo Errors**: If `repo.error` present → error banner
- **Dismissible**: No — alerts auto-clear when condition resolves

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| `fetch(status.json)` fails | `renderErrorState()` sets overall status to "Error" with "Unable to load status data...", clears all three repository cards to "Error loading data", and resets counts to `0` |
| JSON parse error | Same as above |
| Stale data (>10 min) | Warning in alert banner; dashboard still renders last data |
| Repo API error (collector) | `repo.error` field populated; frontend shows in alert banner |
| Manual refresh timeout (10s) | Error toast "Refresh timed out. Showing last available data." |
| Manual refresh network error | Error toast "Refresh failed. Showing last available data." |
| IP lookup failure | Silent; footer shows "Unavailable" |
| Theme localStorage unavailable | Defaults to light; no error |

---

## Performance Characteristics

- **Initial Load**: ~3 requests (HTML, CSS, JS) + 1 JSON fetch
- **JS Bundle**: ~15 KB total (3 modules, no dependencies)
- **CSS**: ~35 KB (single file, no framework)
- **Auto-refresh**: 60s interval, cache-busted JSON fetch (~2-5 KB)
- **No Hydration**: Pure static HTML + progressive enhancement
- **Lighthouse**: Expected >90 on all metrics (static, minimal JS)