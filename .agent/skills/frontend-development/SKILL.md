# Skill: Frontend Development

## Purpose

Make safe, tested changes to the vanilla HTML/CSS/JS frontend of Athmetry System Status.

## Prerequisites

- Read `AGENTS.md` and `docs/architecture/APPLICATION_ARCHITECTURE.md`
- Understand: ES modules, CSS custom properties, mobile-first responsive
- Local server: `python3 -m http.server 8000`

## Architecture Overview

```
index.html (entry, inline theme script)
  ├── css/style.css (ALL styles: theme vars, components, responsive, print)
  ├── js/app.js (bootstrap, lifecycle, theme, refresh, dialog, IP lookup)
  ├── js/api.js (data layer: fetch, cache, stale detection)
  └── js/dashboard.js (pure rendering: DOM updates from data)
```

## Key Conventions

### CSS
- **All colors via variables**: `:root` + `[data-theme="dark"]`
- **Mobile-first**: Base styles, then `@media (min-width: ...)`
- **Breakpoints**: 375, 430, 768, 1024, 1440px (release test set includes 320px → 6 widths)
- **No hardcoded colors**: Use `--color-*`, `--bg-*`, `--text-*`, `--border-*`
- **Dark mode**: Override only what changes in `[data-theme="dark"]`

### JavaScript
- **ES modules**: `<script type="module" src="js/app.js">`
- **Named exports**: `export class`, `export function`, `export const`
- **Async/await**: All async operations
- **Error handling**: Try/catch, never unhandled rejections
- **XSS prevention**: `escapeHtml()` for ALL dynamic content
- **No frameworks**: Vanilla only

### HTML
- **Semantic elements**: `<header>`, `<main>`, `<section>`, `<footer>`, `<dialog>`
- **ARIA**: `aria-label`, `aria-live`, `role`, `aria-modal`
- **Inline theme script**: In `<head>` BEFORE CSS — prevents flash
- **Theme-aware images**: Separate light/dark, CSS show/hide

## Common Tasks

### Change Theme Colors

```css
/* css/style.css */
:root {
  --color-blue: #new-value;
  --color-success: #new-value;
  /* ... */
}

[data-theme="dark"] {
  --color-blue: #new-dark-value;
  /* ... */
}
```

### Add Responsive Breakpoint

```css
/* css/style.css - in Responsive section */
@media (min-width: 500px) and (max-width: 600px) {
  .component {
    /* custom rules */
  }
}
```

### Modify Auto-Refresh Interval

```javascript
// js/app.js
const REFRESH_INTERVAL_MS = 60 * 1000; // Change value
```

### Change Stale Threshold

```javascript
// js/api.js
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // Change value
```

### Add Status Color

```css
/* css/style.css */
:root {
  --color-new: #value;
  --color-new-bg: #value;
  --color-new-border: #value;
}

[data-theme="dark"] {
  --color-new: #dark-value;
  /* ... */
}

.status-pill.status-new {
  background: var(--color-new-bg);
  border-color: var(--color-new-border);
  color: var(--color-new);
}
```

```javascript
// js/dashboard.js
const STATUS_COLORS = {
  // ...
  new: "new",
};

const STATUS_LABELS = {
  // ...
  new: "New",
};
```

## Testing Checklist (Mandatory)

| Test | Viewports | Themes |
|------|-----------|--------|
| Static validation | N/A | N/A |
| Theme toggle | 320, 375, 430, 768, 1024, 1440 | Light, Dark |
| Manual refresh | 1440 | Light |
| Auto-refresh | 1440 | Light (60s) |
| Pipeline detail dialog | 1440 | Both |
| Responsive | All 6 | Both |
| Print preview | Desktop | Light |

**Zero horizontal overflow at all widths.**

## Debugging Shortcuts

```javascript
// Browser console
statusApi.getLastData()
statusApi.isStale()
renderDashboard()
document.documentElement.dataset.theme
document.body.scrollWidth > window.innerWidth  // overflow check
```

## Documentation Updates

Update with every change:
- `docs/architecture/APPLICATION_ARCHITECTURE.md`
- `docs/development/CODING_STANDARDS.md` (if new patterns)
- `docs/development/TESTING_GUIDE.md` (if new test scenarios)
- `CHANGE_IMPACT_MAP.md`

## Anti-Patterns

- ❌ Hardcoded colors (`#123456`, `red`, `blue`)
- ❌ `innerHTML` with user data (use `escapeHtml()`)
- ❌ `.then()` chains (use `async/await`)
- ❌ Querying DOM in loops (cache in `EL` object)
- ❌ Moving inline theme script (causes flash)
- ❌ Adding build step (no Node.js, no bundler)
- ❌ Forgetting dark mode overrides
- ❌ Testing only one viewport/theme