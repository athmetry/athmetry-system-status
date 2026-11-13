# Incident Response

## Overview

This document defines the incident response process for the Athmetry System Status system.

---

## Severity Levels

| Level | Definition | Response Time | Examples |
|-------|------------|---------------|----------|
| **SEV-1** | Production completely down | Immediate | Site returns 404/5xx, multiple workflows failing |
| **SEV-2** | Major functionality broken | < 1 hour | Collector failing (stale data), deploy failing |
| **SEV-3** | Minor issue / degraded | < 4 hours | Single repo shows "Unknown", theme bug, typo |
| **SEV-4** | Cosmetic / enhancement | Next sprint | UI polish, documentation, non-critical bug |

---

## Incident Response Process

### 1. Detection

Incidents detected via:
- GitHub Actions failure email (auto)
- Manual dashboard check
- Team report
- External monitoring (future)

### 2. Triage

**On-call / responder**:
1. Acknowledge incident (Slack/email)
2. Determine severity (SEV-1 to SEV-4)
3. Check current status:
   - Live dashboard: https://athmetry.github.io/athmetry-system-status/
   - Actions: Collect System Status, Deploy to GitHub Pages, Security Scan

### 3. Investigation

**Follow runbook** (see TROUBLESHOOTING.md):

| Symptom | First Check |
|---------|-------------|
| Site down | Actions → Deploy to GitHub Pages |
| Stale data | Actions → Collect System Status |
| Repo "Unknown" | Collector logs → API errors |
| Theme broken | Browser console → CSS/JS errors |

### 4. Resolution

**Apply fix** based on runbook:
- Code fix → `git revert` or fix commit → push
- Config fix → Update secret/variable → re-run workflow
- Data fix → Manual collector run or manual JSON edit

### 5. Verification

- Live site loads (HTTP 200)
- Dashboard shows correct data
- No console errors
- Workflows green

### 6. Communication

**During incident** (SEV-1/2):
- Post in team channel: "Investigating: <description>"
- Update every 15 min until resolved

**After resolution**:
- Post: "Resolved: <description> — Root cause: <cause> — Fix: <fix>"
- Update incident log

### 7. Post-Incident (SEV-1/2 only)

Within 48 hours:
- Write brief postmortem
- Root cause analysis
- Action items to prevent recurrence
- Update runbooks/docs

---

## Runbooks by Symptom

### Site Returns 404 / 5xx

**Severity**: SEV-1

**Checks**:
1. Actions → Deploy to GitHub Pages → Recent runs
2. Settings → Pages → Source = "GitHub Actions"?

**Fixes**:
- Re-run failed deploy workflow
- Fix Pages source setting
- If deploy workflow broken: fix workflow → re-run

### Collector Failing (No New Status Data)

**Severity**: SEV-2 (data becomes stale >10 min)

**Checks**:
1. Actions → Collect System Status → Recent runs
2. Click failed run → "Collect status data" step logs

**Common Causes & Fixes**:
| Log Error | Fix |
|-----------|-----|
| `ATHMETRY_GITHUB_TOKEN not set` | Add/update secret in repo settings |
| `Permission denied` (checkout) | PAT needs `contents: write` on this repo |
| `Failed to fetch workflows from GitHub API.` | PAT needs read access on backend/frontend/system-status |
| `gh: command not found` | Runner issue — re-run, or check `runs-on` |

**Workaround**: Manual collector run (Actions → Run workflow) while fixing.

### Deploy Failing

**Severity**: SEV-2 (site not updating)

**Checks**:
1. Actions → Deploy to GitHub Pages → Failed run logs

**Common Causes & Fixes**:
| Issue | Fix |
|-------|-----|
| `Environment github-pages not found` | First run — re-run creates it |
| `Source not GitHub Actions` | Settings → Pages → Source: GitHub Actions |
| `Artifact upload failed` | Repo too large (not applicable) |

### Single Repo Shows "Unknown"

**Severity**: SEV-3

**Checks**:
1. Dashboard: Repo card shows grey "Unknown"
2. Collector logs: Check that repo's API calls

**Causes & Fixes**:
| Cause | Fix |
|-------|-----|
| No workflow runs on `main` | Ensure monitored repo has Actions on `main` |
| PAT lacks read access | Update PAT permissions for that repo |
| Wrong repo name in `MONITORED_REPOS` | Fix script, push, trigger collector |

### Frontend Errors (Console)

**Severity**: SEV-3 (usually)

**Checks**:
1. Browser Console (F12)
2. Network tab: failed requests

**Common Causes & Fixes**:
| Error | Fix |
|-------|-----|
| `status.json` 404 | Run collector, wait for deploy |
| JSON parse error | Fix `status.json` syntax |
| Theme toggle broken | Check `localStorage`, CSS variables |
| Horizontal overflow | Check responsive CSS at breakpoint |

---

## Contact Information

| Role | Contact | Escalation |
|------|---------|------------|
| Primary Owner | @mdtausif1 (GitHub) | Direct |
| Repository Admin | Athmetry org admins | GitHub org |
| GitHub Support | support.github.com | For platform issues |

---

## Incident Log Template

```markdown
## Incident YYYY-MM-DD-HHMM

**Severity**: SEV-1/2/3/4
**Detected**: YYYY-MM-DD HH:MM UTC
**Resolved**: YYYY-MM-DD HH:MM UTC
**Duration**: XX minutes

**Impact**: 
- What was affected (dashboard, collector, deploy, data)
- User impact (stale data, site down, wrong status)

**Root Cause**: 
- Technical description of what failed

**Resolution**: 
- What was done to fix it

**Action Items**:
- [ ] Preventive measure 1
- [ ] Preventive measure 2
- [ ] Documentation update

**Timeline**:
- HH:MM — Detected
- HH:MM — Triage started
- HH:MM — Root cause identified
- HH:MM — Fix deployed
- HH:MM — Verified
- HH:MM — Communicated
```

---

## Quick Reference Card

```
INCIDENT? → CHECK ACTIONS TAB FIRST

SEV-1 (Site down):
  1. Actions → Deploy Pages → Re-run
  2. Settings → Pages → Source: GitHub Actions
  3. If workflow broken → fix → push → auto-deploy

SEV-2 (Collector down):
  1. Actions → Collect Status → Check logs
  2. PAT issues → Update secret
  3. API access → Check PAT permissions
  4. Manual run while fixing

SEV-3 (Data wrong):
  1. Check collector logs for that repo
  2. Manual collector run
  3. Or manual JSON edit + push

VERIFY: Live site → No console errors → Workflows green
```