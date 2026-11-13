# Rollback Guide

This document describes procedures for rolling back deployments and recovering from failures.

---

## Rollback Scenarios

| Scenario | Procedure | Downtime |
|----------|-----------|----------|
| Bad code deployed | `git revert` + push | 2-5 min |
| Bad status data committed | Manual collector run or manual JSON fix | 3-7 min |
| Pages deployment broken | Disable Pages → fix → re-enable | Immediate |
| Collector stuck failing | Fix issue → manual trigger | 1-2 min |
| Complete site failure | Revert to known good commit | 2-5 min |

---

## Procedure 1: Rollback Code Changes (git revert)

**Use when**: A push to `main` introduced a bug in HTML/CSS/JS.

```bash
# 1. Identify bad commit
git log --oneline -10

# 2. Revert the commit (creates new commit undoing changes)
git revert <bad-commit-sha>

# 3. Push to main (Security Scan runs; deploy-pages.yml deploys on its success)
git push origin main

# 4. Verify deployment
# - Check Actions → Security Scan → success
# - Check Actions → Deploy to GitHub Pages → gate allowed + deploy succeeded
# - Visit https://athmetry.github.io/athmetry-system-status/
```

**Why revert over reset**: Preserves history, safer for shared branch, and flows through the normal security-gated deployment.

---

## Procedure 2: Rollback Code Changes (git reset — Emergency Only)

**Use when**: `git revert` not possible (merge conflicts) or need immediate rollback.

```bash
# 1. Identify last good commit
git log --oneline -10

# 2. Reset locally (DANGEROUS — rewrites history)
git reset --hard <good-commit-sha>

# 3. Force push (DANGEROUS — rewrites remote history)
git push --force origin main

# 4. Verify deployment
```

**Warning**: Force push rewrites history. Only use if:
- You are the only developer
- No one else has pulled the bad commits
- You understand the implications

---

## Procedure 3: Fix Bad Status Data

**Use when**: Collector committed incorrect `data/status.json` (wrong status, missing data, corruption).

### Option A: Trigger Collector Manually (Preferred)

```bash
# 1. Fix root cause if needed (PAT, script bug, etc.)
# 2. Manually run collector
# GitHub UI: Actions → Collect System Status → Run workflow
# Or locally:
export ATHMETRY_GITHUB_TOKEN="your_pat"
./.github/scripts/collect-status.sh
# (Local run won't commit; use GitHub UI for commit)

# 3. Wait for Pages deploy (3-7 min total)
```

### Option B: Manually Edit status.json

```bash
# 1. Clone/pull latest
git pull origin main

# 2. Edit data/status.json (fix the error)
#    - Use jq to validate: jq . data/status.json
#    - Maintain schemaVersion: 2
#    - Update collectedAt to current time

# 3. Commit and push
git add data/status.json
git commit -m "chore(status): manual correction of pipeline status data"
git push origin main

# 4. Wait for Pages deploy
```

---

## Procedure 4: Disable GitHub Pages (Emergency)

**Use when**: Live site is broken and you need to take it offline immediately.

1. Go to: Repository Settings → Pages
2. Under **Build and deployment** → **Source**
3. Change from "GitHub Actions" to **"None"**
4. Save
5. Site now returns 404 (but repository intact)
6. Fix issue, then change Source back to "GitHub Actions"

**Note**: This does not delete the deployment; it just stops serving it. Re-enabling restores the last successful deployment.

---

## Procedure 5: Rollback Collector Workflow Changes

**Use when**: Changes to `.github/workflows/collect-status.yml` or `.github/scripts/collect-status.sh` broke collection.

```bash
# 1. Revert the workflow/script changes
git revert <bad-commit-sha>
# Or edit files directly to fix

# 2. Push
git push origin main

# 3. Manually trigger collector to verify
# Actions → Collect System Status → Run workflow

# 4. Check status.json updated correctly
```

---

## Procedure 6: Recover from Failed Pages Deployment

**Use when**: `deploy-pages.yml` fails and site shows old version.

```bash
# 1. Check Actions → Deploy to GitHub Pages → failed run
# 2. Fix issue (see DEPLOYMENT_GUIDE.md troubleshooting)
# 3. Re-run the last successful workflow:
#    Actions → Deploy to GitHub Pages → Click run → "Re-run all jobs"
```

**Note**: `deploy-pages.yml` has no `workflow_dispatch` trigger, so a manual
"Run workflow" button is unavailable by design. If the gate blocks the re-run as
"already deployed", wait for the next Security Scan or collector completion, or
push a real change.

**Common fixes**:
- Pages source not "GitHub Actions" → Fix in Settings
- First run — environment not created → Re-run creates it
- Artifact too large → Not applicable (repo is tiny)

---

## Procedure 7: Complete Disaster Recovery

**Use when**: Repository corrupted, multiple workflows broken, need to restore from known state.

```bash
# 1. Identify last known good commit (from git log or GitHub UI)
git log --oneline -20

# 2. Create recovery branch
git checkout -b recovery <good-commit-sha>

# 3. Verify locally
python3 -m http.server 8000
# Test at http://localhost:8000/index.html

# 4. Force push to main (LAST RESORT)
git push --force origin recovery:main

# 5. Verify required workflows run
# Actions → Collect System Status → Run workflow
# Actions → Security Scan → Run workflow
# Actions → Deploy to GitHub Pages (runs automatically after Security Scan succeeds)
```

---

## Rollback Decision Tree

```
PROBLEM DETECTED
       │
       ▼
Is it a CODE issue (HTML/CSS/JS)?
       │
       ├── YES → git revert HEAD → push → Done (2-5 min)
       │
       └── NO
           │
           ▼
Is it a STATUS DATA issue (wrong status in dashboard)?
       │
       ├── YES → Manual collector run OR manual JSON edit → push → Done (3-7 min)
       │
       └── NO
           │
           ▼
Is it a PAGES DEPLOYMENT failure?
       │
       ├── YES → Fix workflow → Re-run deploy → Done (2-5 min)
       │
       └── NO
           │
           ▼
Is it a COLLECTOR failure?
       │
       ├── YES → Fix script/workflow → Manual trigger → Done (1-2 min)
       │
       └── NO
           │
           ▼
SITE COMPLETELY BROKEN?
       │
       ├── YES → Disable Pages (Settings) → Fix → Re-enable
       │
       └── UNKNOWN → Check logs, escalate
```

---

## Verification After Rollback

After any rollback, verify:

- [ ] Live site loads (HTTP 200)
- [ ] Dashboard shows correct data
- [ ] Theme toggle works
- [ ] Manual refresh works
- [ ] No console errors
- [ ] Security Scan and Deploy to GitHub Pages show green in Actions (gate allowed)
- [ ] Data freshness: `collectedAt` recent (< 10 min)

---

## Communication

After rollback, notify team:

```
Subject: [Rollback] Athmetry System Status - <reason>

- What happened: <brief description>
- What was rolled back: <commit SHA / description>
- Current status: <live site working / investigating>
- Next steps: <fix planned / monitoring>
```

---

## Prevention

To reduce rollback need:

1. **Test locally** before push (per TESTING_GUIDE.md)
2. **Small commits** — easier to revert
3. **Conventional commits** — clear history
4. **Branch protection** (when enabled) — require PR review
5. **Staging preview** (future) — deploy preview environments