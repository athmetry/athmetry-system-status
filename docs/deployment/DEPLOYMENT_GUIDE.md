# Deployment Guide

## Overview

This document describes the complete deployment lifecycle from a developer's local change to the live production website at https://athmetry.github.io/athmetry-system-status/

---

## Deployment Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  Developer      │     │  GitHub Actions      │     │  GitHub Pages       │
│  Local Machine  │────▶│  (CI/CD)             │────▶│  (Static Hosting)   │
└─────────────────┘     └──────────────────────┘     └─────────────────────┘
                              │                              │
                              ▼                              ▼
                       ┌──────────────┐              ┌──────────────────┐
                       │ Deploy Flow  │              │  Live URL        │
                       │ 1. collect   │              │  https://        │
                       │    -status   │              │  athmetry.       │
                       │ 2. deploy-   │              │  github.io/      │
                       │    pages     │              │  athmetry-       │
                       └──────────────┘              │  system-status/  │
                                                     └──────────────────┘
```

---

## Security Workflow

`.github/workflows/security-scan.yml` scans for secrets and workflow
misconfigurations on pull requests, pushes to `main`, weekly, and on demand. It
never deploys or modifies repository contents, but its success is what allows
`deploy-pages.yml` to deploy a revision.

Static validation (JavaScript, JSON, HTML, CSS, status schema, assets) is run
locally before a push; it is not a workflow. See `GITHUB_ACTIONS.md` for details.

---

## Workflow 1: Collector (`collect-status.yml`)

### Purpose
Fetches pipeline status from `athmetry-backend`, `athmetry-frontend`, and `athmetry-system-status`, generates `data/status.json`, commits it to the repository.

### Triggers
- **Schedule**: Every 5 minutes (`cron: '*/5 * * * *'`)
- **Manual**: `workflow_dispatch` (Actions UI → "Run workflow")

### Permissions
```yaml
permissions:
  contents: write  # Required to commit status.json
```

### Authentication
- **Secret**: `ATHMETRY_GITHUB_TOKEN` (fine-grained PAT)
- **Scope**:
  - Read: Actions, Contents on `athmetry/athmetry-backend`
  - Read: Actions, Contents on `athmetry/athmetry-frontend`
  - Read: Actions, Contents on `athmetry/athmetry-system-status`
  - Read/Write: Contents on `athmetry/athmetry-system-status` (to commit `data/status.json`)

### Execution Flow
1. Checkout repository (using PAT for write access)
2. Configure git identity (`athmetry-status-bot`)
3. Run `.github/scripts/collect-status.sh` with `ATHMETRY_GITHUB_TOKEN`
4. If JSON changed: commit + push using `GITHUB_TOKEN` (built-in)

### Concurrency
```yaml
concurrency:
  group: collect-status
  cancel-in-progress: false  # Let current run finish
```

### Output
- Commits `data/status.json` with message: `chore(status): update pipeline status data (TIMESTAMP)`
- Only commits when content actually changes (`cmp -s` check)

---

## Workflow 2: Pages Deployment (`deploy-pages.yml`)

### Purpose
Deploys the static site (entire repository) to GitHub Pages, but only for
security-validated revisions.

### Triggers
- **`workflow_run` completion** of `Security Scan` or `Collect System Status`
  on `main`
- No `push` trigger (commits made with `GITHUB_TOKEN` do not trigger push-based
  workflows) and no `workflow_dispatch` (so the gate cannot be bypassed)

### Gate
The `gate` job sets `deploy=true` only when:
1. The triggering run was on `main` and concluded `success`;
2. A successful Security Scan exists on `main`, and the current `main` head is
   that validated revision or differs from it only by `data/status.json`;
3. That revision has not already been deployed.

Otherwise the run stops after the gate and records the reason in the step
summary. Pull requests, failed/cancelled runs, unvalidated code, diverged
history and duplicate deploys are all blocked.

### Permissions
```yaml
# Workflow level
permissions:
  contents: read

# gate job
permissions:
  contents: read
  actions: read

# deploy job
permissions:
  contents: read
  pages: write
  id-token: write  # For OIDC token to deploy
```

### Environment
```yaml
environment:
  name: github-pages
  url: ${{ steps.deployment.outputs.page_url }}
```

### Execution Flow
1. Gate evaluates trigger branch, conclusion, validated revision and duplicates
2. Checkout the exact validated SHA (read-only, no credentials persisted)
3. Verify `git rev-parse HEAD` equals the gate's SHA
4. Upload entire repo root (`.`) as Pages artifact
5. Deploy to GitHub Pages environment

### Concurrency
```yaml
concurrency:
  group: pages
  cancel-in-progress: false
```

### Output
- Live site at: https://athmetry.github.io/athmetry-system-status/
- Deployment URL in workflow output
- Gate decision and reason in the run's step summary

---

## Complete Deployment Flow

### Scenario A: Developer Pushes Code Change

```
1. Developer: git push origin main
        │
        ▼
2. GitHub Actions: security-scan.yml runs (push to main)
        │
        ├──► success ──► workflow_run completes
        │                    │
        │                    ▼
        │              deploy-pages.yml gate: head == validated SHA → deploy
        │
        └──► failure ──► deploy-pages.yml gate blocks (site unchanged)
        │
        ▼
3. Live site updated (1-3 minutes after the scan)
```

### Scenario B: Collector Updates Status Data

```
1. Cron triggers (every 5 min): collect-status.yml runs
        │
        ├──► Fetch latest runs from backend/frontend/system-status repos
        │
        ├──► Generate new status.json
        │
        ├──► If changed: commit + push to main (with GITHUB_TOKEN)
        │
        ▼
2. collect-status.yml completes → workflow_run fires
        │
        ▼
3. deploy-pages.yml gate: head differs from the validated revision
   only by data/status.json → deploy
        │
        ▼
4. Live site updated with new status
```

Note: the collector's `GITHUB_TOKEN` push does **not** trigger `push`-based
workflows, which is why the deploy listens to `workflow_run` instead.

### Scenario C: Manual Collector Run

```
1. Developer: Actions → Collect System Status → Run workflow
        │
        ▼
2. Same as Scenario B (collector runs, may commit, then deploy is gated)
```

### Scenario D: Manual Pages Deploy

Manual dispatch is intentionally disabled. To redeploy, re-run the last
successful `deploy-pages.yml` run from the Actions tab; the gate still applies
(an already-deployed revision is reported as such rather than silently
redeployed).

---

## Pre-Deployment Checklist

Before pushing to `main` (or merging PR):

- [ ] Local server loads without errors (`python3 -m http.server 8000`)
- [ ] Theme toggle works in both themes
- [ ] Manual refresh works (success, error, timeout)
- [ ] Auto-refresh fires (check Network tab)
- [ ] Pipeline detail dialog opens with correct run URL
- [ ] Responsive: no horizontal overflow at 320, 375, 430, 768, 1024, 1440px
- [ ] Both themes tested at all breakpoints
- [ ] `data/status.json` validates: `jq . data/status.json` and `node scripts/validate-status-json.js`
- [ ] No console errors in browser
- [ ] `git status` clean (no `.bak`, temp files, debug code)
- [ ] Relevant `docs/` files updated

---

## Post-Deployment Verification

After push/deploy completes:

1. **Check Actions tab**: Security Scan green, then Deploy to GitHub Pages green
2. **Visit live URL**: https://athmetry.github.io/athmetry-system-status/
3. **Verify**:
   - [ ] Page loads (HTTP 200)
   - [ ] Data matches expected (check `collectedAt` timestamp)
   - [ ] Theme toggle works
   - [ ] Manual refresh works
   - [ ] No console errors
4. **Check deployment URL** in `deploy-pages.yml` output matches live URL
5. **Read the gate summary** to confirm the deployed SHA is the validated one

---

## Rollback Procedures

### Rollback Code Changes

```bash
# Option 1: Revert commit (preserves history)
git revert HEAD
git push origin main
# → Security Scan runs → on success, deploy-pages.yml redeploys the revert

# Option 2: Reset to previous commit (rewrites history - use carefully)
git reset --hard HEAD~1
git push --force origin main
# → Security Scan runs on the new head → deploy is gated on its success
```

### Rollback Status Data Only

If collector committed bad data:

```bash
# 1. Fix collector (if bug)
# 2. Manually trigger collector to generate correct data
#    Actions → Collect System Status → Run workflow
# 3. Or: manually edit data/status.json locally, commit, push
git add data/status.json
git commit -m "chore(status): manual correction"
git push origin main
```

### Emergency: Disable Pages Temporarily

1. Go to Repository Settings → Pages
2. Change Source from "GitHub Actions" to "None"
3. Site returns 404 (but repo intact)
4. Fix issue, then re-enable "GitHub Actions"

---

## Environment Configuration

### Required Repository Secrets

| Secret | Description | Used By |
|--------|-------------|---------|
| `ATHMETRY_GITHUB_TOKEN` | Fine-grained PAT for collector | `collect-status.yml` |

### Required Repository Settings

| Setting | Value | Location |
|---------|-------|----------|
| Pages Source | GitHub Actions | Settings → Pages → Build and deployment |
| Actions Permissions | Allow all actions | Settings → Actions → General |
| Workflow Permissions | Read/write (for collector) | Settings → Actions → General → Workflow permissions |

### Branch Protection (Optional)

Not currently configured. Recommended for production:
- Require PR reviews
- Require status checks (when tests added)
- Restrict pushes to `main`

---

## Monitoring Deployment Health

### Key Metrics to Watch

| Metric | Target | Alert If |
|--------|--------|----------|
| Collector success rate | 100% | Any failure |
| Collector run duration | < 60s | > 120s |
| Pages deploy success | 100% | Any failure |
| Pages deploy duration | < 3 min | > 5 min |
| Live site HTTP status | 200 | Non-200 |
| Data freshness (collectedAt) | < 5 min | > 10 min (stale warning) |

### Where to Check

- **Collector**: Actions → Collect System Status → Recent runs
- **Deploy**: Actions → Deploy to GitHub Pages → Recent runs
- **Live site**: Visit URL, check browser console
- **Data freshness**: Dashboard shows "Stale data" alert if >10 min

---

## Troubleshooting Deployments

### Deploy Workflow Fails

| Error | Cause | Fix |
|-------|-------|-----|
| Gate blocks with `unvalidated changes` | Code changed after the last successful Security Scan | Wait for Security Scan to pass on `main` |
| Gate blocks with `did not succeed` | Triggering run failed or was cancelled | Fix the failure; the next success deploys |
| "Permission denied" on deploy | `id-token: write` missing | Check deploy job permissions |
| "Environment not found" | `github-pages` environment not created | First deploy creates it; or create manually |
| Artifact upload failed | Repo too large (>1 GB) | Not applicable (repo is tiny) |
| Revision mismatch | Checkout did not resolve the validated SHA | Re-run the deployment |

### Collector Commits Don't Trigger Deploy

| Cause | Fix |
|-------|-----|
| Expecting a `push` trigger | Commits made with `GITHUB_TOKEN` never trigger push-based workflows — deployment listens to `workflow_run` completion instead |
| Collector run failed | The gate requires the triggering run to have succeeded |
| Unvalidated code on `main` | Deploy is blocked until Security Scan passes for the current head |
| Revision already deployed | Duplicate `workflow_run` for the same SHA is skipped by design |

### Live Site Shows Old Data After Collector Run

1. Check `deploy-pages.yml` ran after the collector completion and that the gate allowed it
2. Check deployment URL in workflow output
3. Hard reload browser (Ctrl+Shift+R)
4. Wait 1-2 minutes for CDN propagation

---

## Adding a New Deployment Target

Currently: Only GitHub Pages.

To add another target (e.g., Netlify, Vercel, Cloudflare Pages):
1. Add new workflow (e.g., `deploy-netlify.yml`)
2. Configure secrets for target platform
3. Build step: none needed (static files)
4. Deploy: entire repo root

---

## Deployment Timeline

| Event | Typical Duration |
|-------|------------------|
| Developer push → deploy start | ~30 seconds |
| Deploy workflow run | 1-3 minutes |
| CDN propagation | 1-2 minutes |
| **Total: push → live** | **2-5 minutes** |
| Collector run | 30-60 seconds |
| Collector commit → deploy → live | 3-7 minutes |

---

## Security Considerations

- **No secrets in frontend**: `ATHMETRY_GITHUB_TOKEN` never in JS/HTML/CSS
- **PAT least privilege**: Read-only on monitored repos
- **Deploy uses OIDC**: No long-lived tokens for Pages deployment
- **Public repository**: All code and status.json visible
- **No authentication on dashboard**: Anyone with URL can view