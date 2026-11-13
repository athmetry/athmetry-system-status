# Troubleshooting Guide

Comprehensive troubleshooting reference for all components of the Athmetry System Status system.

---

## Quick Diagnosis

| Symptom | Go To Section |
|---------|---------------|
| Dashboard won't load | [Frontend: Page Load](#frontend-page-load) |
| "Unable to load status data" | [Frontend: Data Fetch](#frontend-data-fetch) |
| Theme toggle broken | [Frontend: Theme](#frontend-theme) |
| Horizontal scroll on mobile | [Frontend: Responsive](#frontend-responsive) |
| Manual refresh hangs | [Frontend: Manual Refresh](#frontend-manual-refresh) |
| Auto-refresh not working | [Frontend: Auto-Refresh](#frontend-auto-refresh) |
| Pipeline detail / GitHub dialog broken | [Frontend: Pipeline Detail](#frontend-pipeline-detail) |
| Collector workflow failing | [Collector: Workflow](#collector-workflow) |
| Collector runs but no data | [Collector: No Data](#collector-no-data) |
| Status shows "Unknown" | [Collector: Unknown Status](#collector-unknown-status) |
| Pages deploy failing | [Deploy: Pages](#deploy-pages) |
| Site not updating after push | [Deploy: Not Updating](#deploy-not-updating) |
| Stale data warning | [Data: Stale](#data-stale) |
| JSON validation fails | [Data: JSON](#data-json) |

---

## Frontend Troubleshooting

### Page Load

**Symptom**: Blank page, 404, or partial load.

| Check | Action |
|-------|--------|
| `index.html` exists? | `ls index.html` |
| CSS loads? | Network tab → `css/style.css` → 200 OK |
| JS loads? | Network tab → `js/app.js` → 200 OK |
| Console errors? | F12 → Console → Red errors |
| Local server? | `python3 -m http.server 8000` from repo root |

**Common Fixes**:
- Serve from repo root (not subdirectory)
- Check file paths in `index.html` are relative (`css/style.css`, `js/app.js`)
- Ensure `type="module"` on script tag

### Data Fetch

**Symptom**: Overall status shows "Error", detail reads "Unable to load status data...", and all three repository cards show "Error loading data" with counts at `0`.

| Check | Action |
|-------|--------|
| `status.json` exists? | Network tab → `data/status.json?t=...` → 200 OK |
| JSON valid? | `jq . data/status.json` (local) or check Network response |
| Schema/data contract? | `node scripts/validate-status-json.js`; frontend rejects invalid schema v2 data |
| CORS? | Same origin — should not happen |
| Cache? | Hard reload (Ctrl+Shift+R); manual refresh uses cache-busting |

**Debug Console**:
```javascript
// Check API status
statusApi.getLastData()
statusApi.getError()
statusApi.isStale()

// Force refresh
renderDashboard()
```

**Common Fixes**:
- Run collector workflow (Actions → Collect System Status → Run workflow)
- Wait for Pages deploy (2-5 min after collector commit)
- Fix JSON syntax if corrupted

### Theme

**Symptom**: Theme not toggling, wrong colors, flash on load.

| Check | Action |
|-------|--------|
| `data-theme` on `<html>`? | DevTools → `<html data-theme="dark">` |
| localStorage set? | `localStorage.getItem("athmetry-theme")` |
| Inline script runs? | Console → no errors in `<head>` script |
| CSS variables defined? | DevTools → `:root` → check `--bg-primary` etc. |
| Dark mode overrides? | DevTools → `[data-theme="dark"]` → check overrides |

**Common Fixes**:
- Clear localStorage: `localStorage.removeItem("athmetry-theme")`
- Check CSS syntax (missing brace breaks all subsequent rules)
- Ensure `[data-theme="dark"]` block exists in `style.css`
- Inline theme script must be in `<head>` before CSS

### Responsive

**Symptom**: Horizontal scroll, content cut off, overlapping elements.

| Check | Action |
|-------|--------|
| `document.body.scrollWidth > window.innerWidth` | Console → should be false |
| Viewport meta tag? | `<meta name="viewport" content="width=device-width, initial-scale=1.0">` |
| Flex items have `min-width: 0`? | DevTools → `.header-actions` → check |
| Long pipeline text wrapping? | `.pipeline-name`, `.pipeline-meta` → check overflow |

**Common Fixes**:
- Add `min-width: 0` to flex children that should shrink
- Use `word-break: break-all` for long text (SHAs, URLs)
- Check media query breakpoints match design
- Test at: 320, 375, 430, 768, 1024, 1440px

### Manual Refresh

**Symptom**: Spinner hangs, times out, or no feedback.

| Check | Action |
|-------|--------|
| Button disabled during load? | `refreshBtn.disabled` should be true |
| Spinner animating? | `.refresh-btn.refreshing .refresh-icon` → `animation: spin` |
| Status message shows? | `#refresh-status` → "Checking latest published status..." |
| Network request fires? | Network tab → `status.json?t=...` |
| Timeout (10s)? | `REFRESH_TIMEOUT_MS` in `app.js` |

**Common Fixes**:
- Increase `REFRESH_TIMEOUT_MS` if Pages slow
- Check `handleManualRefresh` error handling
- Ensure `setRefreshState(false)` called in finally/catch

### Auto-Refresh

**Symptom**: Data never updates automatically.

| Check | Action |
|-------|--------|
| Timer running? | `refreshTimer` in console → should be integer |
| Interval 60s? | `REFRESH_INTERVAL_MS = 60000` in `app.js` |
| Errors in console? | `renderDashboard` errors stop timer? No — caught |
| Background tab? | Browsers throttle timers in background |

**Debug**:
```javascript
// Check timer
refreshTimer

// Manual tick
renderDashboard()

// Restart timer
clearInterval(refreshTimer)
refreshTimer = setInterval(() => renderDashboard(), 60000)
```

### Pipeline Detail

**Symptom**: Detail dialog doesn't open, shows wrong data, or the GitHub button goes to the wrong URL.

| Check | Action |
|-------|--------|
| Dialog in HTML? | `<dialog id="pipeline-detail-dialog">` |
| Row has details button? | `.pipeline-row` → `.pipeline-view-btn` |
| Repo mapping? | `REPO_KEYS` in `dashboard.js`: `backend`, `system-status`, `frontend` |
| GitHub confirmation dialog? | `<dialog id="github-actions-dialog">` |
| URL source? | `workflow.latestRun.runUrl` from `status.json` |

**Common Fixes**:
- Confirm `repo.name` matches a key in `REPO_KEYS`
- Confirm the workflow entry has a non-null `latestRun` (no run yet → button disabled/absent)
- Check `showPipelineDetail()` / `showGitHubConfirmation()` call `showModal()`
- Escape key and backdrop click close both dialogs

---

## Collector Troubleshooting

### Workflow

**Symptom**: Collect System Status workflow fails.

| Step | Common Errors | Fix |
|------|---------------|-----|
| Checkout | `Permission denied` | PAT needs `contents: write` on this repo |
| Configure Git | (rarely fails) | — |
| Collect status | `ATHMETRY_GITHUB_TOKEN not set` | Add secret to repo settings |
| Collect status | `Failed to fetch workflow runs` | PAT needs read on backend/frontend/system-status |
| Collect status | `gh: command not found` | Use `ubuntu-latest` runner |
| Collect status | `jq: command not found` | Use `ubuntu-latest` runner |
| Commit/Push | `Permission denied` | Use `GITHUB_TOKEN` for push (built-in) |
| Commit/Push | `No changes to commit` | Normal — data unchanged |

**Debug Workflow**:
1. Actions → Collect System Status → Failed run
2. Expand "Collect status data" step
3. Look for `echo` output from script
4. Re-run with "Enable debug logging" if needed

### No Data

**Symptom**: Collector succeeds but `status.json` not updated / empty.

| Check | Action |
|-------|--------|
| `cmp -s` skipped commit? | Logs: "Status data unchanged; skipping commit" |
| API returns no runs? | Check `total_count` in logs |
| Wrong branch? | `BRANCH` variable in script |
| Wrong repos? | `MONITORED_REPOS` array in script |

**Debug Locally**:
```bash
export ATHMETRY_GITHUB_TOKEN="your_pat"
./.github/scripts/collect-status.sh
# Check data/status.json
cat data/status.json | jq .
```

### Unknown Status

**Symptom**: Repo shows grey "Unknown" pill.

| Cause | Fix |
|-------|-----|
| No workflow runs on branch | Add workflow to monitored repo on `main` |
| PAT lacks read access | Update PAT: Actions: Read, Contents: Read on all monitored repos |
| Repo name mismatch | `MONITORED_REPOS` format: `"name owner repo"` |
| API error in collector | Check collector logs for that repo's error field |

**Status Derivation** (collector):
```bash
# collect-status.sh
# GitHub status + conclusion → effectiveStatus
# completed + success = success
# completed + failure/action_required/timed_out = failure
# completed + cancelled = cancelled
# completed + skipped = skipped
# in_progress = running
# queued = queued
# else = unknown
```
Repository `overallStatus` is derived from its workflows: any failure → failure;
otherwise any running/queued → running; otherwise any success → success; else
unknown.

---

## Deploy Troubleshooting

### Pages

**Symptom**: Deploy to GitHub Pages workflow fails.

| Step | Error | Fix |
|------|-------|-----|
| Gate | `did not succeed` | Triggering run failed/cancelled — fix it, the next success deploys |
| Gate | `unvalidated changes` | Wait for Security Scan to pass on `main` |
| Gate | `already deployed` | Duplicate `workflow_run` for the same SHA — no action needed |
| Verify | revision mismatch | Re-run; checkout did not resolve the validated SHA |
| Upload artifact | `File size too large` | Repo < 1 GB (ok) |
| Deploy | `Environment not found` | First run — re-run creates it |
| Deploy | `Permission denied` | Check job-level `pages: write`, `id-token: write` |

### Not Updating

**Symptom**: Pushed to `main` but live site shows old version.

| Check | Action |
|-------|--------|
| Deploy workflow ran? | Actions → Deploy to GitHub Pages → Recent runs |
| Gate decision? | Open the run → "Deployment gate" step summary |
| Deploy succeeded? | Green checkmark |
| Deployment URL correct? | Click URL in workflow output |
| Browser cache? | Hard reload (Ctrl+Shift+R) |
| CDN propagation? | Wait 1-2 minutes |
| Collector commit deployed? | Collector commits with `GITHUB_TOKEN`; deployment is triggered by `workflow_run`, and allowed only for `data/status.json`-only drift |

**Force Redeploy**:

`deploy-pages.yml` has no `workflow_dispatch` trigger (so the gate cannot be
bypassed). To redeploy, re-run the last successful deploy run:

```
# Actions → Deploy to GitHub Pages → select the last successful run → Re-run jobs
```

If the gate blocks the re-run because the revision was already deployed, push a
real change through Security Scan, or temporarily rely on the next collector
completion (it deploys the new `data/status.json` revision).

---

## Data Troubleshooting

### Stale

**Symptom**: Yellow "Stale data: X minutes ago" banner.

| Cause | Fix |
|-------|-----|
| Collector not running | Check Actions → Collect System Status |
| Collector failing | Fix collector (see above) |
| Deploy not running | Check Actions → Deploy to GitHub Pages |
| `collectedAt` wrong | Collector uses `date -u` (UTC) — should match |

**Threshold**: 10 minutes (frontend) vs 5 minutes (collector) — by design.

### JSON

**Symptom**: "Status data could not be parsed" or frontend errors.

| Check | Action |
|-------|--------|
| Valid JSON? | `jq . data/status.json > /dev/null && echo "Valid"` |
| Schema version? | `jq .schemaVersion data/status.json` (must be `2`) |
| Data contract? | `node scripts/validate-status-json.js` |
| Required fields? | `jq '.repositories[0] | keys' data/status.json` |
| Truncated file? | Check file ends with `}` |

**Fix Corrupted JSON**:
```bash
# Option 1: Re-run collector
# Actions → Collect System Status → Run workflow

# Option 2: Manual fix
git checkout HEAD -- data/status.json  # Restore last committed
# Or manually edit and commit
```

---

## Common Commands Reference

```bash
# Local server
python3 -m http.server 8000

# Validate JSON
jq . data/status.json > /dev/null && echo "Valid"

# Run collector locally
export ATHMETRY_GITHUB_TOKEN="pat"
./.github/scripts/collect-status.sh

# Check git status
git status

# View recent commits
git log --oneline -10

# Force refresh (browser console)
renderDashboard()

# Check timer (browser console)
refreshTimer

# Check theme (browser console)
document.documentElement.getAttribute("data-theme")
localStorage.getItem("athmetry-theme")

# Check horizontal overflow (browser console)
document.body.scrollWidth, window.innerWidth
```

---

## Escalation Path

1. **Self-service**: This guide + logs
2. **Team**: Slack #athmetry-status (or equivalent)
3. **GitHub Support**: For Actions/Pages platform issues
4. **Repository Admin**: For secret/permission changes