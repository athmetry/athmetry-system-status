# Coding Standards

## General Principles

1. **No build step** — Code runs directly in browser / on GitHub Actions runners
2. **Vanilla only** — No frameworks, no TypeScript, no bundler, no dependencies
3. **Explicit over implicit** — Clear variable names, named exports, no magic
4. **Small modules** — Each file has a single responsibility
5. **Defensive coding** — Handle missing data, network errors, API changes gracefully

---

## JavaScript Standards

### Module Structure

```javascript
// File: js/module-name.js
/**
 * Brief description of module purpose.
 * @module module-name
 */

// Imports first (if any)
import { something } from "./other-module.js";

// Constants
const CONSTANT_NAME = "value";

// Private helpers (not exported)
function privateHelper() { ... }

// Public API (exported)
export class PublicClass { ... }
export function publicFunction() { ... }
export const publicConstant = "value";
```

### Naming Conventions

| Construct | Convention | Example |
|-----------|------------|---------|
| Files | kebab-case | `api.js`, `dashboard.js` |
| Classes | PascalCase | `StatusApi` |
| Functions | camelCase | `fetchStatus`, `renderDashboard` |
| Constants | UPPER_SNAKE_CASE | `REFRESH_INTERVAL_MS`, `THEME_KEY` |
| Variables | camelCase | `lastData`, `refreshTimer` |
| DOM Elements | PascalCase in EL object | `EL.lastUpdated`, `EL.overallPill` |
| CSS Classes | kebab-case | `.status-pill`, `.repo-card` |
| Data Attributes | kebab-case | `data-repo`, `data-theme` |

### Async/Await

```javascript
// ✅ Good: async/await with try/catch
async function fetchData() {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    handleError(err);
    throw err; // Re-throw for caller
  }
}

// ✅ Good: Promise.race for timeouts
await Promise.race([operation(), timeoutPromise]);

// ❌ Avoid: .then() chains for sequential async
fetch(url).then(r => r.json()).then(data => ...)
```

### Error Handling

```javascript
// Always catch and handle — never let unhandled rejections occur
renderDashboard().catch(err => {
  console.error("Failed to render dashboard:", err);
  // User-facing fallback handled inside renderDashboard
});

// Network errors: distinguish timeout vs other
const isTimeout = err.message === "Request timed out";
showMessage(isTimeout ? "Timed out" : "Failed", "error");
```

### Refresh Status Messaging

Manual refresh must use the published `data/status.json` as its authoritative
source. Update the dashboard only after the response passes schema validation,
and expose success or failure through `#refresh-status` (`role="status"`,
`aria-live="polite"`). A failed refresh must retain the last valid dashboard
data and must not update the browser's "Last checked" timestamp. Browser refresh
time is separate from the collector's `collectedAt` timestamp, and refresh
messaging must not imply that a GitHub Actions collection was triggered.

### DOM Manipulation

```javascript
// ✅ Good: Cache elements at module load
const EL = {
  container: document.getElementById("container"),
  button: document.querySelector(".btn"),
};

// ✅ Good: Use textContent for text, escapeHtml for user data
element.textContent = "Safe text";
element.innerHTML = escapeHtml(userInput); // Only when HTML needed

// ✅ Good: Event listeners added once
button.addEventListener("click", handler);

// ❌ Avoid: innerHTML with untrusted data
// ❌ Avoid: Querying in hot paths (loops, frequent renders)
```

### XSS Prevention

```javascript
// Utility in dashboard.js — use for ALL dynamic content
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Usage
td.innerHTML = `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
```

---

## CSS Standards

### Organization

```css
/* File: css/style.css */

/* 1. Theme Variables */
:root { ... }
[data-theme="dark"] { ... }

/* 2. Base / Reset */
* { box-sizing: border-box; }
html, body { ... }

/* 3. Utilities */
.hidden { ... }
.visually-hidden { ... }

/* 4. Components (alphabetical or logical grouping) */
.btn { ... }
.card { ... }
.header { ... }

/* 5. Responsive (mobile-first, ascending breakpoints) */
@media (max-width: 374px) { ... }
@media (min-width: 375px) and (max-width: 429px) { ... }

/* 6. Print */
@media print { ... }
```

### Custom Properties (Variables)

```css
/* ✅ Good: Semantic names, organized by category */
:root {
  /* Color palette */
  --color-blue: #007bff;
  --color-success: #16a34a;

  /* Semantic aliases */
  --color-primary: var(--color-blue);
  --color-primary-hover: var(--color-blue-hover);

  /* Spacing scale */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;

  /* Border radius */
  --radius-sm: 6px;
  --radius-md: 10px;

  /* Transitions */
  --transition-fast: 120ms ease;
}

/* ✅ Good: Dark mode overrides only what changes */
[data-theme="dark"] {
  --color-blue: #4da8ff;
  --color-primary: var(--color-blue);
  /* Don't repeat unchanged variables */
}
```

### Class Naming (BEM-inspired)

```css
/* Block */
.repo-card { ... }

/* Element */
.repo-card__head { ... }
.repo-card__meta { ... }

/* Modifier */
.repo-card--hover { ... }
.status-pill--success { ... }

/* State (used with JS) */
.refresh-btn.refreshing { ... }
.tab.active { ... }
```

### Responsive Design

```css
/* ✅ Good: Mobile-first, min-width breakpoints */
.component {
  /* Mobile base */
  display: flex;
  flex-direction: column;
}

@media (min-width: 768px) {
  .component {
    flex-direction: row;
  }
}

/* ✅ Good: Use container queries where appropriate (not yet used) */
/* ✅ Good: Fluid typography with clamp() if needed */
```

### Dark Mode

```css
/* ✅ Good: All colors as variables, switched via attribute */
.button {
  background: var(--bg-secondary);
  border-color: var(--border-color);
  color: var(--text-primary);
}

/* ✅ Good: Images handled via CSS show/hide */
[data-theme="light"] .logo-dark { display: none; }
[data-theme="dark"] .logo-light { display: none; }

/* ❌ Avoid: JS manipulating styles for theme */
```

---

## HTML Standards

### Structure

```html
<!-- ✅ Good: Semantic elements -->
<header class="site-header">...</header>
<main class="container">...</main>
<footer class="site-footer">...</footer>

<!-- ✅ Good: ARIA labels on landmarks -->
<section class="card" aria-labelledby="heading-id">
  <h2 id="heading-id">Title</h2>
</section>

<!-- ✅ Good: Inline theme script in <head> (before CSS) -->
<script>
  (function() {
    var t = localStorage.getItem("athmetry-theme");
    document.documentElement.setAttribute("data-theme", t || "light");
  })();
</script>
<link rel="stylesheet" href="css/style.css" />
```

### Accessibility

```html
<!-- ✅ Good: Buttons for actions, links for navigation -->
<button id="refresh-btn" aria-label="Refresh status">Refresh</button>
<a href="https://github.com/..." target="_blank" rel="noopener noreferrer">View run</a>

<!-- ✅ Good: Status updates via aria-live -->
<span id="refresh-status" role="status" aria-live="polite"></span>

<!-- ✅ Good: Dialog for modals -->
<dialog id="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <h2 id="dialog-title">Title</h2>
</dialog>

<!-- ✅ Good: Focus visible -->
*:focus-visible { outline: 2px solid var(--color-blue); outline-offset: 2px; }
```

### Asset References

```html
<!-- ✅ Good: Relative paths, multiple formats for icons -->
<link rel="icon" href="assets/brand/favicon.ico" sizes="32x32" />
<link rel="icon" href="assets/brand/athmetry-app-icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="assets/brand/athmetry-app-icon.svg" />

<!-- ✅ Good: Theme-aware logos -->
<img class="header-logo header-logo-light" src="assets/brand/logo-light.svg" alt="Athmetry" />
<img class="header-logo header-logo-dark" src="assets/brand/logo-dark.svg" alt="Athmetry" />
```

---

## Bash Script Standards (Collector)

```bash
#!/usr/bin/env bash
#
# Script description
# Usage: ./script.sh
#
set -euo pipefail  # Strict mode

# Constants at top
readonly STATUS_FILE="data/status.json"
readonly COLLECTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Functions before main
function_name() {
  local arg="$1"
  # ...
}

# Main at bottom
main() {
  # ...
}
main "$@"
```

### gh CLI Usage

```bash
# ✅ Good: Suppress stderr for expected failures, check output
if ! runs_payload=$(gh_api "/repos/${owner}/${repo}/actions/runs" --jq '.' 2>/dev/null); then
  error="Failed to fetch runs"
fi

# ✅ Good: Use --jq for server-side filtering
gh api "/repos/${owner}/${repo}/actions/runs" --jq '.workflow_runs[0].id'
```

### JSON Construction with jq

```bash
# ✅ Good: Build objects with jq -n and --arg/--argjson
local repo_entry
repo_entry=$(jq -n \
  --arg name "$repo_name" \
  --argjson latestRun "$latest_run" \
  '{
    name: $name,
    latestRun: $latestRun
  }')
printf '%s' "$repo_entry"
```

---

## Git Commit Messages

Follow Conventional Commits:

```
type(scope): brief description

Optional body explaining why, not what.

Optional footer: Ref #123
```

### Types

| Type | Use For |
|------|---------|
| `fix` | Bug fixes |
| `feat` | New features |
| `chore` | Maintenance, dependency updates, config |
| `docs` | Documentation only |
| `style` | Formatting, whitespace (no logic change) |
| `refactor` | Code restructuring (no behavior change) |
| `test` | Adding tests (when we have them) |

### Examples

```
fix(header): prevent theme toggle flash on load
feat(collector): add support for per-repo branch config
chore(deps): update GitHub Actions to v4
docs(architecture): add DATA_FLOW.md
style(css): reorganize responsive breakpoints
```

---

## Pull Request Guidelines

When creating a PR (for external contributors):

1. **Title**: Conventional commit format
2. **Description**: What changed, why, how tested
3. **Testing**: List viewports tested, themes tested, manual steps
4. **Documentation**: Note which `docs/` files updated
5. **No unrelated changes**: No reformatting untouched files

---

## Code Review Checklist

- [ ] No console.log/debugger left in code
- [ ] No hardcoded colors (use CSS variables)
- [ ] No unhandled promise rejections
- [ ] XSS-safe: `escapeHtml` used for dynamic content
- [ ] Accessibility: ARIA labels, focus visible, keyboard nav
- [ ] Responsive: Tested at 320, 375, 430, 768, 1024, 1440px
- [ ] Both themes: Light and dark mode work
- [ ] Documentation updated (per `AGENTS.md` table)
- [ ] No `.bak`, temp files, `node_modules` in diff