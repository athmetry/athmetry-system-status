# Monitoring

## Overview

This document describes how to monitor the health of the Athmetry System Status system, including the collector, deployment, and live dashboard.

---

## Key Metrics

| Metric | Target | Warning Threshold | Critical Threshold |
|--------|--------|-------------------|-------------------|
| Collector success rate | 100% | < 100% (any failure) | N/A |
| Collector run duration | < 60s | > 90s | > 120s |
| Pages deploy success | 100% | < 100% | N/A |
| Pages deploy duration | < 3 min | > 4 min | > 5 min |
| Live site availability | 100% | Any 5xx | Any 4xx/5xx |
| Data freshness | < 5 min | > 10 min (stale alert) | > 15 min |
| Frontend errors | 0 | Any console error | Recurring errors |

---

## Monitoring Dashboards

### 1. GitHub Actions (Primary)

**Collector**: Actions → Collect System Status
- **Green checkmark**: Collector succeeded
- **Red X**: Collector failed — check logs
- **Run duration**: Should be 30-60s
- **Frequency**: Backend reporter event pushes plus a 30-minute fallback (check timestamps)

**Deploy**: Actions → Deploy to GitHub Pages
- **Green checkmark**: Deploy succeeded
- **Red X**: Deploy failed — check the gate and deploy job logs
- **Deployment URL**: Click to verify live site
- **Runs**: Triggered by Security Scan or Collect System Status completion on `main`; the gate blocks unvalidated revisions

**Security**: Actions → Security Scan
- **Security Scan**: Runs on PRs, pushes to `main`, weekly (Mondays 03:17 UTC), and manual dispatch; gitleaks + zizmor
- **Red X**: A scan finding blocks the change (and therefore deployment); fix before merging

### 2. Live Dashboard (Secondary)

Visit: https://athmetry.github.io/athmetry-system-status/

**Visual Indicators**:
- **Overall status pill**: Green = healthy, Red = failure, Blue = running, Grey = unknown
- **Stale data alert**: Yellow banner if `collectedAt` > 10 min
- **Repo error alert**: Red banner if collector API failed
- **Last checked timestamp**: Header shows the browser's last successful status check
- **Last collected at**: Meta row shows the collector's actual `collectedAt` timestamp
- **Console**: F12 → Check for errors (should be clean)

### 3. GitHub Repository Insights

- **Commits**: Check `main` branch for collector commits (`chore(status): ...`)
- **Traffic**: Insights → Traffic (if enabled) — page views, referrers

---

## Automated Alerts (Current)

**None configured.** Monitoring is manual via:
- GitHub Actions email notifications (on failure)
- Manual dashboard checks
- Team awareness

### GitHub Actions Failure Notifications

By default, GitHub emails repository watchers on workflow failure.

**To ensure notifications**:
1. Watch the repository (GitHub UI → Watch → All Activity)
2. Or: Settings → Notifications → Customize → Actions → Failed runs

---

## Recommended Alerting (Future)

| Alert | Condition | Channel |
|-------|-----------|---------|
| Collector failure | Any failed run | Email/Slack |
| Collector slow | Duration > 120s | Email/Slack |
| Deploy failure | Any failed deploy | Email/Slack |
| Data stale | `collectedAt` > 15 min | Email/Slack |
| Site down | HTTP != 200 | Email/Slack |

**Implementation options**:
- GitHub Actions + webhook to Slack
- External monitoring (UptimeRobot, Pingdom, etc.)
- Custom workflow that checks `status.json` age

---

## Health Check Procedures

### Daily (Automated via Collector)

Collector runs after Backend events with a 30-minute scheduled fallback — implicit health check.

### Weekly (Manual)

1. Visit live dashboard
2. Verify all three repository cards show recent pipelines
3. Check no stale/error alerts
4. Verify theme toggle works
5. Check Actions tab for failed collector, deploy, CI, or security-scan runs

### Monthly (Manual)

1. Review collector run history (any patterns of failure?)
2. Check PAT expiration date
3. Verify monitored repos still exist and have workflows
4. Review git history for unusual commits

---

## Log Locations

| Component | Location |
|-----------|----------|
| Collector | Actions → Collect System Status → Run → "Collect status data" step |
| Deploy | Actions → Deploy to GitHub Pages → Run → gate and deploy step output |
| Security Scan | Actions → Security Scan → Run → gitleaks/zizmor output |
| Frontend | Browser Console (F12) |
| Git pushes | Git history (`git log --oneline`) |

---

## Collector Log Analysis

**Successful run log pattern**:
```
Status data updated: data/status.json
# or
Status data unchanged; skipping commit.
```

**Failed run indicators**:
- `ERROR: ATHMETRY_GITHUB_TOKEN environment variable is not set`
- `Failed to fetch workflows from GitHub API.`
- `Permission denied` (git push)
- `gh: command not found` (runner issue)
- `jq: command not found` (runner issue)

---

## Production Event-Driven Collector Verification

Use this procedure to verify the Backend event-driven collector without changing
application code or manually editing production status data:

1. Confirm the Backend reporter wrote the event to
   `data/status-events/backend.json` and pushed it to `main`.
2. Confirm the push triggered **Collect System Status**. The 30-minute
   scheduled collector remains the fallback, and `workflow_dispatch` is
   available for controlled recovery or verification.
3. After the collector completes, inspect the run logs and the resulting
   `data/status.json` commit on `main`. Confirm the Backend event was accepted,
   the Backend workflow and successful history were updated, and the Frontend
   and System Status entries were preserved.
4. Confirm the subsequent quality-gated **Deploy to GitHub Pages** run used
   the validated revision and completed successfully.
5. Open the live dashboard and use **Manual Refresh** to fetch the newly
   published `data/status.json`. Manual Refresh only fetches the published
   snapshot; it does not execute the collector.

### Current Verification Case

The existing Backend event records Backend Validation run **#38**:

- Run ID: `43517315540`
- Attempt: `1`
- Commit: `6cb7d54feef69089b06504eb033cd5c7c44541c7`
- Conclusion: `success`

Expected result: the published Backend Validation latest run becomes run #38
with its successful status and job details. Existing Backend history and the
latest successful build remain intact, and the Frontend and System Status
repository entries remain unaffected.

---

## Data Freshness Monitoring

The frontend automatically shows a "Stale data" alert when:
- `collectedAt` timestamp is > 10 minutes old

**To check programmatically**:
```bash
# Fetch live status.json
curl -s "https://athmetry.github.io/athmetry-system-status/data/status.json" | jq .collectedAt

# Compare with now
# If diff > 600s (10 min) → stale
```

---

## Incident Detection Checklist

When something seems wrong, check in order:

1. **Live dashboard**: https://athmetry.github.io/athmetry-system-status/
   - Stale data alert?
   - Repo error alert?
   - Overall status red?
   
2. **GitHub Actions**: 
   - Collector: recent runs green?
   - Deploy: recent runs green?
   
3. **Collector logs** (if collector failed):
   - API errors?
   - Auth errors?
   - Push errors?

4. **Deploy logs** (if deploy failed):
   - Pages source correct?
   - Environment exists?
   - Artifact upload ok?

5. **Browser console** (if frontend broken):
   - JS errors?
   - Network failures?
   - CSS not loading?

---

## Runbook: Common Incidents

| Incident | Detection | Resolution |
|----------|-----------|------------|
| Collector failing | Actions red, no new commits | Check PAT, API access, runner logs |
| Deploy failing | Actions red, site not updating | Check Pages source, re-run deploy |
| Stale data alert | Yellow banner on dashboard | Trigger collector manually |
| Repo shows "Unknown" | Grey status pill | Check monitored repo has workflow runs |
| Site returns 404 | Browser / curl | Check Pages source, re-run deploy |
| Theme broken | Console errors, wrong colors | Check CSS syntax, localStorage |

---

## Performance Baselines

| Operation | Typical | Acceptable |
|-----------|---------|------------|
| Collector API calls | 5–15s total (1 listing + 3 calls per active workflow) | < 30s |
| Collector script | 10–25s | < 60s |
| Pages deploy | 60–120s | < 180s |
| Frontend initial load | < 500ms | < 1s |
| Frontend auto-refresh | < 200ms | < 500ms |
| Manual refresh | < 500ms | < 10s (timeout) |

---

## Capacity Planning

Current usage (well within limits):
- **GitHub Actions minutes**: collector (~12 runs/hr), deploy (on push), CI (on push/PR), security scan (weekly) — combined well within the free tier for a public repository
- **API calls**: roughly 300 calls/hr (3 repos; 1 workflow listing + up to 3 calls per active workflow, 12 collections/hr) — well within PAT limits
- **Pages bandwidth**: Minimal (internal tool, few users)
- **Storage**: Small static site (HTML/CSS/JS + `status.json`)

No scaling concerns for current architecture.