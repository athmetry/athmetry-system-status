# Skill: GitHub Actions

## Purpose

Understand, debug, and modify GitHub Actions workflows for Athmetry System Status.

## Workflows

| File | Purpose | Triggers |
|------|---------|----------|
| `.github/workflows/collect-status.yml` | Collector: fetches pipeline status, writes status.json | Schedule (5 min), `workflow_dispatch` |
| `.github/workflows/deploy-pages.yml` | Quality-gated Pages deployment of the static site | `workflow_run` completion of Security Scan or Collect System Status on `main` |
| `.github/workflows/security-scan.yml` | gitleaks + zizmor scanning | PR, push to `main`, weekly schedule, `workflow_dispatch` |

## Collector Workflow (collect-status.yml)

### Structure

```yaml
name: Collect System Status
on:
  schedule: [{ cron: '*/5 * * * *' }]  # Every 5 minutes
  workflow_dispatch:
permissions:
  contents: write  # Required to commit status.json
concurrency:
  group: collect-status
  cancel-in-progress: false
jobs:
  collect:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - Checkout (with PAT for write)
      - Git config (bot identity)
      - Collect status (runs script with PAT)
      - Commit & push (with GITHUB_TOKEN)
```

### Key Secrets

| Secret | Used By | Permissions Needed |
|--------|---------|-------------------|
| `ATHMETRY_GITHUB_TOKEN` | Checkout, Collect script | Fine-grained PAT: Read Actions+Contents on backend/frontend; Read+Write Contents on this repo |

### Authentication Flow

1. **Checkout**: Uses `ATHMETRY_GITHUB_TOKEN` (PAT) for write access
2. **Collect Script**: Exports `GH_TOKEN=$ATHMETRY_GITHUB_TOKEN` for `gh api` calls
3. **Commit/Push**: Uses `GITHUB_TOKEN` (built-in) — separate from PAT

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Permission denied` (checkout) | PAT lacks `contents: write` | Add permission to PAT |
| `ATHMETRY_GITHUB_TOKEN not set` | Secret missing | Add secret in repo settings |
| `Failed to fetch workflows` | PAT lacks read on backend/frontend/system-status | Add Actions: Read, Contents: Read |
| `gh: command not found` | Runner missing CLI | Use `ubuntu-latest` |
| `No changes to commit` | Normal — data unchanged | No action needed |

### Modifying Schedule

```yaml
# .github/workflows/collect-status.yml
on:
  schedule:
    - cron: '*/10 * * * *'  # Every 10 minutes (minimum 1 min)
```

### Adding Monitored Repository

1. Edit `.github/scripts/collect-status.sh`:
   ```bash
   MONITORED_REPOS=(
     "athmetry-backend athmetry athmetry-backend"
     "athmetry-frontend athmetry athmetry-frontend"
     "athmetry-system-status athmetry athmetry-system-status"
     "new-repo athmetry new-repo"
   )
   ```
2. Add the card to `index.html` and register the key in `js/dashboard.js` (`REPO_KEYS`)
3. Ensure PAT has read access to new repo
4. Push → collector picks up on next run

---

## Deploy Workflow (deploy-pages.yml)

### Structure

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  deploy:
    environment: github-pages
    runs-on: ubuntu-latest
    steps:
      - Checkout (read-only)
      - Upload Pages artifact (path: '.')
      - Deploy to Pages
```

### Repository Settings Required

- **Pages Source**: GitHub Actions (Settings → Pages)
- **Actions**: Allow all actions
- **Workflow permissions**: Read/write (for collector)

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Environment not found` | First run | Re-run creates it |
| `Source not GitHub Actions` | Wrong setting | Settings → Pages → Source: GitHub Actions |
| Deploy not triggered | Push not to `main` | Check branch name |

---

## Debugging Workflows

### View Logs

1. GitHub UI → Actions → Select workflow → Click run
2. Expand steps to see output
3. Collector: Check "Collect status data" step for script output
4. Deploy: Check "Deploy to GitHub Pages" step

### Re-run

- **Re-run failed jobs**: Actions → Run → "Re-run all jobs"
- **Manual trigger**: Actions → Workflow → "Run workflow"

### Local Testing (Limited)

```bash
# Validate YAML syntax
# Push to test branch
git push origin test-branch
# Check Actions tab

# Test collector locally (requires PAT)
export ATHMETRY_GITHUB_TOKEN="pat"
./.github/scripts/collect-status.sh
```

---

## Action Versions (Pinned)

| Action | Reference | Policy |
|--------|-----------|--------|
| `actions/checkout` | `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1) | Full SHA for security |
| `actions/upload-pages-artifact` | `@v4` | Major version |
| `actions/deploy-pages` | `@v4` | Major version |

---

## Documentation Updates

When changing workflows:
- `docs/deployment/GITHUB_ACTIONS.md`
- `docs/deployment/DEPLOYMENT_GUIDE.md`
- `docs/deployment/ENVIRONMENT_CONFIGURATION.md`
- `docs/architecture/DATA_FLOW.md` (if collector changes)
- `docs/operations/TROUBLESHOOTING.md`

---

## Anti-Patterns

- ❌ Using `GITHUB_TOKEN` for cross-repo API calls (use PAT)
- ❌ Not pinning `actions/checkout` SHA
- ❌ Hardcoding tokens in workflow
- ❌ `cancel-in-progress: true` for collector (let it finish)
- ❌ Forgetting `permissions` block
- ❌ Not testing workflow changes before merge