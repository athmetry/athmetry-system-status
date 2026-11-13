## Summary

**What changed**: 
<!-- One-line description of the change -->

**Why**: 
<!-- Reason: bug fix, feature, refactor, docs, etc. -->

**Related issue**: 
<!-- Link to issue if applicable: Fixes #123 -->

---

## Change Type

- [ ] Bug fix (`fix`)
- [ ] New feature (`feat`)
- [ ] Refactor (`refactor`)
- [ ] Documentation (`docs`)
- [ ] Style/formatting (`style`)
- [ ] Chore/maintenance (`chore`)
- [ ] Test (`test`)

---

## Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `path/to/file` | fix/feat/chore/docs/style | What changed |

---

## Testing Performed

**All tests executed (not assumed)**:

| Test Area | Viewports Tested | Themes Tested | Result | Notes |
|-----------|------------------|---------------|--------|-------|
| Static validation | N/A | N/A | ✅/❌ | JS/JSON/schema/HTML/CSS |
| Theme toggle | e.g., 320, 375, 430, 768, 1024, 1440 | Light, Dark | ✅/❌ | |
| Manual refresh | | | ✅/❌ | |
| Auto-refresh | | | ✅/❌ | 60s interval verified |
| Pipeline detail dialog | | | ✅/❌ | Jobs, history, GitHub URL |
| Responsive | All 6 | Both | ✅/❌ | No horizontal overflow |
| JSON validation | N/A | N/A | ✅/❌ | `jq` + `scripts/validate-status-json.js` |
| Collector (if changed) | N/A | N/A | ✅/❌ | Isolated run; data restored |
| Workflows (if changed) | N/A | N/A | ✅/❌ | Local YAML parse/lint |

**Browser console**: Clean (no errors) — ✅/❌

**Print preview**: Interactive elements hidden — ✅/❌

---

## Documentation Updated

- [ ] `docs/architecture/APPLICATION_ARCHITECTURE.md`
- [ ] `docs/architecture/DATA_FLOW.md`
- [ ] `docs/architecture/ARCHITECTURE_DECISIONS.md` (new ADR if applicable)
- [ ] `docs/development/LOCAL_SETUP.md`
- [ ] `docs/development/CODING_STANDARDS.md`
- [ ] `docs/development/TESTING_GUIDE.md`
- [ ] `docs/development/DEBUGGING_GUIDE.md`
- [ ] `docs/deployment/DEPLOYMENT_GUIDE.md`
- [ ] `docs/deployment/GITHUB_ACTIONS.md`
- [ ] `docs/deployment/ENVIRONMENT_CONFIGURATION.md`
- [ ] `docs/deployment/ROLLOVER_GUIDE.md`
- [ ] `docs/operations/MONITORING.md`
- [ ] `docs/operations/INCIDENT_RESPONSE.md`
- [ ] `docs/operations/TROUBLESHOOTING.md`
- [ ] `docs/operations/KNOWN_LIMITATIONS.md`
- [ ] `docs/agent-context/PROJECT_CONTEXT.md`
- [ ] `docs/agent-context/AGENT_WORKFLOW.md`
- [ ] `docs/agent-context/CHANGE_IMPACT_MAP.md`
- [ ] `docs/agent-context/DOCUMENTATION_MAINTENANCE.md`
- [ ] `AGENTS.md` (quick reference table if file paths changed)
- [ ] `README.md` (if user-facing change)
- [ ] `CHANGELOG.md` (added to [Unreleased])

---

## Screenshots (if UI change)

<!-- Drag and drop screenshots here for visual changes -->
| Before | After |
|--------|-------|
| ![before](url) | ![after](url) |

---

## Checklist

- [ ] `AGENTS.md` read and followed
- [ ] Relevant `docs/` files read for change area
- [ ] Changes minimal and focused (no unrelated refactoring)
- [ ] No debug code (`console.log`, `debugger`, `alert`)
- [ ] No `.bak`, `.tmp`, `.swp`, `~` files
- [ ] No `node_modules`, `dist`, `build` directories
- [ ] No secrets, tokens, credentials in code or docs
- [ ] No commented-out code blocks
- [ ] CSS variables used (no hardcoded colors)
- [ ] XSS-safe: `escapeHtml()` for dynamic content
- [ ] Accessibility: ARIA labels, focus-visible, keyboard nav
- [ ] Mobile-first responsive tested
- [ ] Both themes tested
- [ ] Commit messages follow conventional format
- [ ] PR title follows conventional format
- [ ] Documentation updated per `AGENTS.md` mapping
- [ ] `git status` clean

---

## Deployment Notes

- On merge to `main`, `security-scan.yml` runs; when it succeeds, `deploy-pages.yml` deploys the validated revision
- Collector commits also trigger deployment, but only because the revision differs from the last validated one solely by `data/status.json`
- Deployment is blocked for unvalidated code changes, failed/cancelled runs, pull requests and duplicate deploys
- No manual deployment steps are required (and manual dispatch is intentionally disabled)
- Live at: https://athmetry.github.io/athmetry-system-status/

---

## Reviewer Guide

1. Verify tests actually executed (not just checked)
2. Check `git diff` for accidental changes
3. Verify documentation matches implementation
4. Confirm no secrets exposed
5. Test locally if significant UI change
6. Approve or request changes

---

**By submitting this PR, I confirm I have read `AGENTS.md` and `CONTRIBUTING.md` and followed the mandatory workflow.**