# Documentation Maintenance

Guidelines for keeping documentation accurate, current, and useful.

---

## Documentation Principles

1. **Documentation reflects reality** — Not aspirations, not outdated designs
2. **Single source of truth** — No duplicate content across files
3. **Update with code** — Every implementation change updates relevant docs
4. **Factual tone** — "Does X" not "Should do X" or "Will do X"
5. **Actionable** — Specific file paths, commands, thresholds

---

## Documentation Structure

```
docs/
├── README.md                    # This file (index)
├── architecture/
│   ├── SYSTEM_OVERVIEW.md       # High-level architecture, data flow, tech stack
│   ├── APPLICATION_ARCHITECTURE.md  # Frontend modules, theme, responsive, components
│   ├── DATA_FLOW.md             # Collector APIs, JSON schema, normalization, timing
│   └── ARCHITECTURE_DECISIONS.md    # ADRs with rationale and trade-offs
├── development/
│   ├── LOCAL_SETUP.md           # Prerequisites, quick start, local collector, debugging
│   ├── CODING_STANDARDS.md      # JS/CSS/HTML/Bash conventions, commit messages
│   ├── TESTING_GUIDE.md         # Pre-release checklist, regression tests per change type
│   └── DEBUGGING_GUIDE.md       # Common issues, console commands, escalation
├── deployment/
│   ├── DEPLOYMENT_GUIDE.md      # Complete lifecycle, scenarios, verification, rollback
│   ├── GITHUB_ACTIONS.md        # Workflow reference, secrets, triggers, debugging
│   ├── ENVIRONMENT_CONFIGURATION.md  # Secrets, variables, settings, custom domain
│   └── ROLLOVER_GUIDE.md        # Rollback procedures, decision tree, verification
├── operations/
│   ├── MONITORING.md            # Metrics, dashboards, health checks, runbooks
│   ├── INCIDENT_RESPONSE.md     # Severity levels, process, runbooks, communication
│   ├── TROUBLESHOOTING.md       # Symptom-based diagnosis, fixes, commands
│   └── KNOWN_LIMITATIONS.md     # Documented boundaries, accepted trade-offs
└── agent-context/
    ├── PROJECT_CONTEXT.md       # Mental map, critical files, gotchas, debug shortcuts
    ├── AGENT_WORKFLOW.md        # 8-step mandatory process with checklists
    ├── CHANGE_IMPACT_MAP.md     # Change area → files, tests, docs cross-reference
    └── DOCUMENTATION_MAINTENANCE.md  # This file
```

---

## Update Triggers

### Mandatory Documentation Updates

| Trigger | Docs to Update |
|---------|----------------|
| New CSS variable added | `APPLICATION_ARCHITECTURE.md` (theme variables table) |
| CSS variable removed/renamed | `APPLICATION_ARCHITECTURE.md`, `CODING_STANDARDS.md` |
| New media query breakpoint | `APPLICATION_ARCHITECTURE.md` (responsive section), `TESTING_GUIDE.md` |
| JS module added/removed | `APPLICATION_ARCHITECTURE.md` (module structure), `PROJECT_CONTEXT.md` |
| JS function signature changed | `APPLICATION_ARCHITECTURE.md` (data flow), `CHANGE_IMPACT_MAP.md` |
| New status value | `APPLICATION_ARCHITECTURE.md` (status colors), `DATA_FLOW.md` (derivation) |
| JSON schema field added | `DATA_FLOW.md` (schema reference), `CHANGE_IMPACT_MAP.md` |
| JSON schema breaking change | `DATA_FLOW.md` (version bump), `ARCHITECTURE_DECISIONS.md` (new ADR) |
| Collector API call changed | `DATA_FLOW.md` (source APIs), `GITHUB_ACTIONS.md` (workflow) |
| Collector schedule changed | `GITHUB_ACTIONS.md`, `DEPLOYMENT_GUIDE.md`, `SYSTEM_OVERVIEW.md` |
| New monitored repo | `DATA_FLOW.md`, `SYSTEM_OVERVIEW.md`, `ENVIRONMENT_CONFIGURATION.md` |
| Workflow YAML changed | `GITHUB_ACTIONS.md`, `DEPLOYMENT_GUIDE.md` |
| CI / security workflow changed | `GITHUB_ACTIONS.md`, `TESTING_GUIDE.md` |
| Release version changed | `package.json` only; verify footer renders without hardcoding |
| Pages deployment changed | `DEPLOYMENT_GUIDE.md`, `GITHUB_ACTIONS.md`, `ROLLOVER_GUIDE.md` |
| Secret/variable added | `ENVIRONMENT_CONFIGURATION.md` (secrets inventory) |
| New runbook added | `INCIDENT_RESPONSE.md`, `TROUBLESHOOTING.md` |
| New limitation discovered | `KNOWN_LIMITATIONS.md` |
| New debugging technique | `DEBUGGING_GUIDE.md` |

### Periodic Reviews (Quarterly)

- [ ] All file paths in docs exist in repository
- [ ] All commands in docs execute successfully
- [ ] Workflow names match `.github/workflows/*.yml`
- [ ] Environment variable names match implementation
- [ ] Internal links work (no broken anchors)
- [ ] No secrets exposed
- [ ] `AGENTS.md` quick reference table current
- [ ] `CHANGE_IMPACT_MAP.md` reflects current architecture
- [ ] `KNOWN_LIMITATIONS.md` still accurate
- [ ] `README.md` (root) matches reality

---

## Documentation Standards

### Writing Style

| Do | Don't |
|----|-------|
| "The collector runs every 5 minutes" | "The collector runs after Backend events with a 30-minute fallback" |
| "Set `BRANCH` in the script" | "You should set the branch" |
| "Run `jq . data/status.json`" | "Validate the JSON somehow" |
| "See `DATA_FLOW.md` for schema" | "Refer to the architecture docs" |
| "Fixed in commit abc123" | "Recently fixed" |

### Formatting

- **File paths**: `path/to/file` (backticks)
- **Commands**: `command` (backticks)
- **Code references**: `functionName()`, `ClassName`, `CONSTANT` (backticks)
- **UI elements**: **Bold** for buttons, labels
- **Paths in tables**: `relative/path` (backticks)
- **Headers**: `# H1`, `## H2`, `### H3` — consistent hierarchy
- **Tables**: Pipe-aligned, header row, consistent columns

### Cross-References

- Use relative links: `[Data Flow](../architecture/DATA_FLOW.md)`
- Anchor links: `[Status Derivation](#status-derivation)`
- External links: Full URL with description

---

## Documentation Validation

### Manual Validation Checklist (Run Before Reporting Done)

```bash
# 1. Check all documented file paths exist
ls index.html css/style.css js/api.js js/app.js js/dashboard.js \
   data/status.json package.json scripts/validate-status-json.js \
   .github/workflows/collect-status.yml \
   .github/workflows/deploy-pages.yml \
   .github/workflows/security-scan.yml \
   .github/zizmor.yml .github/scripts/collect-status.sh

# 2. Validate commands work
python3 -m http.server 8000 &
sleep 2
curl -s http://localhost:8000/ | head -5
kill %1

jq . data/status.json > /dev/null && echo "JSON valid"
node scripts/validate-status-json.js

# 3. Check workflow YAML parses locally (do not push or dispatch)
ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' \
  .github/workflows/*.yml .github/zizmor.yml

# 4. Check internal links (manual)
# Open each .md file, click internal links
```

### Automated Validation

Static validation (JS/JSON/schema/HTML/CSS/assets) is run locally before a push;
it is not a workflow — the repository intentionally runs only three. Documentation
links and YAML linting are still manual; possible future additions:
- `markdown-link-check` for broken links
- `yamllint` for workflow syntax
- Custom script to verify documented file paths exist

---

## Documentation Debt Tracking

### Known Gaps (As of Phase 1 Completion)

| Gap | Priority | Owner | Target |
|-----|----------|-------|--------|
| No automated doc link validation | Low | — | Future |
| No versioned docs for releases | Low | — | Future |
| No API reference (internal modules) | Medium | — | When modules grow |
| No architecture diagram source (PlantUML/Mermaid) | Low | — | Future |

### How to Add a New Doc

1. Determine correct category (`architecture/`, `development/`, `deployment/`, `operations/`, `agent-context/`)
2. Create file with clear purpose
3. Update this file's structure table
4. Add cross-references from related docs
5. Add to validation checklist

---

## Documentation Ownership

| Document | Primary Owner | Review Cadence |
|----------|---------------|----------------|
| `AGENTS.md` | All agents | Every change |
| `README.md` | Repository owner | Quarterly |
| `architecture/*.md` | Architecture changes | On change |
| `development/*.md` | Development changes | On change |
| `deployment/*.md` | Deployment changes | On change |
| `operations/*.md` | Incidents/reviews | Quarterly + on incident |
| `agent-context/*.md` | Agent workflow changes | On change |

---

## Quick Reference: Doc Update Checklist for Common Changes

```
□ CSS variable added/changed → APPLICATION_ARCHITECTURE.md
□ New breakpoint → APPLICATION_ARCHITECTURE.md + TESTING_GUIDE.md
□ JS module/function → APPLICATION_ARCHITECTURE.md + PROJECT_CONTEXT.md
□ Status value/color → APPLICATION_ARCHITECTURE.md + DATA_FLOW.md
□ JSON schema → DATA_FLOW.md (version if breaking)
□ Collector API/schedule → DATA_FLOW.md + GITHUB_ACTIONS.md + SYSTEM_OVERVIEW.md
□ New repo monitored → DATA_FLOW.md + SYSTEM_OVERVIEW.md + ENVIRONMENT_CONFIGURATION.md
□ Workflow changed → GITHUB_ACTIONS.md + DEPLOYMENT_GUIDE.md
□ Deploy process → DEPLOYMENT_GUIDE.md + ROLLOVER_GUIDE.md
□ Secret added → ENVIRONMENT_CONFIGURATION.md
□ New runbook → INCIDENT_RESPONSE.md + TROUBLESHOOTING.md
□ New limitation → KNOWN_LIMITATIONS.md
□ Debug technique → DEBUGGING_GUIDE.md
□ Agent workflow → AGENT_WORKFLOW.md + CHANGE_IMPACT_MAP.md
□ Any user-facing change → README.md (root)
```