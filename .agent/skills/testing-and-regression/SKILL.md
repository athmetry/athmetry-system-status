# Skill: Testing and Regression

## Purpose

Execute comprehensive manual testing for Athmetry System Status changes to prevent regressions.

## Test Philosophy

- **Static validation is local** (no CI workflow); browser behavior is tested manually
- **Test evidence required** — never claim "passes" without execution
- **Test at boundaries** — 6 release viewport widths × 2 themes
- **Test error paths** — not just happy path

---

## Test Matrix

### Viewport Widths (Chrome DevTools Device Toolbar)

| Width | Device Category | Test Both Themes |
|-------|-----------------|------------------|
| 320px | Small mobile | ✅ |
| 375px | iPhone SE | ✅ |
| 430px | Large mobile | ✅ |
| 768px | Tablet | ✅ |
| 1024px | Desktop | ✅ |
| 1440px | Large desktop | ✅ |

### Theme Testing

- **Light**: Default, system light, forced light
- **Dark**: Manual toggle, persisted, forced dark

---

## Test Procedures

### 1. Theme System

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| Default light | Clear localStorage, reload | Light theme, moon icon |
| Toggle to dark | Click theme toggle | Dark theme, sun icon, localStorage set |
| Persistence | Toggle dark, reload | Dark theme persists |
| No flash | Reload in dark mode | No white flash before paint |
| Logo swap | Toggle theme | Light/dark logos swap correctly |
| Footer logos | Toggle theme | Light/dark footer logos swap |

### 2. Data Loading & Rendering

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| Initial render | Load page | Overall status, 3 repo cards, pipelines |
| Repo order | Observe grid | Backend left; System Status top-right; Frontend bottom-right |
| Status pills | Observe colors | Correct color per status |
| Pipeline rows | Count rows per card | N rows match dynamic pipeline count |
| Pipeline detail | Click a row | Dialog opens with run metadata, jobs, ≤5 history entries |
| GitHub link | Click "View on GitHub" | Confirmation dialog; correct `latestRun.runUrl` |
| Last collected | Check header | Relative + absolute `collectedAt` |
| Monitored branch | Meta row | Shows "main" |
| Last successful build | Overall card | Most recent successful completion |

### 3. Auto-Refresh (60s)

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| Interval fires | Wait 65s, watch Network | New `status.json?t=...` request |
| Data updates | If collector ran | New data rendered silently |
| No errors | Console | No errors during refresh |
| Timer cleanup | Reload page | Single timer only |

### 4. Manual Refresh

| Test | Steps | Pass Criteria |
|------|-------|---------------|
| Click refresh | Click "Refresh" button | Disabled, spinner, "Refreshing..." |
| Success toast | Wait for fetch | Green "Status updated successfully" |
| Error toast | Disconnect network | Red "Refresh failed. Showing last available data." |
| Timeout toast | Simulate slow | Red "Refresh timed out. Showing last available data." |
| Loading state | During fetch | "Checking latest published status..." |
| Data preserved | On error | Dashboard shows previous data |
| Keyboard accessible | Tab → Enter | Works without mouse |

### 5. Responsive (All 6 Widths × 2 Themes)

| Test | Pass Criteria |
|------|---------------|
| No horizontal overflow | `document.body.scrollWidth === window.innerWidth` |
| Header layout | 3-area desktop, 2-row mobile (≤429px) |
| Repo grid | Backend left, right column stacked on desktop; 1-col mobile |
| Touch targets | ≥44px buttons, tabs |
| Footer | Stacked mobile, horizontal desktop |
| Last updated | Right desktop, row 2 mobile |

### 6. Footer & Visitor Info

| Test | Pass Criteria |
|------|---------------|
| Visitor IP | Shows IP or "Unavailable" |
| Location | Shows city/region/country or "Unavailable" |
| Footer links | athmetry.com opens new tab, `rel="noopener noreferrer"` |
| Copyright | Current year (2026) |
| Flag | Indian flag SVG renders |

### 7. Alerts

| Test | Pass Criteria |
|------|---------------|
| Stale data | >10 min → yellow warning |
| Repo error | `repo.error` → red error |
| No alerts | Normal data → hidden |
| Auto-clear | Fix condition → disappears |

### 8. Print Styles

| Test | Pass Criteria |
|------|---------------|
| Print preview (Ctrl+P) | Header, buttons, dialog, footer visitor hidden; cards visible |

### 9. Accessibility

| Test | Pass Criteria |
|------|---------------|
| Keyboard nav | Tab through all interactive, focus visible |
| Screen reader | ARIA labels announced, live regions work |
| Color contrast | WCAG AA (4.5:1 text, 3:1 UI) |
| Reduced motion | Spinner stops animating |

### 10. Data & Collector

```bash
# JSON + schema validation
jq . data/status.json > /dev/null && echo "Valid"
node scripts/validate-status-json.js

# Collector isolated test — back up and restore production data
cp data/status.json /tmp/status.before.json
./.github/scripts/collect-status.sh
node scripts/validate-status-json.js
cp /tmp/status.before.json data/status.json
```

### 11. Workflow Validation

```bash
# Local YAML parse/lint only — do not push or dispatch
python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml
actionlint   # if installed
zizmor .github/workflows/   # if installed
```

---

## Regression Testing by Change Type

### Header/UI Changes
- Full responsive test (6 widths × 2 themes)
- Theme toggle visibility both themes
- Refresh button states (idle, loading, success, error)
- Last-updated positioning

### Theme Changes
- All 6 widths × 2 themes
- Logo swap (header + footer)
- Status pill colors (all statuses)
- Alert banner colors
- Focus ring visibility

### Collector Changes
- Isolated run with `gh` CLI (restore production data afterward)
- `data/status.json` structure and schema contract
- New repo renders only after `REPO_KEYS` and card markup exist
- History depth (5 entries per workflow)
- Error handling

### Data Schema Changes
- `schemaVersion` bump if breaking
- Update `scripts/validate-status-json.js`
- Frontend handles missing fields gracefully
- Test: healthy data / one error / all errors / empty workflows

---

## Test Report Template

```markdown
## Tests Executed

| Test Area | Viewports | Themes | Result | Evidence |
|-----------|-----------|--------|--------|----------|
| Static validation | N/A | N/A | ✅ | Commands exited 0 |
| Theme Toggle | 320, 375, 430, 768, 1024, 1440 | Light, Dark | ✅ | No flash, persists |
| Manual Refresh | 1440 | Light | ✅ | Success/error/timeout verified |
| Auto-refresh | 1440 | Light | ✅ | 60s interval in Network tab |
| Pipeline dialog | 1440 | Both | ✅ | Jobs, history, URL |
| Responsive | All 6 | Both | ✅ | Zero overflow |
| Collector | Isolated | N/A | ✅ | status.json restored |

## Known Limitations
- No committed browser test suite
- IP lookup depends on external service
- Stale threshold (10min) > collector schedule (5min) by design
```

---

## Anti-Patterns

- ❌ "Tests pass" without running them
- ❌ Testing only desktop/light theme
- ❌ Skipping error paths (timeout, network fail)
- ❌ Not checking horizontal overflow
- ❌ Not testing print styles
- ❌ Not verifying collector + deploy workflow chain