# Architecture Decisions

This document records significant architectural decisions, their rationale, and trade-offs. Decisions are listed chronologically.

---

## ADR-001: Static Site, No Backend

**Date**: 2026-11 (Phase 1 inception)

**Decision**: Build a pure static site (HTML/CSS/JS) hosted on GitHub Pages with no backend server, database, or build step.

**Rationale**:
- Minimal operational overhead (no server to maintain, patch, monitor)
- Zero cost (GitHub Pages free for public repos)
- Security: no attack surface beyond static files
- Simplicity: any developer can run locally with `python3 -m http.server`
- Aligns with "engineering dashboard" use case — read-only, periodic updates

**Trade-offs**:
- No real-time updates (polling only)
- No authentication/authorization
- No server-side computation
- Client-side only logic

**Status**: ✅ Implemented

---

## ADR-002: Collector as GitHub Actions Workflow (Not External Cron)

**Date**: 2026-11

**Decision**: Run the status collector as a scheduled GitHub Actions workflow (`cron: '*/5 * * * *'`), not an external cron job or separate service.

**Rationale**:
- Native GitHub integration (no external infrastructure)
- `gh` CLI pre-installed on runners
- Built-in secret management (`ATHMETRY_GITHUB_TOKEN`)
- Automatic retry, logs, and visibility in Actions tab
- Free minutes on GitHub-hosted runners (sufficient for 5-min schedule)

**Trade-offs**:
- Tied to GitHub platform
- Runner cold-start latency (~10-20s)
- Cannot run more frequently than 1 minute (GitHub minimum cron)
- Depends on GitHub Actions availability

**Status**: ✅ Implemented

---

## ADR-003: Fine-Grained PAT for Collector Authentication

**Date**: 2026-11

**Decision**: Use a fine-grained Personal Access Token (`ATHMETRY_GITHUB_TOKEN`) stored as a repository secret, not the built-in `GITHUB_TOKEN`.

**Rationale**:
- Built-in `GITHUB_TOKEN` only has access to the workflow's repository
- Collector needs read access to `athmetry-backend`, `athmetry-frontend`, and `athmetry-system-status` (cross-repo)
- Fine-grained PAT can be scoped to specific repos and permissions
- Least privilege: read-only on monitored repos, read/write only on status repo

**Trade-offs**:
- PAT rotation required (expiration management)
- Secret must be manually created in repository settings
- Not auto-rotated like `GITHUB_TOKEN`

**Status**: ✅ Implemented

---

## ADR-004: Collector Commits JSON to Repository

**Date**: 2026-11

**Decision**: Collector writes `data/status.json` and commits/pushes it to the `main` branch of the same repository.

**Rationale**:
- GitHub Pages serves from the repository — JSON becomes immediately available
- Version history of status data (audit trail)
- No separate storage (S3, database, Gist) needed
- Atomic: JSON + frontend code deployed together via Pages workflow

**Trade-offs**:
- Commits on every change (noise in git history)
- Requires `contents: write` permission
- Potential race conditions (mitigated by `concurrency` group)
- JSON file grows with history (currently limited to 5 runs per workflow)

**Status**: ✅ Implemented

**Mitigation**: Collector only commits when JSON content actually changes (`cmp -s` check).

---

## ADR-005: Vanilla JavaScript ES Modules (No Framework, No Build)

**Date**: 2026-11

**Decision**: Write frontend in vanilla JavaScript using native ES modules (`<script type="module">`), no bundler, no TypeScript, no framework.

**Rationale**:
- Zero build step — edit and refresh
- No dependency management, no `package.json`, no `node_modules`
- Native browser caching of modules
- Small bundle (~15 KB total)
- Team can read/modify without framework knowledge
- Long-term maintainability (no framework churn)

**Trade-offs**:
- No tree-shaking (but code is tiny)
- No TypeScript type safety
- Manual dependency management (none currently)
- No hot module replacement (not needed for static site)

**Status**: ✅ Implemented

---

## ADR-006: CSS Custom Properties for Theming (No CSS-in-JS, No Preprocessor)

**Date**: 2026-11

**Decision**: Use CSS custom properties (variables) for all themeable values, switched via `[data-theme="dark"]` on `<html>`.

**Rationale**:
- Native browser feature, no build step
- Instant theme switching (no re-render)
- Single source of truth for colors, spacing, shadows
- Works with `prefers-color-scheme` if desired
- Easy to extend with new themes

**Trade-offs**:
- No IE11 support (not required)
- Variables must be defined in `:root` or component scope
- Slightly verbose for complex calculations (not needed here)

**Status**: ✅ Implemented

---

## ADR-007: Inline Theme Script to Prevent Flash

**Date**: 2026-11

**Decision**: Inline a small `<script>` in `<head>` that reads `localStorage` and sets `data-theme` before first paint.

**Rationale**:
- Without this, light theme flashes briefly on dark-mode visits
- CSS-only `[data-theme]` switch is instant once attribute is set
- Minimal code (~15 lines), no dependencies

**Trade-offs**:
- Inline script in HTML (minor CSP consideration)
- Runs before DOM ready (intentional)

**Status**: ✅ Implemented

---

## ADR-008: Cache-Busting via Timestamp Query Parameter

**Date**: 2026-11

**Decision**: Append `?t=<Date.now()>` to `data/status.json` fetch URL.

**Rationale**:
- GitHub Pages may cache static files
- Browser may cache despite `cache: "no-store"`
- Timestamp ensures fresh fetch every time
- No server-side config needed

**Trade-offs**:
- Defeats CDN caching (acceptable for ~5 KB JSON, 12 requests/min max)
- URL changes every request (no browser cache benefit)

**Status**: ✅ Implemented

---

## ADR-009: Auto-Refresh Every 60 Seconds (Not Real-Time)

**Date**: 2026-11

**Decision**: Frontend polls `status.json` every 60 seconds via `setInterval`.

**Rationale**:
- Collector runs every 5 minutes — 60s refresh gives ~5x oversampling
- No WebSocket/server-sent events infrastructure needed
- Simple, reliable, works everywhere
- Low bandwidth (~5 KB × 60/hr = 300 KB/hr per client)

**Trade-offs**:
- Data up to 60s stale (plus collector 5-min latency)
- Continuous network activity (minor)
- No push notifications

**Status**: ✅ Implemented

---

## ADR-010: Manual Refresh Fetches Published JSON Only (Does Not Trigger Collector)

**Date**: 2026-11

**Decision**: The "Refresh" button only re-fetches `data/status.json` from GitHub Pages; it does NOT trigger the collector workflow.

**Rationale**:
- Clear separation: collector = server-side scheduled; refresh = client-side fetch
- Collector runs on fixed schedule (5 min) — manual trigger adds complexity
- Avoids GitHub Actions API rate limits from user clicks
- User expectation: "refresh" = "show me latest published data"

**Trade-offs**:
- User cannot force immediate collection
- If collector failed, refresh shows stale data (with warning)

**Status**: ✅ Implemented (documented in UI tooltip and `AGENTS.md`)

---

## ADR-011: Stale Threshold (10 min) ≠ Collector Schedule (5 min)

**Date**: 2026-11

**Decision**: Frontend considers data stale after 10 minutes; collector runs every 5 minutes.

**Rationale**:
- Allows 1 collector failure without immediate alarm
- 10 minutes = 2 missed collector runs
- Prevents false alerts during brief GitHub API outages
- Collector schedule can change without frontend code change

**Trade-offs**:
- Up to 10 minutes of stale data before warning
- Two independent configs to keep in sync mentally

**Status**: ✅ Implemented

---

## ADR-012: Three-Area Header Layout with `margin-left: auto`

**Date**: 2026-11 (refined during responsive fixes)

**Decision**: Header uses three zones: Brand (left), Actions (center, `flex-shrink: 1`), Last Updated (right via `margin-left: auto`).

**Rationale**:
- Enables proper responsive wrapping
- Desktop: all three inline
- Mobile (≤429px): Last Updated wraps to row 2 with border
- `flex-shrink: 1` on Actions prevents overflow
- No JavaScript layout logic needed

**Trade-offs**:
- Requires `min-width: 0` on shrinkable flex items
- Slightly more complex CSS than fixed layout

**Status**: ✅ Implemented

---

## ADR-013: Theme Toggle as Icon-Only Compact Button (36×36px)

**Date**: 2026-11

**Decision**: Theme toggle is a 36×36px icon-only button with SVG moon/sun icons swapped via CSS `[data-theme]` selectors.

**Rationale**:
- Compact, fits in header alongside refresh button
- No text = no localization issues
- Icon swap via CSS (no JS DOM manipulation)
- Professional appearance

**Trade-offs**:
- Requires tooltip/aria-label for accessibility
- Icon-only may be less discoverable

**Status**: ✅ Implemented

---

## ADR-014: Refresh Button Prominent (min-width 110px, font-weight 600)

**Date**: 2026-11

**Decision**: Refresh button is larger than theme toggle, with label "Refresh", loading spinner, and label change to "Refreshing...".

**Rationale**:
- Primary user action — should be prominent
- Clear loading feedback (spinner + label + disabled state)
- Success/error toast after completion
- Accessible: `aria-live` status region

**Trade-offs**:
- Takes more header space
- More complex state handling

**Status**: ✅ Implemented

---

## ADR-015: Visitor IP Lookup via ipwho.is (Client-Side, Fire-and-Forget)

**Date**: 2026-11

**Decision**: Fetch visitor IP/location from `https://ipwho.is/` in frontend, display in footer. (Previously ipinfo.io, changed to ipwho.is for CORS support.)

**Rationale**:
- No backend needed
- Useful for debugging "is this my dashboard?"
- 5s timeout, non-blocking
- Shows "Unavailable" gracefully on failure
- CORS-enabled for browser requests

**Trade-offs**:
- External dependency (ipwho.is)
- May be blocked by ad blockers / privacy tools
- IP geolocation is approximate
- No server-side logging (by design)

**Status**: ✅ Implemented

---

## ADR-016: GitHub Pages Deployment via Actions (Not Direct Push)

**Date**: 2026-11

**Decision**: Use `actions/upload-pages-artifact` + `actions/deploy-pages@v4` workflow, triggered on push to `main`.

**Rationale**:
- Official GitHub-recommended approach
- OIDC token (`id-token: write`) — no secrets needed
- Environment protection (`github-pages` environment)
- Clean separation from collector commits

**Trade-offs**:
- Extra workflow run on every push
- Slightly slower than legacy `gh-pages` branch
- Requires Pages source = "GitHub Actions" in repo settings

**Status**: ✅ Implemented

---

## ADR-017: No Browser Test Suite (Static CI Validation Only)

**Date**: 2026-11

**Decision**: No committed unit, integration, or browser/E2E test suite. CI
performs static validation (JavaScript syntax, JSON, status schema, HTML, CSS,
required files, brand assets) and security scanning (gitleaks, zizmor).
Interactive behavior is verified manually.

**Rationale**:
- Small codebase
- Static site — low regression risk
- Manual testing at 6 viewports × 2 themes documented
- Team size (2-3) doesn't justify maintaining a browser suite
- Static CI validation catches syntax and contract regressions automatically

**Trade-offs**:
- Interaction and visual regressions caught only manually
- No automated visual regression gate
- Refactoring risk remains for rendering logic

**Status**: ✅ Implemented (documented as known limitation)

**Future**: Consider a committed Playwright suite for visual regression if complexity grows.

---

## ADR-018: Single `main` Branch (No Feature Branches Required)

**Date**: 2026-11

**Decision**: All development on `main`; no enforced PR/branch protection.

**Rationale**:
- Small team, low risk
- Collector commits directly to `main`
- Pages deploys from `main`
- Simpler workflow

**Trade-offs**:
- No code review gate
- Direct pushes can break production
- Collector commits create noise

**Status**: ✅ Implemented

**Note**: For external contributors, PRs recommended but not enforced.

---

## ADR-019: CNAME File Reserved for Future Custom Domain

**Date**: 2026-11

**Decision**: Keep empty `CNAME` file in repo root for future `status.athmetry.com`.

**Rationale**:
- Prevents accidental domain configuration
- Documents intent
- Ready when domain purchased and DNS configured

**Trade-offs**:
- Empty file in repo (minor)

**Status**: ✅ Implemented

---

## ADR-020: Schema Version in status.json

**Date**: 2026-11

**Decision**: Include `schemaVersion: 2` in `status.json`.

**Rationale**:
- Enables future breaking changes with detection
- Frontend can validate/handle versions
- Standard practice for data contracts

**Trade-offs**:
- Must remember to bump on breaking changes

**Status**: ✅ Implemented

---

## Summary Table

| ID | Decision | Status |
|----|----------|--------|
| ADR-001 | Static site, no backend | ✅ |
| ADR-002 | Collector as GitHub Actions workflow | ✅ |
| ADR-003 | Fine-grained PAT for auth | ✅ |
| ADR-004 | Collector commits JSON to repo | ✅ |
| ADR-005 | Vanilla JS ES modules, no build | ✅ |
| ADR-006 | CSS custom properties for theming | ✅ |
| ADR-007 | Inline theme script (no flash) | ✅ |
| ADR-008 | Cache-busting via timestamp | ✅ |
| ADR-009 | Auto-refresh 60s (polling) | ✅ |
| ADR-010 | Manual refresh = fetch only | ✅ |
| ADR-011 | Stale threshold 10min ≠ collector 5min | ✅ |
| ADR-012 | Three-area header with margin-left: auto | ✅ |
| ADR-013 | Icon-only theme toggle (36×36px) | ✅ |
| ADR-014 | Prominent refresh button | ✅ |
| ADR-015 | Client-side IP lookup (ipwho.is) | ✅ |
| ADR-016 | Pages deployment via Actions | ✅ |
| ADR-017 | No automated tests | ✅ |
| ADR-018 | Single main branch | ✅ |
| ADR-019 | CNAME reserved for custom domain | ✅ |
| ADR-020 | Schema version in JSON | ✅ |