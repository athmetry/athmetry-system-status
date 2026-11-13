# Agent Workflow

Mandatory process for every AI agent working in this repository. This expands on the workflow in `AGENTS.md`.

---

## Overview

```
┌─────────────┐
│ 1. UNDERSTAND  │──▶ Read AGENTS.md, relevant docs, inspect code, check git status
└─────────────┘
       │
       ▼
┌─────────────┐
│ 2. PLAN      │──▶ Identify files, dependencies, regressions, tests, doc updates
└─────────────┘
       │
       ▼
┌─────────────┐
│ 3. IMPLEMENT │──▶ Follow conventions, avoid duplication, preserve compatibility
└─────────────┘
       │
       ▼
┌─────────────┐
│ 4. TEST      │──▶ Execute tests, verify responsive, check console/network
└─────────────┘
       │
       ▼
┌─────────────┐
│ 5. REVIEW    │──▶ Full git diff, no temp files, no broken links, no feature loss
└─────────────┘
       │
       ▼
┌─────────────┐
│ 6. DOCUMENT  │──▶ Update relevant docs/ files
└─────────────┘
       │
       ▼
┌─────────────┐
│ 7. REPORT    │──▶ What, why, files, test results, limitations, risks, readiness
└─────────────┘
       │
       ▼
┌─────────────┐
│ 8. BOUNDARY  │──▶ STOP. Await user authorization for commit/push/deploy.
└─────────────┘
```

---

## Step 1: UNDERSTAND

### Required Reading

1. **`AGENTS.md`** — Mandatory entry point, safety rules, quick reference
2. **Relevant `docs/` files** — Based on change area:
   - Frontend/UI → `docs/architecture/APPLICATION_ARCHITECTURE.md`, `docs/development/CODING_STANDARDS.md`
   - Collector → `docs/architecture/DATA_FLOW.md`, `docs/operations/TROUBLESHOOTING.md`
   - Workflows → `docs/deployment/GITHUB_ACTIONS.md`, `docs/deployment/DEPLOYMENT_GUIDE.md`
   - Data schema → `docs/architecture/DATA_FLOW.md`
   - Theme → `docs/architecture/APPLICATION_ARCHITECTURE.md`
   - Deployment → `docs/deployment/DEPLOYMENT_GUIDE.md`
3. **Implementation files** — Inspect actual code (see `PROJECT_CONTEXT.md` priority list)
4. **Git status** — `git status`, `git log --oneline -10`

### Questions to Answer Before Proceeding

- [ ] What is the current behavior?
- [ ] What files implement this behavior?
- [ ] What are the dependencies (CSS vars, JS modules, data fields)?
- [ ] What could break? (regressions)
- [ ] What tests exist? (manual only — see TESTING_GUIDE.md)
- [ ] What docs need updating?

---

## Step 2: PLAN

### Create a Plan Document (Mental or Written)

```
## Change Plan

**Objective**: [One sentence]

**Files to Modify**:
- [ ] file1 — reason
- [ ] file2 — reason

**Dependencies Affected**:
- CSS variables: [list]
- JS modules: [list]
- Data schema: [list]
- Workflows: [list]

**Regression Risks**:
- [Risk 1] — mitigation
- [Risk 2] — mitigation

**Tests to Run**:
- [ ] Local server loads
- [ ] Theme toggle (both themes)
- [ ] Manual refresh (success/error/timeout)
- [ ] Auto-refresh (60s)
- [ ] Pipeline detail dialog (jobs, history, GitHub URL)
- [ ] Responsive: 320, 375, 430, 768, 1024, 1440px (both themes)
- [ ] JSON validation + schema contract
- [ ] Workflow YAML parses locally (no dispatch)

**Docs to Update**:
- [ ] docs/architecture/...
- [ ] docs/development/...
- [ ] docs/deployment/...
- [ ] docs/operations/...
- [ ] docs/agent-context/...
```

---

## Step 3: IMPLEMENT

### Coding Conventions (Enforced)

| Rule | Reference |
|------|-----------|
| No hardcoded colors — use CSS variables | `CODING_STANDARDS.md` |
| No framework dependencies | `ARCHITECTURE_DECISIONS.md` (ADR-005) |
| Vanilla ES modules only | `APPLICATION_ARCHITECTURE.md` |
| XSS-safe: `escapeHtml()` for dynamic content | `dashboard.js`, `CODING_STANDARDS.md` |
| Accessibility: ARIA, focus-visible, keyboard | `CODING_STANDARDS.md` |
| Mobile-first responsive | `APPLICATION_ARCHITECTURE.md` |
| No build step — edit and reload | `LOCAL_SETUP.md` |
| Conventional commit messages | `CODING_STANDARDS.md` |

### Implementation Checklist

- [ ] Changes are minimal and focused
- [ ] No unrelated refactoring
- [ ] No debug code (`console.log`, `debugger`)
- [ ] No `.bak`, temp files, `node_modules`
- [ ] CSS variables used for all colors/spacing
- [ ] Dark mode tested (not just light)
- [ ] Mobile breakpoints tested
- [ ] Error handling added for new async operations
- [ ] Timeout handling for new fetches

---

## Step 4: TEST

### Mandatory Test Execution

**Do not claim "tests passed" unless actually executed.**

#### Functional Tests

```bash
# 1. Start local server
python3 -m http.server 8000
# Open http://localhost:8000/index.html

# 2. Verify no console errors (F12 → Console)

# 3. Theme toggle
#    - Click toggle → switches theme
#    - Reload → persists
#    - Check both themes visually

# 4. Manual refresh
#    - Click Refresh → spinner → success toast
#    - Disconnect network → click → error toast
#    - (Simulate timeout) → timeout toast

# 5. Auto-refresh
#    - Wait 65s → Network tab shows status.json request

# 6. Pipeline detail dialog
#    - Click a pipeline row / details button on each card → dialog opens
#    - Jobs, run metadata, and up to 5 history entries render
#    - "View on GitHub" → confirmation → correct run URL
#    - Cancel / Escape / backdrop click → closes

# 7. Responsive (Chrome DevTools device toolbar)
#    Widths: 320, 375, 430, 768, 1024, 1440px
#    Each width: Light theme + Dark theme
#    Check: No horizontal overflow

# 8. Footer visitor info + release version
#    - Shows IP/location or "Unavailable"
#    - Release version matches package.json (major.minor)

# 9. Print preview (Ctrl+P)
#    - Interactive elements hidden
```

#### Data & Collector Tests

```bash
# JSON validation
jq . data/status.json > /dev/null && echo "Valid JSON"
node scripts/validate-status-json.js

# Collector test in isolation — back up production data first
cp data/status.json /tmp/status.before.json
export ATHMETRY_GITHUB_TOKEN="pat"
./.github/scripts/collect-status.sh
node scripts/validate-status-json.js
cp /tmp/status.before.json data/status.json
```

#### Workflow Tests

```bash
# Local YAML parsing only — do not push or dispatch workflows
python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/*.yml
actionlint   # if installed
zizmor .github/workflows/   # if installed
```

### Test Evidence to Report

| Test | Viewports | Themes | Result | Notes |
|------|-----------|--------|--------|-------|
| Theme toggle | All 6 | Both | ✅/❌ | |
| Manual refresh | Desktop | Light | ✅/❌ | |
| Auto-refresh | Desktop | Light | ✅/❌ | 60s verified |
| Pipeline dialog | Desktop | Both | ✅/❌ | |
| Responsive | 320-1440 | Both | ✅/❌ | No overflow |
| Collector (isolated) | N/A | N/A | ✅/❌ | Production data restored |
| JSON valid | N/A | N/A | ✅/❌ | |
| Workflow lint | N/A | N/A | ✅/❌ | |
| Workflows | N/A | N/A | ✅/❌ | |

---

## Step 5: REVIEW

### Git Diff Review Checklist

```bash
# See all changes
git diff

# Check status
git status
```

**Verify**:
- [ ] Only intended files modified
- [ ] No `.bak`, `.tmp`, `.swp`, `~` files
- [ ] No `node_modules`, `dist`, `build` directories
- [ ] No debug code (`console.log`, `debugger`, `alert`)
- [ ] No secrets, tokens, credentials
- [ ] No commented-out code blocks
- [ ] No broken internal links in docs
- [ ] No removed functionality (unless intentional)
- [ ] Commit message follows conventional format

### Documentation Cross-Check

- [ ] `AGENTS.md` quick reference table updated if file paths changed
- [ ] `CHANGE_IMPACT_MAP.md` updated for new change areas
- [ ] Relevant `docs/` files reflect new behavior
- [ ] `README.md` accurate if user-facing change

---

## Step 6: DOCUMENT

### Documentation Update Mapping

| Change Area | Docs to Update |
|-------------|----------------|
| Frontend UI (HTML/CSS/JS) | `APPLICATION_ARCHITECTURE.md`, `CODING_STANDARDS.md`, `TESTING_GUIDE.md` |
| Collector logic | `DATA_FLOW.md`, `TROUBLESHOOTING.md`, `GITHUB_ACTIONS.md` |
| GitHub Actions workflows | `GITHUB_ACTIONS.md`, `DEPLOYMENT_GUIDE.md`, `ENVIRONMENT_CONFIGURATION.md` |
| Status JSON schema | `DATA_FLOW.md` (schema version if breaking) |
| Theme handling | `APPLICATION_ARCHITECTURE.md`, `CODING_STANDARDS.md` |
| Deployment process | `DEPLOYMENT_GUIDE.md`, `ROLLOVER_GUIDE.md` |
| Responsive breakpoints | `APPLICATION_ARCHITECTURE.md`, `TESTING_GUIDE.md` |
| New monitoring target | `SYSTEM_OVERVIEW.md`, `DATA_FLOW.md`, `MONITORING.md` |

### Update Pattern

1. Find existing relevant section
2. Update to reflect new reality
3. Add "Future" or "Note" if intentional limitation
4. Keep tone consistent (factual, not aspirational)

---

## Step 7: REPORT

### Required Report Structure

```markdown
## Summary

**What Changed**: [1-2 sentences]
**Why**: [Reason — bug fix, feature, refactor, etc.]

## Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `path/to/file` | fix/feat/chore/docs/style | What changed |

## Tests Executed

| Test Area | Viewports | Themes | Result | Evidence |
|-----------|-----------|--------|--------|----------|
| [Area] | [List] | [List] | ✅/❌ | [Details] |

## Known Limitations

- [Limitation 1]
- [Limitation 2]

## Remaining Risks

- [Risk 1 — probability/impact]
- [Risk 2 — probability/impact]

## Ready for Review

- [ ] All tests executed and passed
- [ ] Documentation updated
- [ ] Git diff clean
- [ ] No release-blocking issues
- [ ] Awaiting user authorization for commit/push/deploy
```

---

## Step 8: RELEASE BOUNDARY

### Hard Stop Rules

**DO NOT** (without explicit user authorization):

- `git commit`
- `git push`
- `git push --force`
- `git tag`
- `git merge`
- Create/modify GitHub secrets/variables
- Change workflow schedules/triggers
- Trigger workflow runs manually
- Modify GitHub Pages settings
- Modify repository settings (branch protection, etc.)

### What YOU Do

- Implement changes
- Run tests
- Update documentation
- Report results
- **Wait for user instruction**

### What USER Does

- Reviews report
- Authorizes commit/push
- Triggers deployment if needed
- Verifies production

---

## Emergency Procedures

### If You Accidentally Commit/Push

1. Immediately report: "Accidental push: <commit SHA>"
2. User decides: revert, force push, or leave
3. Document in incident log

### If You Find a Secret in Code

1. **Do not commit it**
2. Report immediately
3. User rotates secret
4. Rewrite history if needed (user action)

### If Production Breaks

1. Report: "Production issue detected: <symptom>"
2. Follow INCIDENT_RESPONSE.md
3. User authorizes rollback/fix