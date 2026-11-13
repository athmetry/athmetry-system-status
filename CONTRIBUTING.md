# Contributing Guide

Thank you for contributing to Athmetry System Status!

---

## Quick Start

1. **Fork** the repository
2. **Clone** your fork
3. **Make changes** locally
4. **Test** thoroughly (see Testing below)
5. **Submit PR** with clear description

---

## Development Setup

```bash
# Clone
git clone https://github.com/your-username/athmetry-system-status.git
cd athmetry-system-status

# Local server
python3 -m http.server 8000
# Open http://localhost:8000/index.html
```

**No build step is required.** Node.js and npm are used only for development tooling (status validator, CI-equivalent linters, Playwright); the site itself has no npm dependencies.

---

## Making Changes

### Before You Start

1. Read `AGENTS.md` — mandatory instructions
2. Read relevant `docs/` files for your change area
3. Check `git log --oneline -10` for recent context
4. Ensure `git status` is clean

### Code Standards

| Language | Standard |
|----------|----------|
| HTML | Semantic, accessible, inline theme script in `<head>` |
| CSS | Mobile-first, CSS variables for all themes, BEM-inspired classes |
| JavaScript | Vanilla ES modules, async/await, XSS-safe (`escapeHtml()`), no frameworks |
| Bash | `set -euo pipefail`, functions before main, jq for JSON |

**Full standards**: `docs/development/CODING_STANDARDS.md`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): brief description

Optional body explaining why.

Ref: #issue-number
```

**Types**: `fix`, `feat`, `chore`, `docs`, `style`, `refactor`, `test`

**Examples**:
```
fix(header): prevent theme toggle flash on load
feat(collector): add support for per-repo branch config
chore(deps): update GitHub Actions to v4
docs(architecture): add DATA_FLOW.md
```

---

## Testing Requirements

**All tests must be executed** — do not claim "tests pass" without running them.

### Mandatory Tests

```bash
# 1. Local server loads without errors
python3 -m http.server 8000
# Verify: no console errors, all resources load

# 2. Static validation (same checks as CI)
for f in js/*.js; do node --check "$f"; done
jq empty data/status.json package.json
node scripts/validate-status-json.js
npx --yes html-validate@11.21.1 --rule void-style:off --rule no-implicit-button-type:off --rule no-trailing-whitespace:off index.html
npx --yes csstree-validator@4.0.1 css/style.css

# 3. Theme system
# - Toggle light ↔ dark
# - Reload → persists
# - No flash on load

# 4. Manual refresh
# - Click Refresh → spinner → success toast
# - Offline → error toast
# - Timeout → timeout toast

# 5. Auto-refresh
# - Wait 65s → Network tab shows status.json request

# 6. Pipeline detail dialog
# - Click a pipeline row on each card
# - Verify jobs, history, and "View on GitHub" URL
# - Close via Cancel / Escape / backdrop

# 7. Responsive (Chrome DevTools)
# Widths: 320, 375, 430, 768, 1024, 1440px
# Each: Light + Dark theme
# Check: NO horizontal overflow

# 8. Workflow syntax (local parse only)
python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml
```

### Test Evidence in PR

Include a test results table:

| Test | Viewports | Themes | Result |
|------|-----------|--------|--------|
| Static validation | N/A | N/A | ✅ |
| Theme toggle | 320, 375, 430, 768, 1024, 1440 | Light, Dark | ✅ |
| Manual refresh | 1440 | Light | ✅ |
| Auto-refresh | 1440 | Light | ✅ (60s verified) |
| Pipeline dialog | 1440 | Both | ✅ |
| Responsive | All 6 | Both | ✅ No overflow |
| Collector (isolated) | N/A | N/A | ✅ |
| Workflows | N/A | N/A | ✅ |

---

## Documentation Updates

**Update docs with every change.** See `AGENTS.md` mapping:

| Change Area | Docs to Update |
|-------------|----------------|
| Frontend UI | `docs/architecture/APPLICATION_ARCHITECTURE.md`, `docs/development/CODING_STANDARDS.md` |
| Collector | `docs/architecture/DATA_FLOW.md`, `docs/operations/TROUBLESHOOTING.md` |
| Workflows | `docs/deployment/GITHUB_ACTIONS.md`, `docs/deployment/DEPLOYMENT_GUIDE.md` |
| JSON schema | `docs/architecture/DATA_FLOW.md` |
| Theme | `docs/architecture/APPLICATION_ARCHITECTURE.md` |
| Deployment | `docs/deployment/DEPLOYMENT_GUIDE.md`, `docs/deployment/ROLLOVER_GUIDE.md` |

---

## Pull Request Checklist

Before submitting:

- [ ] `AGENTS.md` read and followed
- [ ] Relevant `docs/` files read
- [ ] Changes minimal and focused
- [ ] No unrelated refactoring
- [ ] All tests executed (not just "should work")
- [ ] Test results table in PR description
- [ ] Documentation updated
- [ ] `git status` clean (no `.bak`, temp files, debug code)
- [ ] No secrets/tokens in code or docs
- [ ] Commit messages follow conventional format
- [ ] PR title follows conventional format

---

## PR Template

Use the template in `.github/PULL_REQUEST_TEMPLATE.md` — it will appear automatically.

---

## Review Process

1. **Automated**: Workflow syntax validated on push
2. **Manual**: Maintainer reviews code, tests, docs
3. **Feedback**: Address review comments
4. **Merge**: Maintainer merges (or you with authorization)
5. **Deploy**: Automatic via `deploy-pages.yml` on merge to `main`

---

## Release Boundary

**Contributors do not deploy.** 

- PR merged → `deploy-pages.yml` runs automatically
- Maintainer verifies production
- No manual deployment steps needed

---

## Getting Help

- Check `docs/operations/TROUBLESHOOTING.md`
- Check `docs/operations/DEBUGGING_GUIDE.md`
- Open issue for questions

---

## Code of Conduct

- Be respectful and constructive
- Focus on technical merit
- No harassment, discrimination, or unprofessional behavior
- Report violations to repository owners