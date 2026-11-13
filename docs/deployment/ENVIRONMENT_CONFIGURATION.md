# Environment Configuration

This document describes all environment variables, secrets, and configuration settings required for the Athmetry System Status system to operate.

---

## Repository Secrets (GitHub Actions)

Configured in: **Repository Settings → Secrets and variables → Actions**

| Secret Name | Type | Description | Required For |
|-------------|------|-------------|--------------|
| `ATHMETRY_GITHUB_TOKEN` | Fine-grained PAT | Authentication for collector to read backend/frontend/system-status repos and write to this repo | `collect-status.yml` |

### ATHMETRY_GITHUB_TOKEN Details

**Token Type**: Fine-grained Personal Access Token (not classic PAT)

**Resource Owner**: `athmetry` (organization)

**Repository Access**: 
- `athmetry/athmetry-backend` — Read access
- `athmetry/athmetry-frontend` — Read access  
- `athmetry/athmetry-system-status` — Read and Write access

**Permissions**:
| Repository | Permission | Access |
|------------|------------|--------|
| athmetry-backend | Actions | Read |
| athmetry-backend | Contents | Read |
| athmetry-frontend | Actions | Read |
| athmetry-frontend | Contents | Read |
| athmetry-system-status | Actions | Read |
| athmetry-system-status | Contents | Read & Write |

**Expiration**: Set to 1 year (max for fine-grained PAT). Rotate before expiry.

**Creation Steps**:
1. Go to: https://github.com/settings/tokens?type=beta
2. Click "Generate new token" → "Fine-grained token"
3. Name: `athmetry-system-status-collector`
4. Resource owner: `athmetry`
5. Repository access: Select the 3 repos above
6. Permissions: Set as per table above
7. Generate → Copy token immediately
8. Add to `athmetry-system-status` repo: Settings → Secrets → Actions → New repository secret
   - Name: `ATHMETRY_GITHUB_TOKEN`
   - Value: [paste token]

**Rotation**: When token expires or permissions change:
1. Generate new token with same permissions
2. Update secret in repository settings
3. Next collector run (within 5 min) will use new token

---

## Repository Variables (GitHub Actions)

Configured in: **Repository Settings → Secrets and variables → Actions → Variables**

| Variable Name | Value | Description |
|---------------|-------|-------------|
| (none currently) | — | No repository variables defined |

**Note**: Configuration for monitored repos and branch is in `.github/scripts/collect-status.sh`, not in Actions variables.

---

## Workflow Environment Variables

### collect-status.yml

| Variable | Source | Scope | Value |
|----------|--------|-------|-------|
| `ATHMETRY_GITHUB_TOKEN` | Secret | Step `Collect status data` | Injected as `env.ATHMETRY_GITHUB_TOKEN` |
| `GITHUB_TOKEN` | Built-in | Step `Commit and push status data` | Auto-injected as `env.GITHUB_TOKEN` |
| `GITHUB_REPOSITORY` | Built-in | Step `Commit and push status data` | `athmetry/athmetry-system-status` |

**Collector Script Environment** (inside `collect-status.sh`):
```bash
export GH_TOKEN="$ATHMETRY_GITHUB_TOKEN"
export GH_REPO="$REPO_OWNER/athmetry-system-status"
# REPO_OWNER defaults to "athmetry"
# BRANCH defaults to "main"
```

### deploy-pages.yml

| Variable | Source | Scope | Value |
|----------|--------|-------|-------|
| `GH_TOKEN` | Built-in `github.token` | Job `gate`, step `Evaluate quality gate` | Read-only API access for gate queries |
| `REPO` | `github.repository` | Job `gate` | `athmetry/athmetry-system-status` |
| `TRIGGER_WORKFLOW` | `github.event.workflow_run.name` | Job `gate` | `Security Scan` or `Collect System Status` |
| `TRIGGER_CONCLUSION` | `github.event.workflow_run.conclusion` | Job `gate` | `success`, `failure`, `cancelled`, … |
| `TRIGGER_BRANCH` | `github.event.workflow_run.head_branch` | Job `gate` | `main` |
| `GITHUB_TOKEN` | Built-in | Job `deploy` | OIDC token for Pages deploy (implicit) |

No repository secrets are required. The gate uses the built-in read-only token
to query workflow runs and compare commits.

### security-scan.yml

| Variable | Source | Scope | Value |
|----------|--------|-------|-------|
| `GITLEAKS_VERSION` | Step env | `Scan tracked files for secrets` | `8.30.1` |
| `GITLEAKS_SHA256` | Step env | `Scan tracked files for secrets` | SHA-256 of the official Linux x64 release archive |
| `GITHUB_TOKEN` | Built-in | Actions check-out | Read-only repository access (`permissions: contents: read`) |

No repository secrets are required. zizmor is pinned by action SHA and version
(`1.32.0`); its policy is read from `.github/zizmor.yml`.

---

## Repository Settings (GitHub UI)

### Pages Configuration

**Location**: Settings → Pages → Build and deployment

| Setting | Value | Notes |
|---------|-------|-------|
| Source | GitHub Actions | Required for `deploy-pages.yml` |
| Branch | (N/A — managed by workflow) | — |
| Custom domain | (empty) | Reserved for `status.athmetry.com` |

### Actions Permissions

**Location**: Settings → Actions → General

| Setting | Value | Notes |
|---------|-------|-------|
| Actions permissions | Allow all actions | Required for `actions/checkout`, `actions/upload-pages-artifact`, `actions/deploy-pages`, and `zizmorcore/zizmor-action` |
| Workflow permissions | Read and write permissions | Required for collector to commit |
| Allow GitHub Actions to create and approve pull requests | (Unchecked) | Not needed |

All three workflows declare `permissions: contents: read` at the workflow level.
`deploy-pages.yml` grants `pages: write` and `id-token: write` only to its
`deploy` job, and `actions: read` only to its `gate` job. Only the collector
writes to the repository (`contents: write`).

### Branch Protection (Optional, Recommended)

**Location**: Settings → Branches → Branch protection rules

Not currently configured. Recommended for production:

| Rule | Value |
|------|-------|
| Require a pull request before merging | ✅ |
| Require approvals | 1 |
| Dismiss stale PR approvals when new commits are pushed | ✅ |
| Require status checks to pass | ✅ (`Security Scan` once branch protection is configured) |
| Require branches to be up to date before merging | ✅ |
| Require conversation resolution before merging | ✅ |
| Require signed commits | ❌ |
| Require linear history | ✅ |
| Restrict pushes that create files matching a pattern | ❌ |
| Do not allow bypassing the above settings | ✅ (include administrators) |

---

## Local Development Environment

No environment variables required for local development.

### Optional: Local Collector Testing

```bash
# Set PAT for local collector run
export ATHMETRY_GITHUB_TOKEN="your_fine_grained_pat_here"
# Or use gh auth:
gh auth login --with-token < token.txt

# Run collector
./.github/scripts/collect-status.sh
```

### Optional: Local Server

```bash
# No env vars needed
python3 -m http.server 8000
```

---

## Configuration Files

### .github/scripts/collect-status.sh — Configuration Section

```bash
# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
REPO_OWNER="${REPO_OWNER:-athmetry}"
BRANCH="${BRANCH:-main}"
STATUS_FILE="data/status.json"
COLLECTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
MAX_RUNS_PER_WORKFLOW=5

# Repositories to monitor. Add entries here to monitor additional repos.
# Format: "repo_name owner repo" (owner/repo usually the same as name).
MONITORED_REPOS=(
  "athmetry-backend athmetry athmetry-backend"
  "athmetry-frontend athmetry athmetry-frontend"
  "athmetry-system-status athmetry athmetry-system-status"
)
```

**Self-monitoring**: The collector's own `collect-status.yml` is included for `athmetry-system-status`; its most recent completed run is reported so the card is not pinned to "Running". All three workflows in that repository (`collect-status.yml`, `deploy-pages.yml`, `security-scan.yml`) are included.

**To Modify**:
- **Add repo**: Add line to `MONITORED_REPOS` array
- **Change branch**: Change `BRANCH` variable or override via workflow `env`
- **Change owner**: Change `REPO_OWNER` variable
- **History depth**: Change `MAX_RUNS_PER_WORKFLOW` (currently 5, also used as `per_page`)

### js/app.js — Frontend Configuration

```javascript
const REFRESH_INTERVAL_MS = 60 * 1000;        // Auto-refresh interval (60s)
const THEME_KEY = "athmetry-theme";           // localStorage key
const IP_LOOKUP_TIMEOUT_MS = 5000;            // ipwho.is timeout
const IP_LOOKUP_URL = "https://ipwho.is/";   // IP lookup endpoint (CORS-enabled)
const REFRESH_TIMEOUT_MS = 10000;             // Manual refresh timeout
```

### js/api.js — API Configuration

```javascript
const STATUS_JSON_PATH = "data/status.json";
const STALE_THRESHOLD_MS = 10 * 60 * 1000;    // 10 minutes
```

### css/style.css — Theme Configuration

All theme configuration via CSS custom properties in `:root` and `[data-theme="dark"]`.

---

## Monitoring Repository Access Requirements

The monitored repositories (`athmetry-backend`, `athmetry-frontend`, `athmetry-system-status`) must have:

1. **GitHub Actions enabled** (Settings → Actions → General → Allow all actions)
2. **Workflows on `main` branch** that the collector can read
3. **No additional permissions needed** — collector only reads public Actions data via PAT

The monitored repositories do NOT need:
- Any changes to their workflows
- Any secrets added
- Any branch protection changes

---

## Custom Domain Configuration (Future)

When ready to configure `status.athmetry.com`:

1. **Purchase domain** (if not owned)
2. **Add DNS records**:
   - `CNAME` → `athmetry.github.io` (for `status.athmetry.com`)
   - Or `A` records → GitHub Pages IPs (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153)
3. **Update CNAME file**:
   ```bash
   echo "status.athmetry.com" > CNAME
   git add CNAME && git commit -m "chore: configure custom domain" && git push
   ```
4. **Enable in repo settings**: Settings → Pages → Custom domain → Enter `status.athmetry.com` → Enforce HTTPS
5. **Wait for DNS propagation** (up to 24 hours)

**Important**: Do NOT add domain to CNAME or configure DNS until ready — it will break the default GitHub Pages URL.

---

## Configuration Change Checklist

When changing any configuration:

- [ ] Update relevant documentation (`docs/deployment/ENVIRONMENT_CONFIGURATION.md`)
- [ ] Test locally (if applicable)
- [ ] Push to `main`
- [ ] Verify workflow runs succeed
- [ ] Verify live site works

---

## Secrets Inventory (Audit)

| Secret | Last Rotated | Expires | Rotation Process |
|--------|--------------|---------|------------------|
| `ATHMETRY_GITHUB_TOKEN` | 2026-11 | 2027-11 | Generate new fine-grained PAT, update secret |

**Next Rotation Due**: November 2027 (or earlier if permissions change)