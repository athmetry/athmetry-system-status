# Skill: Production Release

## Purpose

Safely prepare and coordinate production deployments for Athmetry System Status.

## Release Boundary

**AGENTS CANNOT DEPLOY.** 

- Implementation stops at "ready for review"
- User authorizes: commit, push, deploy, secret changes, schedule changes
- This skill documents the process for user execution

---

## Deployment Architecture

```
Developer Push → main
       │
       ▼
deploy-pages.yml (GitHub Actions)
       │
       ├── Upload artifact (path: '.')
       │
       └── Deploy to GitHub Pages (OIDC)
       │
       ▼
https://athmetry.github.io/athmetry-system-status/
```

**Collector commits also trigger deploy** — collector pushes to `main` → deploy workflow runs.

---

## Pre-Release Checklist (User Executes)

Before authorizing release:

### Code Quality
- [ ] All tests executed and passed (see Testing skill)
- [ ] `git status` clean — no `.bak`, temp files, debug code
- [ ] No secrets/tokens in code or docs
- [ ] Commit messages follow conventional format

### Documentation
- [ ] Relevant `docs/` files updated
- [ ] `CHANGELOG.md` updated ([Unreleased] section)
- [ ] `README.md` accurate if user-facing change

### Verification
- [ ] Static validation passes (`node --check`, `jq`, schema validator, html-validate, csstree-validator)
- [ ] Local server loads without errors
- [ ] Theme toggle works (both themes, persistence, no flash)
- [ ] Manual refresh works (success, error, timeout)
- [ ] Auto-refresh fires (60s, Network tab)
- [ ] Pipeline detail dialog opens with jobs/history and correct GitHub run URL
- [ ] Three repository cards render in the expected layout
- [ ] Responsive: 6 widths × 2 themes, zero horizontal overflow
- [ ] Print styles hide interactive elements
- [ ] JSON validates: `jq . data/status.json` and `node scripts/validate-status-json.js`
- [ ] Workflow YAML parses locally (no dispatch)

---

## Release Process (User Executes)

### Standard Release

```bash
# 1. Review final diff
git diff

# 2. Commit (if not already committed)
git add -A
git commit -m "type(scope): description"

# 3. Push to main (triggers deploy-pages.yml)
git push origin main

# 4. Monitor deployment
# GitHub → Actions → Deploy to GitHub Pages
# Wait for green checkmark (1-3 min)

# 5. Verify production
# Visit: https://athmetry.github.io/athmetry-system-status/
# Check: HTTP 200, data current, no console errors, theme toggle works
```

### Hotfix Release

```bash
# 1. Create hotfix branch from main
git checkout -b hotfix/description main

# 2. Make minimal fix
# Edit files...

# 3. Test locally
python3 -m http.server 8000

# 4. Commit and push
git add -A
git commit -m "fix(scope): hotfix description"
git push origin hotfix/description

# 5. PR → review → merge to main
# (Triggers deploy automatically)

# 6. Verify production
```

### Rollback Release

```bash
# Option 1: Revert (preferred — preserves history)
git revert <bad-commit-sha>
git push origin main

# Option 2: Reset (emergency only — rewrites history)
git reset --hard <good-commit-sha>
git push --force origin main

# Both trigger deploy-pages.yml → redeploy previous version
```

---

## Post-Release Verification (User Executes)

After deployment completes:

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Live site loads | Browser / `curl -I` | HTTP 200 |
| Data current | Dashboard `collectedAt` | Recent (< 10 min) |
| Theme toggle | Click button | Switches, persists |
| Manual refresh | Click button | Success toast |
| No console errors | F12 → Console | Clean |
| Security Scan + deploy gate green | Actions tab | ✅ |

---

## Collector + Deploy Interaction

**Important**: Collector commits reach the deploy workflow through `workflow_run`
completion — not through a `push` trigger. Pushes made with `GITHUB_TOKEN` do not
trigger push-based workflows.

```
Collector runs (5 min) → Data changed? → Commit + Push (GITHUB_TOKEN)
                                    │
                                    ├── No change → Skip commit → No deploy
                                    │
                                    └── Changed → Collector run completes
                                              → deploy-pages.yml gate
                                              → data/status.json-only drift → Deploy → Live site updated
```

The gate blocks the deploy if `main` contains code changes that Security Scan has
not validated.

**Timing**:
- Collector run: ~30-60s
- Commit + push: ~10s
- Deploy gate + workflow: 1-3 min
- CDN propagation: 1-2 min
- **Total: 3-7 minutes** from collector run to live data

---

## Secret Management (User Only)

### Rotating PAT (`ATHMETRY_GITHUB_TOKEN`)

1. Generate new fine-grained PAT at https://github.com/settings/tokens?type=beta
2. Same permissions: Read Actions+Contents on backend/frontend; Read+Write on this repo
3. Repository Settings → Secrets → Actions → Update `ATHMETRY_GITHUB_TOKEN`
4. Next collector run (within 5 min) uses new token
5. Verify collector workflow succeeds

### Adding New Secret

1. Repository Settings → Secrets → Actions → New repository secret
2. Name + Value
3. Update workflow `env:` if needed
4. Update `docs/deployment/ENVIRONMENT_CONFIGURATION.md`

---

## Environment Changes (User Only)

### Changing Collector Schedule

```yaml
# .github/workflows/collect-status.yml
on:
  schedule:
    - cron: '*/10 * * * *'  # New schedule
```
Push → takes effect immediately.

### Changing Pages Deployment Branch

```yaml
# .github/workflows/deploy-pages.yml
on:
  push:
    branches: [main, production]
```

### Enabling Custom Domain

1. Purchase/configure `status.athmetry.com` DNS
2. `echo "status.athmetry.com" > CNAME`
3. `git add CNAME && git commit -m "chore: configure custom domain" && git push`
4. Settings → Pages → Custom domain → Enter domain → Enforce HTTPS

---

## Monitoring Post-Release

### Immediate (First 15 min)
- [ ] Live site accessible
- [ ] Dashboard shows correct data
- [ ] No error alerts
- [ ] Actions: collector, deploy, and CI workflows green (security scan runs weekly/PR)

### Ongoing (Daily)
- [ ] Collector runs every 5 min (Actions history)
- [ ] Data freshness < 10 min (no stale alert)
- [ ] No failed workflow runs

### Weekly
- [ ] PAT expiration check
- [ ] Collector run duration trend
- [ ] Deploy duration trend

---

## Incident Response During Release

If production breaks after release:

1. **Immediate**: `git revert HEAD` → push → auto-deploy previous version
2. **Or**: Disable Pages (Settings → Pages → Source: None) → fix → re-enable
3. **Communicate**: Post in team channel with status
4. **Postmortem**: Within 48 hours for SEV-1/2

---

## Release Communication Template

```
## Release: vX.Y.Z — YYYY-MM-DD

**Changes**:
- type(scope): description
- type(scope): description

**Testing**: All mandatory tests passed (see PR #XXX)

**Deployment**: Automatic via deploy-pages.yml
**Live**: https://athmetry.github.io/athmetry-system-status/

**Rollback**: git revert HEAD (if needed)

**Known Issues**: 
- [Limitation 1]
- [Limitation 2]
```

---

## Anti-Patterns

- ❌ Agent committing/pushing without user authorization
- ❌ Deploying without test evidence
- ❌ Skipping post-release verification
- ❌ Force pushing without explicit need
- ❌ Changing secrets/schedules without documentation update
- ❌ Not updating CHANGELOG.md
- ❌ Not verifying collector + deploy chain works