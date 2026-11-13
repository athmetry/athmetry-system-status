# Local Setup

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Git | Any recent | Version control |
| Python 3 | 3.8+ | Local static server (`http.server`) |
| Node.js | 20+ | Run `scripts/validate-status-json.js` and CI-equivalent tooling (optional) |
| gh CLI | 2.0+ | Run collector locally (optional) |
| jq | 1.6+ | JSON processing for collector and validation (optional) |

**No build step is required.** Node.js and npm are only needed for development
tooling (`scripts/validate-status-json.js`, `html-validate`,
`csstree-validator`, `@playwright/test`). The browser application has no npm
dependencies and is served directly from the repository root.

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/athmetry/athmetry-system-status.git
cd athmetry-system-status

# Start local server (serves from repo root)
python3 -m http.server 8000

# Open in browser
open http://localhost:8000/index.html
```

The dashboard will load. Since `data/status.json` contains the last committed data, you'll see real pipeline status.

---

## Running the Collector Locally

The collector script requires authentication and GitHub CLI.

```bash
# 1. Install gh CLI and jq (if not present)
# macOS: brew install gh jq
# Linux: apt-get install gh jq / dnf install gh jq

# 2. Authenticate gh CLI with a fine-grained PAT
# Create token at: https://github.com/settings/tokens?type=beta
# Permissions needed:
#   - Read: Actions, Contents on athmetry/athmetry-backend
#   - Read: Actions, Contents on athmetry/athmetry-frontend
#   - Read: Actions on athmetry/athmetry-system-status
#   - Read/Write: Contents on athmetry/athmetry-system-status
gh auth login --with-token < your_token.txt
# Or: export GH_TOKEN="your_pat_here"

# 3. Run collector
cd athmetry-system-status
./.github/scripts/collect-status.sh

# 4. Verify output
cat data/status.json | jq .
```

**Note**: The local collector will write to `data/status.json` but **will not commit/push** (the commit/push logic is in the GitHub Actions workflow, not the script).

---

## Validating Changes

### HTML/CSS/JS Changes

1. Make changes to `index.html`, `css/style.css`, `js/*.js`
2. Reload `http://localhost:8000/index.html`
3. Check browser console for errors (F12 → Console)
4. Test theme toggle, manual refresh, and pipeline detail dialog
5. Test responsive: DevTools device toolbar at 320, 375, 430, 768, 1024, 1440px

### JSON Validation

```bash
# Validate data/status.json syntax
jq . data/status.json > /dev/null && echo "Valid JSON"

# Check schema version
jq .schemaVersion data/status.json

# Validate schema and data contract
node scripts/validate-status-json.js
```

### Workflow Syntax Validation

```bash
# Parse all workflow YAML
python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" \
  .github/workflows/*.yml

# If installed
actionlint
zizmor .github/workflows/
```

Do not push to a test branch or dispatch workflows to validate syntax; local
parsing and linting is sufficient and stays inside the release boundary.

---

## Development Workflow

### Making a Change

1. **Understand**: Read `AGENTS.md` and relevant `docs/` files
2. **Inspect**: Look at existing implementation in `js/`, `css/`, `index.html`
3. **Edit**: Modify files directly (no build step)
4. **Test locally**: `python3 -m http.server 8000` → verify in browser
5. **Validate**: Run checks from "Validating Changes" above
6. **Document**: Update relevant `docs/` files (see `AGENTS.md` table)
7. **Clean**: `git status` — ensure no `.bak`, temp files, debug code
8. **Commit**: `git add -A && git commit -m "type(scope): description"`
9. **Report**: Summarize changes, tests run, limitations (per `AGENTS.md` Step 7)

### Adding a New Repository to Monitor

1. Edit `.github/scripts/collect-status.sh`
2. Add to `MONITORED_REPOS` array:
   ```bash
   MONITORED_REPOS=(
     "athmetry-backend athmetry athmetry-backend"
     "athmetry-frontend athmetry athmetry-frontend"
     "athmetry-system-status athmetry athmetry-system-status"
     "new-repo athmetry new-repo"
   )
   ```
3. Add a repository card to `index.html`, register its key in `REPO_KEYS` in
   `js/dashboard.js`, and assign a product tag.
4. Ensure `ATHMETRY_GITHUB_TOKEN` has read access (Actions, Contents) to the new repo
5. Commit and push to `main`
6. Collector picks up on next run (or trigger manually via Actions UI)
7. Frontend renders the new card only after steps 3 and 6 are both complete

**Important**: cards are not created dynamically from arbitrary repository
names. `renderDashboard()` only renders repositories whose `repo.name` exists in
`REPO_KEYS`, because each card's DOM is authored in `index.html`.

### Changing Monitored Branch

Currently: All repos use `BRANCH="${BRANCH:-main}"` (single variable).

To change: Edit `BRANCH` variable in `.github/scripts/collect-status.sh` or set via workflow `env`.

---

## File Modification Guide

| File | Purpose | Safe to Modify? | Notes |
|------|---------|-----------------|-------|
| `index.html` | Structure, content, inline theme script | ✅ | Keep inline theme script in `<head>` |
| `css/style.css` | All styling, theme variables, responsive | ✅ | Maintain CSS variable organization |
| `js/api.js` | Data fetching, caching, stale detection | ✅ | Pure logic, no DOM |
| `js/app.js` | Bootstrap, lifecycle, UI handlers | ✅ | Theme, refresh, IP lookup, release version |
| `js/dashboard.js` | DOM rendering only | ✅ | No side effects, pure functions |
| `data/status.json` | **Generated by collector** | ❌ | Do not edit manually (see notes in file) |
| `scripts/validate-status-json.js` | Status data-contract validator | ✅ | Keep in sync with schema |
| `.github/scripts/collect-status.sh` | Collector logic | ✅ | Bash + gh + jq; test in isolation |
| `.github/workflows/collect-status.yml` | Collector scheduling, auth | ✅ | Pinned action SHAs |
| `.github/workflows/deploy-pages.yml` | Quality-gated Pages deployment | ✅ | Rarely needs changes |
| `.github/workflows/security-scan.yml` | gitleaks + zizmor scanning | ✅ | Keep tool versions and checksums pinned |
| `.github/zizmor.yml` | Zizmor policy | ✅ | Update with workflow changes |
| `package.json` | Dev tooling + release version | ✅ | `version` drives the footer label |
| `assets/brand/*` | Logo variants | ✅ | Maintain light/dark pairs |
| `CNAME` | Custom domain | ⚠️ | Keep empty until domain ready |
| `README.md` | Project documentation | ✅ | Keep accurate |

---

## Common Tasks

### Update Theme Colors

Edit CSS variables in `css/style.css`:

```css
:root {
  --color-blue: #007bff;        /* Light theme primary */
  --color-success: #16a34a;     /* Light theme success */
  /* ... */
}

[data-theme="dark"] {
  --color-blue: #4da8ff;        /* Dark theme primary */
  --color-success: #4ade80;     /* Dark theme success */
  /* ... */
}
```

### Add a New Breakpoint

Add media query block in `css/style.css` under "Responsive" section:

```css
@media (min-width: 500px) and (max-width: 600px) {
  /* Custom rules */
}
```

### Change Auto-Refresh Interval

Edit `js/app.js`:

```javascript
const REFRESH_INTERVAL_MS = 60 * 1000; // Change to desired milliseconds
```

### Change Stale Threshold

Edit `js/api.js`:

```javascript
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // Change to desired milliseconds
```

---

## Debugging Tips

### Browser Console

- **Network tab**: Watch `data/status.json?t=...` requests every 60s
- **Console**: Theme init logs, fetch errors, IP lookup failures
- **Application tab**: Check `localStorage.athmetry-theme`

### Collector Debugging

```bash
# Run with verbose output
bash -x .github/scripts/collect-status.sh

# Test individual API calls
gh api "/repos/athmetry/athmetry-backend/actions/workflows" --jq '.total_count'
gh api "/repos/athmetry/athmetry-backend/actions/workflows/<workflow_id>/runs?branch=main&per_page=5" --jq '.workflow_runs[0]'
```

**Warning**: running the collector overwrites `data/status.json` in the working
tree. Back it up first and restore it after testing. The script does not commit
or push.

### GitHub Actions Debugging

- Go to repository → Actions → select workflow run
- Expand steps to see logs
- Collector logs show API responses (truncated)
- Deploy logs show Pages URL

---

## IDE/Editor Recommendations

- **VS Code**: Extensions: "Live Server" (optional), "ESLint" (not configured), "Prettier" (not configured)
- **No formatting enforced**: Use your preference; consistency within file matters
- **No TypeScript**: Plain JS with JSDoc comments where helpful