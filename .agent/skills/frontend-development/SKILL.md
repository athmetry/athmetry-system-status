---
name: frontend-development
description: Make safe, validated changes to the vanilla HTML5, CSS3 custom-property themes, and ES module frontend of Athmetry System Status.
---

# Skill: Frontend Development

## Prerequisites

1. Read [`AGENTS.md`](../../../AGENTS.md), [`PROJECT_STATE.md`](../../../PROJECT_STATE.md), [`MEMORY.md`](../../../MEMORY.md), and [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md).
2. Serve locally from the repository root: `python3 -m http.server 8000` (`http://localhost:8000/index.html`). No build step or bundler exists.

## Module & Invariant Rules

- **`index.html`:** Keep semantic landmarks (`<header>`, `<main>`, `<section>`, `<dialog>`, `<footer>`), ARIA attributes, and the inline `<head>` theme initialization script before `css/style.css` to prevent FOUC.
- **`css/style.css`:** Use `:root` (light) and `[data-theme="dark"]` custom properties for all colors. Keep mobile-first breakpoints (`375px`, `430px`, `768px`, `1024px`, `1440px`), zero horizontal overflow across `320, 375, 430, 768, 1024, 1440px` in both themes, `body.loading-open` / `body.modal-open` scroll locks, `prefers-reduced-motion`, and `@media print` rules.
- **`js/app.js`:** Owns theme toggling (`localStorage["athmetry-theme"]`), 60s auto-refresh (`REFRESH_INTERVAL_MS = 60000`), cache-busted manual refresh with 1.5s minimum loading overlay (`MIN_OVERLAY_VISIBLE_MS = 1500`), non-blocking `ipwho.is` visitor lookup (5s timeout), and dynamic release version from `package.json` (`Release v<major>.<minor>`). Never hardcode release versions.
- **`js/api.js`:** Owns `StatusApi` (`fetchStatus` with `?t=<ms>`, `cache: "no-store"`, 10s `AbortController` timeout, schema v2 validation, `lastValidData` retention, 10-min stale threshold `STALE_THRESHOLD_MS = 600000`, `deriveEffectiveStatus`, `isHiddenInternalWorkflow`, and `processWorkflow` self-monitoring via `status=completed`).
- **`js/dashboard.js`:** Keep top-level scope free of DOM access so Node.js tests can import `getDisplayWorkflows`, `resolveEffectiveStatus`, `calculateOverallStatus`, `getStatusClass`, `getStatusLabel`, and `escapeHtml`. Always sanitize dynamic strings with `escapeHtml()` before writing to `innerHTML`.

## Verification Gate

```bash
for f in js/*.js; do node --check "$f"; done
npx --yes html-validate@11.21.1 --rule void-style:off --rule no-implicit-button-type:off --rule no-trailing-whitespace:off index.html
npx --yes csstree-validator@4.0.1 css/style.css
npm run test:integration
npm run test:browser
```

Update [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md) and [`docs/DEVELOPMENT_AND_TESTING.md`](../../../docs/DEVELOPMENT_AND_TESTING.md) whenever frontend behavior or test coverage changes.
