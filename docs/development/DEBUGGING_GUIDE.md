# Debugging Guide

## Common Issues and Solutions

### Frontend Issues

#### Dashboard Shows "Unable to load status data"

**Symptoms**: Overall status shows "Unknown", alert banner visible with error message.

**Causes & Fixes**:
| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| `data/status.json` missing | Network tab: 404 on status.json | Run collector workflow; wait for Pages deploy |
| JSON parse error | Console: "Status data could not be parsed" | Check JSON syntax: `jq . data/status.json` |
| CORS/network error | Console: "Unable to reach status data endpoint" | Check GitHub Pages status; try manual refresh |
| Stale browser cache | Data looks old | Manual refresh uses cache-busting; hard reload (Ctrl+Shift+R) |

#### Theme Toggle Not Working

**Symptoms**: Clicking theme button does nothing, or icon doesn't change.

**Causes & Fixes**:
| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| localStorage blocked | Console: "localStorage unavailable" | Theme still works for session; check browser privacy settings |
| CSS variables not updating | DevTools: `data-theme` changes but colors don't | Check `css/style.css` has `[data-theme="dark"]` overrides |
| Icon not swapping | Moon/sun both visible or both hidden | Check `.theme-toggle .icon-moon/sun` CSS rules |
| Inline script error | Console error in `<head>` script | Fix inline script syntax; must run before CSS loads |

#### Horizontal Overflow on Mobile

**Symptoms**: Horizontal scroll bar appears, content cut off.

**Diagnosis**:
```javascript
// In console:
document.body.scrollWidth > window.innerWidth  // true = overflow
```

**Common Causes**:
- Element with fixed width > viewport
- `flex-shrink: 0` on element that should shrink
- Long unbreakable text (commit SHA, URLs) — use `word-break: break-all`
- Table minimum width — ensure `.pipeline-row` text wraps with `word-break`/`overflow-wrap`

**Fix**: Check responsive CSS at relevant breakpoint; ensure `min-width: 0` on flex items.

#### Manual Refresh Hangs / Times Out

**Symptoms**: Spinner spins indefinitely, then "Refresh timed out".

**Causes & Fixes**:
| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| GitHub Pages slow | Network tab: request >10s | Increase `REFRESH_TIMEOUT_MS` in `app.js` (currently 10s) |
| Network offline | Console: "Failed to fetch" | Error toast appears; data preserved |
| CORS issue | Console: CORS error | GitHub Pages serves from same origin; should not happen |

#### Auto-Refresh Not Firing

**Symptoms**: Data never updates automatically.

**Diagnosis**:
```javascript
// In console:
refreshTimer  // Should show timer ID
// Or check Network tab for periodic status.json requests
```

**Causes & Fixes**:
| Cause | Fix |
|-------|-----|
| `renderDashboard` throws error | Check console; fix error; timer continues |
| Page in background | Browsers throttle timers in background tabs; normal |
| `refreshTimer` cleared | Check `beforeunload` handler; should only clear on unload |

#### Pipeline Detail Dialog Not Opening

**Symptoms**: Click a pipeline row or its details button — nothing happens.

**Causes & Fixes**:
| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| Dialog element missing | `document.getElementById("pipeline-detail-dialog")` returns null | Check `index.html` has dialog with correct ID |
| Details button missing | `document.querySelectorAll(".pipeline-view-btn")` empty | Check `createPipelineRow()` renders the button |
| Repo ID mapping broken | `REPO_KEYS[repo.name]` is undefined | Keys must be `backend`, `system-status`, `frontend` |
| No latest run | Workflow has `latestRun: null` | Button is unavailable until a run exists |

---

### Collector Issues

#### Collector Workflow Fails

**Symptoms**: GitHub Actions run shows red X.

**Diagnosis**: Check workflow run logs in Actions tab.

**Common Failures**:

| Step | Error | Cause | Fix |
|------|-------|-------|-----|
| Checkout | "Permission denied" | `ATHMETRY_GITHUB_TOKEN` lacks `contents: write` | Update PAT permissions |
| Collect | "ATHMETRY_GITHUB_TOKEN not set" | Secret missing or wrong name | Add `ATHMETRY_GITHUB_TOKEN` to repo secrets |
| Collect | "gh: command not found" | Runner image missing gh | Use `ubuntu-latest` (has gh pre-installed) |
| Collect | "jq: command not found" | Runner image missing jq | Use `ubuntu-latest` (has jq pre-installed) |
| Collect | "Failed to fetch workflow runs" | PAT lacks read access to backend/frontend/system-status | Update PAT repo permissions |
| Commit | "No changes to commit" | JSON unchanged | Normal — not an error |
| Push | "Permission denied" | `GITHUB_TOKEN` lacks push permission | Workflow has `contents: write`; should work |

#### Collector Runs But Data Not Updated

**Symptoms**: Workflow succeeds (green), but `data/status.json` unchanged.

**Causes & Fixes**:
| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| `cmp -s` detects no change | Logs: "Status data unchanged; skipping commit" | Normal if no new runs |
| API returns same data | Check `gh api` calls manually | Verify monitored repos have new runs |
| Wrong branch | `BRANCH` variable mismatch | Set `BRANCH` in workflow `env` or script |
| Repo name mismatch | `MONITORED_REPOS` array incorrect | Verify format: `"name owner repo"` |

#### Local Collector Test Fails

```bash
# Test API access
gh api "/repos/athmetry/athmetry-backend/actions/workflows" --jq '.total_count'

# Test with verbose
bash -x .github/scripts/collect-status.sh
```

**Common Issues**:
- `GH_TOKEN` not exported → `export GH_TOKEN="your_pat"`
- `gh` not authenticated → `gh auth login`
- Rate limited → Wait, or use authenticated requests

---

### Deployment Issues

#### GitHub Pages Not Updating

**Symptoms**: Pushed to `main`, but live site shows old version.

**Diagnosis**:
1. Check Actions tab → `deploy-pages.yml` ran?
2. Check deployment status → green checkmark?
3. Check Pages URL in deployment output
4. Hard reload browser (Ctrl+Shift+R)

**Causes & Fixes**:
| Cause | Fix |
|-------|-----|
| Pages source not "GitHub Actions" | Repo Settings → Pages → Source: GitHub Actions |
| Deploy workflow failed | Check Actions logs; fix error |
| Cache | Hard reload; wait 1-2 min for CDN |
| Wrong branch | Workflow triggers on `main` only |

#### Collector Commit Doesn't Trigger Pages Deploy

**Symptoms**: Collector commits `status.json`, but the site is not updated.

**Cause**: The collector commits with the built-in `GITHUB_TOKEN`. Pushes made
with `GITHUB_TOKEN` do **not** trigger `push`-based workflows (GitHub loop
prevention), so a `push`-triggered deployment would never see collector commits.

**Fix**: `deploy-pages.yml` is triggered by `workflow_run` completion of
Security Scan **or** Collect System Status, which does fire for `GITHUB_TOKEN`
pushes. The gate then allows the deploy only when the current `main` head is the
latest security-validated revision or differs from it only by `data/status.json`.

**Diagnose**:
1. Actions → Collect System Status → confirm the run succeeded.
2. Actions → Deploy to GitHub Pages → open the latest run and read the
   "Deployment gate" step summary for the decision and reason.
3. If the reason mentions unvalidated changes, wait for Security Scan to pass on
   `main`; the next completion will deploy.

---

### Data Issues

#### Status Shows "Unknown" for Repository

**Symptoms**: Repo card shows grey "Unknown" pill.

**Causes**:
| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| No workflow runs on branch | Collector: `total_count = 0` | Ensure repo has Actions enabled, runs on `main` |
| PAT lacks read access | Collector error set | Update PAT permissions |
| Branch name wrong | `BRANCH` variable | Set correct branch |
| Workflow file missing | Repo has no `.github/workflows/*.yml` | Add workflow to monitored repo |

#### Stale Data Warning Appears Prematurely

**Symptoms**: "Stale data: X minutes ago" but collector ran recently.

**Causes**:
| Cause | Fix |
|-------|-----|
| `collectedAt` timezone issue | Collector uses `date -u` (UTC); frontend parses as UTC — should match |
| Collector commit delayed | Pages deploy takes 1-3 min after commit |
| Frontend cache | Manual refresh uses cache-busting |

#### Pipeline History Empty

**Symptoms**: Pipeline detail dialog shows no history rows.

**Causes**:
| Cause | Fix |
|-------|-----|
| `workflow.history` empty | Collector uses `MAX_RUNS_PER_WORKFLOW=5` — ensure the workflow has runs on `main` |
| Latest run only | A new workflow legitimately has one run; history grows over time |
| JSON structure changed | Verify `workflows[].history` exists in `status.json` |

---

## Debugging Tools

### Browser DevTools

```javascript
// Console commands for debugging

// Check current theme
document.documentElement.getAttribute("data-theme")

// Check localStorage theme
localStorage.getItem("athmetry-theme")

// Check last fetched data
statusApi.getLastData()

// Check if data is stale
statusApi.isStale()

// Force refresh
renderDashboard()

// Check timer
refreshTimer

// Check horizontal overflow
document.body.scrollWidth, window.innerWidth

// Simulate stale data (edit JSON locally via override)
fetch("data/status.json?t=" + Date.now()).then(r => r.json()).then(d => {
  d.collectedAt = new Date(Date.now() - 15*60*1000).toISOString();
  console.log("Stale test:", d.collectedAt);
})
```

### Network Tab

- Filter: `status.json` — watch auto-refresh requests every 60s
- Check: Response status (200), size (~5 KB), timing
- Manual refresh: Look for same request with loading state

### GitHub Actions Logs

- **Collector**: Expand "Collect status data" step → see `gh api` calls, jq output
- **Deploy**: Expand "Deploy to GitHub Pages" → see Pages URL

### Collector Script Debugging

```bash
# Dry run: see what JSON would be generated
# (Script writes to temp file, compares, exits if unchanged)
# To see new content without writing:
COLLECTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
BRANCH=main \
ATHMETRY_GITHUB_TOKEN="$PAT" \
bash -x .github/scripts/collect-status.sh 2>&1 | head -100

# Test workflow discovery for one repo
gh api "/repos/athmetry/athmetry-backend/actions/workflows" --jq '.total_count'

# Test runs for one workflow
gh api "/repos/athmetry/athmetry-backend/actions/workflows/<workflow_id>/runs?branch=main&per_page=5" --jq '.workflow_runs[0] | {status, conclusion, run_number, head_sha}'
```

---

## Logging and Observability

### Current Logging

| Component | Logs |
|-----------|------|
| Frontend | `console.error` for fetch/render failures; `console.debug` for IP lookup |
| Collector | `echo` statements to stdout (visible in Actions logs) |
| Deploy | Actions workflow logs |

### Adding Debug Logs

```javascript
// Frontend: temporary debug
console.debug("[DEBUG] renderDashboard called", { repos: data.repositories.length });

// Collector: temporary debug
echo "DEBUG: runs_payload=$runs_payload" >&2
```

**Remember to remove before commit.**

---

## Emergency Procedures

### Live Site Completely Broken

1. **Revert last deploy**: `git revert HEAD` → push → Pages redeploys
2. **Or**: Disable Pages temporarily (Settings → Pages → Source: None)
3. **Communicate**: Notify team via Slack/email

### Collector Stuck Failing

1. Check Actions logs for error
2. Fix issue (PAT, API, script)
3. Manually trigger: Actions → Collect System Status → Run workflow
4. Verify `data/status.json` updated
5. Wait for Pages deploy

### Stuck in Dark Mode / Theme Issues

1. Clear localStorage: `localStorage.removeItem("athmetry-theme")`
2. Reload → defaults to light
3. If CSS broken: Check `css/style.css` syntax, `[data-theme="dark"]` block

---

## Useful Commands Reference

```bash
# Local server
python3 -m http.server 8000

# Validate JSON
jq . data/status.json > /dev/null && echo "Valid"

# Run collector locally
export GH_TOKEN="your_pat"
./.github/scripts/collect-status.sh

# Check git status
git status

# View recent commits
git log --oneline -10

# Check remote
git remote -v

# Hard reset local (discard uncommitted)
git reset --hard HEAD

# Check workflow syntax (manual - push to test branch)
git push origin test-branch
```