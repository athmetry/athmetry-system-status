# GitHub Actions Reference

This document provides a complete reference for all GitHub Actions workflows in this repository.

---

## Workflow Files

| File | Purpose | Triggers |
|------|---------|----------|
| `.github/workflows/collect-status.yml` | Collect pipeline status from monitored repos | Backend event push, schedule (30-min fallback), `workflow_dispatch` |
| `.github/workflows/deploy-pages.yml` | Quality-gated deployment of the static site to GitHub Pages | `workflow_run` completion of Security Scan or Collect System Status on `main` |
| `.github/workflows/security-scan.yml` | Scan tracked files for secrets and workflows for security misconfigurations | Pull request to `main`, push to `main`, weekly schedule, `workflow_dispatch` |

Exactly three workflows exist. Static validation (JS/JSON/HTML/CSS/schema/assets) is run locally before a push rather than in a CI workflow.

---

## collect-status.yml — Complete Reference

```yaml
name: Collect System Status

on:
  schedule:
    - cron: '*/30 * * * *'  # 30-minute fallback
  workflow_dispatch:       # Manual trigger
  push:                    # Prompt Backend event processing
    branches: [main]
    paths:
      - 'data/status-events/backend.json'

permissions:
  contents: write          # Required to commit status.json

concurrency:
  group: collect-status
  cancel-in-progress: false  # Don't cancel in-progress runs

jobs:
  collect:
    name: Collect pipeline status
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      # 1. Checkout with PAT for write access
      - name: Check out repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
        with:
          token: ${{ secrets.ATHMETRY_GITHUB_TOKEN }}
          persist-credentials: false

      # 2. Configure git identity for commits
      - name: Configure Git identity
        run: |
          git config user.name "athmetry-status-bot"
          git config user.email "athmetry-status-bot@users.noreply.github.com"

      # 3. Run collector script
      - name: Collect status data
        id: collect
        env:
          ATHMETRY_GITHUB_TOKEN: ${{ secrets.ATHMETRY_GITHUB_TOKEN }}
        run: |
          ./.github/scripts/collect-status.sh

      # 4. Commit and push if changed
      - name: Commit and push status data
        if: steps.collect.outcome == 'success'
        env:
          GITHUB_TOKEN: ${{ github.token }}  # Built-in token for push
        run: |
          if git diff --quiet -- data/status.json; then
            echo "No changes to commit."
          else
            COMMIT_DATE=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
            git add data/status.json
            git commit -m "chore(status): update pipeline status data ($COMMIT_DATE)"
            if [[ -z "${GITHUB_TOKEN:-}" ]]; then
              echo "ERROR: GITHUB_TOKEN is not set." >&2
              exit 1
            fi
            git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
            if git push origin HEAD:main; then
              git remote set-url origin "https://github.com/${GITHUB_REPOSITORY}.git"
            else
              git remote set-url origin "https://github.com/${GITHUB_REPOSITORY}.git" 2>/dev/null || true
              exit 1
            fi
          fi
```

### Key Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Checkout token | `ATHMETRY_GITHUB_TOKEN` (PAT) | Needs write access to commit |
| Event trigger | Push to `data/status-events/backend.json` on `main` | Processes Backend reporter events promptly; the collector's `data/status.json` output is excluded, preventing a loop |
| Push token | `GITHUB_TOKEN` (built-in) | Separate from PAT; least privilege |
| Concurrency | `cancel-in-progress: false` | Don't interrupt an in-progress collection run |
| Commit condition | Only if `git diff --quiet` fails | Avoid empty commits on every run |
| Commit message | Includes timestamp | Audit trail, matches `collectedAt` |
| Remote URL | Temporarily embeds token | Standard pattern for Actions push |

### Required Secret: `ATHMETRY_GITHUB_TOKEN`

**Type**: Fine-grained Personal Access Token

**Permissions**:
| Repository | Permissions |
|------------|-------------|
| `athmetry/athmetry-backend` | Actions: Read, Contents: Read |
| `athmetry/athmetry-frontend` | Actions: Read, Contents: Read |
| `athmetry/athmetry-system-status` | Actions: Read, Contents: Read & Write |

**Expiration**: Set reminder to rotate before expiry (max 1 year for fine-grained PAT).

**Creation**: GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.

---

## deploy-pages.yml — Complete Reference

```yaml
name: Deploy to GitHub Pages

on: # zizmor: ignore[dangerous-triggers] gated to main-only, security-validated revisions
  workflow_run:
    workflows: ["Security Scan", "Collect System Status"]
    types: [completed]
    branches: [main]

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  gate:
    name: Verify deployment gate
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
      actions: read
    outputs:
      deploy: ${{ steps.gate.outputs.deploy }}
      sha: ${{ steps.gate.outputs.sha }}
      reason: ${{ steps.gate.outputs.reason }}
    steps:
      - name: Evaluate quality gate
        id: gate
        # Queries the latest successful Security Scan on main, compares it with
        # the current main head, and only allows data/status.json-only drift.

  deploy:
    name: Deploy static site to GitHub Pages
    needs: gate
    if: needs.gate.outputs.deploy == 'true'
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Check out validated revision
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1
        with:
          ref: ${{ needs.gate.outputs.sha }}
          persist-credentials: false

      - name: Verify checked-out revision
        # Fails unless `git rev-parse HEAD` equals the gate's validated SHA.

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: '.'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### Gate Rules

The `gate` job sets `deploy=true` only when **all** of these hold:

1. The triggering run was on `main`.
2. The triggering run concluded `success`.
3. A successful Security Scan exists on `main`, and either:
   - the current `main` head **is** that validated revision, or
   - `main` is `ahead` of it and the only changed file is `data/status.json`.
4. That revision has not already been deployed successfully.

Everything else is blocked with a recorded reason: pull requests, failed or
cancelled runs, unvalidated code changes, diverged history, no successful
Security Scan, and duplicate deployments.

### Key Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Trigger | `workflow_run` completion | Commits made with `GITHUB_TOKEN` do not trigger `push` workflows; `workflow_run` does, so collector data reaches Pages |
| Collector as trigger | Data-freshness path only | Still gated on a security-validated code lineage; the collector is not a quality gate |
| No `workflow_dispatch` | Manual deploys cannot bypass the gate | Prevents deploying unvalidated revisions |
| Revision check | Checkout `gate.sha` + `git rev-parse HEAD` | Guarantees the deployed tree is exactly the validated revision |
| Artifact path | `'.'` (repo root) | Serves `index.html`, `css/`, `js/`, `data/`, `assets/` directly |
| Permissions | Workflow `contents: read`; job-scoped writes | Least privilege for `gate` and `deploy` |
| Environment | `github-pages` | Required for Pages deployment protection |
| Checkout | `persist-credentials: false` | No credentials needed for read-only checkout |

### GitHub Pages Configuration

**Repository Settings → Pages**:
- **Source**: GitHub Actions (required for this workflow)
- **Custom domain**: Not configured (CNAME file empty, reserved for `status.athmetry.com`)

**First Deploy**: Creates `github-pages` environment automatically.

---

## Local Static Validation (No Workflow)

Static validation is **not** a GitHub Actions workflow — the repository runs only three. Run these checks locally before any push:

| Check | Tool | Scope |
|-------|------|-------|
| JavaScript syntax | `node --check` | Every `js/**/*.js` file |
| JSON syntax | `jq empty` | `data/status.json`, `package.json` |
| Status data contract | `scripts/validate-status-json.js` | `data/status.json` schema and fields |
| HTML structure | `html-validate@11.21.1` | `index.html` |
| CSS syntax | `csstree-validator@4.0.1` | `css/style.css` |
| Required files | `test -s` | App entry points, data, and `package.json` |
| Brand assets | Reference scan of `index.html` | Every referenced `assets/brand/*` file |

HTML style rules for XHTML-style void tags, implicit button types, and trailing whitespace are disabled because the existing markup intentionally uses those conventions; structural rules remain enabled.

Any failing check exits non-zero.

---

## security-scan.yml — Complete Reference

Runs on pull requests targeting `main`, pushes to `main`, every Monday at 03:17 UTC, and manual dispatch. Permissions are limited to `contents: read`.

```yaml
name: Security Scan

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  schedule:
    - cron: '17 3 * * 1'
  workflow_dispatch:

permissions:
  contents: read
```

### Checks

| Check | Tool | Scope |
|-------|------|-------|
| Secret scanning | `gitleaks` 8.30.1 (SHA-256 verified release binary) | Files tracked at `HEAD`, exported with `git archive` |
| Workflow security analysis | `zizmor` 1.32.0 via `zizmorcore/zizmor-action` | All workflow definitions under `.github/workflows/` |

Gitleaks runs with `--redact` so secret values never appear in logs. Zizmor runs offline with `--min-severity medium --min-confidence high` and exits non-zero on findings.

### Zizmor Policy

`.github/zizmor.yml` preserves the existing convention of major-version tags for the two Pages actions while requiring SHA pinning for `actions/checkout`, every other official action, and all third-party actions.

---

## Action Versions (Pinned SHAs)

| Action | SHA | Version | Updated |
|--------|-----|---------|---------|
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | v7.0.1 | 2026-11 |
| `zizmorcore/zizmor-action` | `45d7276c9ca790aabd705e31ca99c6185c3e76dd` | v0.8.1 | 2026-11 |
| `actions/upload-pages-artifact` | `@v4` | v4.x | 2026-11 |
| `actions/deploy-pages` | `@v4` | v4.x | 2026-11 |

**Policy**: Pin third-party actions and `actions/checkout` to full SHAs. The two official Pages actions remain on `@v4` by existing convention; `.github/zizmor.yml` enforces SHA pinning for every other action.

**Non-Action tools**: `gitleaks` 8.30.1 is downloaded from its official release and verified against a pinned SHA-256 checksum before execution.

---

## Workflow Triggers Summary

| Workflow | Schedule | Push | Manual | PR | workflow_run |
|----------|----------|------|--------|-----|--------------|
| collect-status | ✅ 30 min fallback | ✅ Backend event path on `main` | ✅ | ❌ | ❌ |
| deploy-pages | ❌ | ❌ | ❌ | ❌ | ✅ Security Scan / Collect System Status on `main` |
| security-scan | ✅ weekly | ✅ main | ✅ | ✅ main | ❌ |

---

## Concurrency Behavior

### collect-status
- **Group**: `collect-status`
- **Cancel in progress**: `false`
- **Effect**: If a run is in progress when next cron triggers, the new run queues. Runs sequentially.
- **Why**: Collection is fast (~30s); 5-min interval means queue rarely backs up. Cancelling mid-API-call could leave partial state.

### deploy-pages
- **Group**: `pages`
- **Cancel in progress**: `false`
- **Effect**: Deployment runs queue; the gate decides which ones actually deploy.
- **Why**: Prevents overlapping Pages deployments, which the Pages API rejects.

---

## Environment Variables

### collect-status.yml

| Variable | Source | Used By |
|----------|--------|---------|
| `ATHMETRY_GITHUB_TOKEN` | Repository secret | Collector script (via `GH_TOKEN`) |
| `GITHUB_TOKEN` | Built-in (auto) | Git push step |
| `GITHUB_REPOSITORY` | Built-in (auto) | Git remote URL construction |

### deploy-pages.yml

| Variable | Source | Used By |
|----------|--------|---------|
| `GITHUB_TOKEN` | Built-in (auto) | OIDC token for deploy (implicit) |

---

## Debugging Workflow Failures

### collect-status.yml

**View Logs**: Actions → Collect System Status → Click run → Expand steps

**Common Failure Points**:

| Step | What to Check |
|------|---------------|
| Checkout | PAT has `contents: write` on this repo |
| Collect | `ATHMETRY_GITHUB_TOKEN` set; PAT has read access to backend/frontend/system-status |
| Collect | `gh` and `jq` available (ubuntu-latest has both) |
| Commit/Push | `GITHUB_TOKEN` available; no merge conflicts |

**Re-run**: Actions → Collect System Status → Re-run jobs (or Run workflow)

### deploy-pages.yml

**View Logs**: Actions → Deploy to GitHub Pages → Click run

**Common Failure Points**:

| Step | What to Check |
|------|---------------|
| Gate | Triggering run was on `main` and concluded `success` |
| Gate | A successful Security Scan exists for the current code lineage |
| Gate | Head differs from the validated revision only by `data/status.json` |
| Checkout | Validated SHA exists and is reachable |
| Verify | `git rev-parse HEAD` equals `gate.sha` |
| Upload artifact | Repo size < 1 GB (it's ~100 KB) |
| Deploy | `github-pages` environment exists (auto-created on first run) |
| Deploy | Pages source = "GitHub Actions" in repo settings |

**Re-run**: Actions → Deploy to GitHub Pages → Re-run jobs. Manual `workflow_dispatch` is intentionally unavailable so the gate cannot be bypassed.

---

## Modifying Workflows

### Changing Collector Schedule

Edit `.github/workflows/collect-status.yml`:

```yaml
on:
  schedule:
    # Change cron expression (GitHub uses UTC)
    - cron: '*/10 * * * *'  # Every 10 minutes
```

**Minimum interval**: 1 minute (`* * * * *`). GitHub may skip runs if too frequent.

### Adding a Monitored Repository

1. Edit `.github/scripts/collect-status.sh` → `MONITORED_REPOS` array
2. Add the repository card to `index.html` and register its key in `REPO_KEYS` in `js/dashboard.js`
3. Ensure `ATHMETRY_GITHUB_TOKEN` has read access to the new repo (Actions: Read, Contents: Read)
4. Self-monitoring is enabled: the collector's own `collect-status.yml` is included and its most recent completed run is reported
5. Commit and push → collector picks up on next run

### Changing the Deployment Gate

The deployment gate lives in the `gate` job of `.github/workflows/deploy-pages.yml`.
To change which revision is considered validated, edit the gate script's
Security Scan lookup or the `data/status.json`-only comparison. To deploy from a
branch other than `main`, update **all** of:

- `on.workflow_run.branches` in `deploy-pages.yml`
- the `git/ref/heads/main` lookup and the `?branch=main` query in the gate script
- the collector's `BRANCH` if the data source branch changes

Changing only the trigger branch is not sufficient — the gate would still
compare against `main` and block every deployment.

### Adding Workflow Status Badge

In `README.md`:

```markdown
![Collect Status](https://github.com/athmetry/athmetry-system-status/actions/workflows/collect-status.yml/badge.svg)
![Deploy Pages](https://github.com/athmetry/athmetry-system-status/actions/workflows/deploy-pages.yml/badge.svg)
```

---

## Security Best Practices

1. **Never log secrets**: Workflows don't echo `ATHMETRY_GITHUB_TOKEN`
2. **Least privilege**: PAT scoped to 3 repos only
3. **Separate tokens**: PAT for API reads, `GITHUB_TOKEN` for git push
4. **Pin action SHAs**: `actions/checkout` pinned to full SHA
5. **No self-hosted runners**: Use GitHub-hosted `ubuntu-latest`
6. **Persist credentials false**: Checkout doesn't leave tokens in git config

---

## Troubleshooting Reference

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Collector: "Permission denied" | PAT lacks write on this repo | Add Contents: Write to PAT for this repo |
| Collector: "Failed to fetch workflows" | PAT lacks read on backend/frontend/system-status | Add Actions: Read, Contents: Read to PAT for all repos |
| Collector: "No changes to commit" | Normal — data unchanged | No action needed |
| Deploy: "404 on Pages URL" | Pages source not "GitHub Actions" | Settings → Pages → Source: GitHub Actions |
| Deploy: gate says "did not succeed" | Triggering run failed or was cancelled | Fix the failure; the next successful run deploys |
| Deploy: gate says "unvalidated changes" | Code changed after the last successful Security Scan | Wait for Security Scan to pass on `main` |
| Deploy: gate says "already deployed" | Duplicate `workflow_run` for the same SHA | No action needed |
| Deploy: "Environment not found" | First run — environment auto-creates | Wait for first run to complete |
| Both: "Workflow not triggered" | Check `on:` triggers; branch name | Verify branch is `main`; check YAML syntax |