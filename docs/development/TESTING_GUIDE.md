# Testing Guide

## Current State

Testing has two layers:

1. **Local static validation** — run before any push. Validates JavaScript
   syntax, JSON, the `data/status.json` data contract, HTML structure, CSS
   syntax, required files, and referenced brand assets. This is not a CI
   workflow: the repository intentionally runs only three workflows
   (collector, deploy, security).
2. **Manual browser regression** — theme, refresh, rendering, responsive
   layout, dialogs, footer, and alerts must still be verified in a real browser.

No committed browser test suite exists. `@playwright/test` is installed as a
development dependency and may be used for scripted local checks, but tests
must run against a local server and must not modify production data.

This document defines the validation and manual testing procedures to verify
correctness before any release.

---

## Pre-Release Testing Checklist

Run all checks before considering a change ready for review.

### 1. Automated Static Validation

```bash
# JavaScript syntax
for f in js/*.js scripts/*.js; do node --check "$f"; done

# JSON syntax
jq empty data/status.json package.json

# Status data contract (schema v2)
node scripts/validate-status-json.js

# HTML structure (same rules as CI)
npx --yes html-validate@11.21.1 \
  --rule void-style:off \
  --rule no-implicit-button-type:off \
  --rule no-trailing-whitespace:off \
  index.html

# CSS syntax
npx --yes csstree-validator@4.0.1 css/style.css
```

All commands must exit `0`. The validator may emit a stale-data warning; a
warning is not a schema failure.

### 2. Local Server Load Test

```bash
python3 -m http.server 8000
# Open http://localhost:8000/index.html
```

**Verify:**
- [ ] Page loads without console errors (F12 → Console)
- [ ] No 404s in Network tab (CSS, JS, fonts, images, `package.json`)
- [ ] Theme applied correctly (check `data-theme` on `<html>`)
- [ ] No horizontal overflow (`document.body.scrollWidth === window.innerWidth`)

### 3. Theme System Tests

| Test | Steps | Expected |
|------|-------|----------|
| Light mode default | Clear localStorage, reload | Light theme, moon icon visible |
| Dark mode toggle | Click theme toggle | Dark theme, sun icon visible, localStorage updated |
| Persistence | Toggle dark, reload | Dark theme persists |
| System preference ignored | Set OS dark mode, clear localStorage | Still light (by design) |
| Logo variants | Toggle theme | Light logo in light mode, dark logo in dark mode |
| Footer logos | Toggle theme | Light/dark footer logos swap correctly |
| No flash | Reload in dark mode | No white flash before paint |

### 4. Data Loading & Rendering

| Test | Steps | Expected |
|------|-------|----------|
| Initial render | Load page | Overall status and **3** repository cards populate |
| Data structure | Check Network → status.json | Valid JSON, `schemaVersion: 2`, `repositories.length === 3` |
| Repository order | Observe grid | Backend left; System Status top-right; Frontend bottom-right (desktop) |
| Status pills | Observe colors | Correct color per status (green/red/blue/grey) |
| Pipeline count | Check card header | `"N pipelines · main branch"`, N equals rendered rows |
| Pipeline rows | Count rows per card | Each active workflow has one row; no clipping |
| Icon consistency | Observe each card | Same monitor icon on all three cards |
| Product tags | Observe each card | `ATHMETRY-WEB` (backend/frontend), `ATHMETRY-SYSTEM-STATUS` (system status) |
| Commit info | Observe pipeline rows | Run number, relative time, duration |
| Last collected | Check header | Shows `collectedAt` relative time + absolute time |
| Last updated | Load page | Header shows "Last updated: just now" (then "a few seconds ago") |
| Last successful build | Check overall card | Shows the most recent successful workflow completion |
| Empty repository | Fixture with `workflows: []` | Card shows "No active pipelines found" |
| Initial fetch failure | Block `data/status.json` | Overall "Error"; all three cards show "Error loading data"; counts `0` |
| Invalid schema | Fixture failing schema v2 validation | Error state (no crash, no stale markup) |

### 5. Pipeline Detail Dialog & GitHub Navigation

| Test | Steps | Expected |
|------|-------|----------|
| Open dialog | Click any pipeline row / details button | Dialog opens with workflow details |
| Run metadata | Inspect dialog | Run number, commit SHA, author, timestamps, duration |
| Jobs table | Inspect dialog | Jobs from `latestRun.jobs` listed; empty state otherwise |
| History | Inspect dialog | Up to 5 runs from `workflow.history` |
| GitHub confirmation | Click "View on GitHub" | Confirmation dialog opens with the latest run URL |
| Cancel | Click "Cancel" | Returns to detail dialog, no navigation |
| Escape | Press Escape | Dialog closes, body scroll unlocks |
| Backdrop | Click outside dialog | Dialog closes |

### 6. Auto-Refresh (60 Second Interval)

| Test | Steps | Expected |
|------|-------|----------|
| Interval fires | Wait 65s, watch Network tab | New `status.json?t=...` request |
| Data updates | If collector ran | New data rendered silently |
| No errors | Check Console | No errors during refresh |
| Manual refresh precedence | Click Refresh during interval | No overlapping refresh requests |
| Timer cleanup | Reload page | Single timer; cleared on `beforeunload` |

### 7. Manual Refresh Button

| Test | Steps | Expected |
|------|-------|----------|
| Click refresh | Click "Refresh" button | Button disabled, spinner animates, label "Refreshing..." |
| Loading overlay | During fetch | Overlay visible for at least 1 second |
| Success message | Wait for fetch | "Status updated successfully" |
| Error message | Disconnect network, click | "Refresh failed. Showing last available data." |
| Timeout message | Block/delay the request >10s | "Refresh timed out. Showing last available data." |
| Data preserved | On error | Dashboard still shows previous data |
| Last updated | After success | Header shows "Last updated: just now" |
| Keyboard accessible | Tab to button, Enter | Works without mouse |

### 8. Responsive Design Tests

Test these six viewport widths in **both** themes (12 combinations):

| Width | Label | Key Checks |
|-------|-------|------------|
| 320px | Small mobile | No horizontal scroll, header stacks, single-column repo grid |
| 375px | iPhone SE | Touch targets ≥44px, single column |
| 430px | Large mobile | Header wraps, no overflow |
| 768px | Tablet | Two-column repo grid begins, backend left |
| 1024px | Desktop | Full layout, comfortable spacing |
| 1440px | Large desktop | Max-width container centered |

**Critical:** Zero horizontal overflow at every width/theme combination.

### 9. Footer, Visitor Info & Release Version

| Test | Steps | Expected |
|------|-------|----------|
| Visitor IP | Load page | Shows IP or "Unavailable" |
| Location | Load page | Shows city/region/country or "Unavailable" |
| IP blocked | Block `ipwho.is` in DevTools | Footer shows "Unavailable", dashboard unaffected |
| Release version | Load page | `Release v1.0` derived from `package.json` |
| Version fallback | Block `package.json` | Footer keeps `Release v—`, no console errors |
| No hardcoded version | Search `index.html`, `js/` | No literal release version |
| Footer links | Click athmetry.com | Opens in new tab, `rel="noopener noreferrer"` |
| Copyright | Check text | Current year |
| Flag | Visual | Indian flag SVG renders |

### 10. Alert System

| Test | Steps | Expected |
|------|-------|----------|
| Stale data | Use a fixture with `collectedAt` >10 min ago | Warning alert "Data is X minutes old..." |
| Repo error | Use a fixture with `repo.error` set | Error alert naming the repository |
| No alerts | Normal data | Alert card hidden (`display: none`) |
| Auto-clear | Re-render with clean fixture | Alert disappears on next render |
| Multiple errors | Fixture with several `repo.error` values | One alert item per error |

### 11. Print Styles

| Test | Steps | Expected |
|------|-------|----------|
| Print preview | Ctrl+P / Cmd+P | Header hidden, buttons hidden, dialogs hidden, footer visitor hidden, cards visible with borders |

### 12. Accessibility

| Test | Steps | Expected |
|------|-------|----------|
| Keyboard nav | Tab through page | All interactive elements reachable, focus visible |
| Screen reader | NVDA/VoiceOver | ARIA labels announced, live regions work |
| Color contrast | Light/dark themes | WCAG AA minimum (4.5:1 text, 3:1 UI) |
| Reduced motion | OS setting "Reduce motion" | Spinner stops animating, opacity reduced |

### 13. JSON & Collector Validation (Isolated)

The collector writes `data/status.json` directly. When testing it locally:

```bash
# 1. Preserve current data
cp data/status.json /tmp/status.before.json

# 2. Provide a token with read access (never commit it)
export ATHMETRY_GITHUB_TOKEN="..."

# 3. Run the collector
./.github/scripts/collect-status.sh

# 4. Validate output
jq . data/status.json > /dev/null
node scripts/validate-status-json.js

# 5. Restore production data
cp /tmp/status.before.json data/status.json
```

Rules:
- Never commit or push collector output during testing.
- Never run the collector in a way that triggers a workflow dispatch.
- To test without GitHub access, exercise the script with fixture payloads and a
  mocked `gh` command; the script must not reach GitHub or touch git.
- Verify: `schemaVersion: 2`, exactly 3 repositories, only active workflows,
  all three System Status workflows present (`collect-status.yml`,
  `deploy-pages.yml`, `security-scan.yml`), the collector reporting its most
  recent **completed** run, history ≤5.

### 14. GitHub Actions Workflow Validation (No Dispatch)

Validate locally; do not dispatch workflows to test them.

```bash
# YAML parse
ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' \
  .github/workflows/*.yml .github/zizmor.yml

# If available
actionlint
zizmor --config .github/zizmor.yml .github/workflows/
```

- Confirm all three workflows parse: `collect-status.yml`, `deploy-pages.yml`,
  `security-scan.yml`.
- Confirm third-party action references are pinned appropriately and
  `.github/zizmor.yml` policy is consistent.
- All workflows declare `permissions: contents: read` at the workflow level;
  `deploy-pages.yml` grants `pages: write` and `id-token: write` only to its
  deploy job.
- Confirm `security-scan.yml` triggers on pull requests, pushes to `main`,
  weekly schedule, and manual dispatch.
- Confirm `deploy-pages.yml` triggers only on `workflow_run` completion (no
  `push` or `workflow_dispatch` trigger) and that its gate blocks PRs,
  failed/cancelled runs, unvalidated revisions and duplicate deploys.

---

## Regression Testing for Specific Changes

### Header/UI Changes

- Full responsive test (6 widths × 2 themes)
- Theme toggle visibility in both themes
- Refresh button states (idle, loading, success, error)
- Last-updated positioning (desktop right, mobile row 2)

### Theme Changes

- All 6 widths × 2 themes
- Logo swap (header + footer)
- Status pill colors (all statuses)
- Alert banner colors
- Focus ring visibility

### Dashboard/Rendering Changes

- Three repository cards render in the expected layout
- Pipeline counts and branch text are dynamic
- Pipeline detail dialog opens for every workflow
- GitHub confirmation uses `latestRun.runUrl`
- HTML escaping: workflow name, path, commit message, author, and error text
  containing `<`, `>`, `&`, `"`, `'` render as literal text, never as markup

### Collector Changes

- Run locally in isolation (Section 13)
- Verify `data/status.json` structure and schema
- Verify all three System Status workflows appear, including the collector's
  most recent completed run
- Verify history depth (5 entries)
- Check error handling (missing token, API failure)

### Data Schema Changes

- Update `schemaVersion` if breaking
- Update `scripts/validate-status-json.js` (and the workflow fixtures used by
  the local collector isolation test)
- Verify frontend handles missing fields gracefully
- Test with all repos healthy / one error / all errors / empty workflows

---

## Test Documentation

Report results using the status vocabulary `PASS`, `FAIL`, `BLOCKED`, or
`NOT RUN`. Do not claim live GitHub execution without evidence.

```
## Tests Executed

| Test Area | Viewports | Themes | Result | Evidence |
|-----------|-----------|--------|--------|----------|
| Static validation | N/A | N/A | PASS | Commands exited 0 |
| Header/UI | 320, 375, 430, 768, 1024, 1440 | Light, Dark | PASS | Screenshots |
| Theme toggle | All 6 | Light, Dark | PASS | localStorage + data-theme |
| Manual refresh | 1440 | Light | PASS | Success/error/timeout |
| Auto-refresh | 1440 | Light | PASS | 60s network request |
| Pipeline dialog | 1440 | Light | PASS | Open/close/URL |
| Collector | Local/isolated | N/A | PASS | Fixture output |
| Workflow validation | N/A | N/A | PASS | actionlint/zizmor |

## Known Limitations
- No committed browser test suite
- IP lookup depends on external service
- Stale threshold (10 min) > collector schedule (5 min) by design
- CI/security workflows have not yet run on GitHub until pushed
```
