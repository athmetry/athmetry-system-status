# Documentation Index

Complete documentation for the Athmetry System Status repository.

---

## Start Here

| Document | Purpose |
|----------|---------|
| [`AGENTS.md`](../AGENTS.md) | **Mandatory entry point** — every AI agent must read this first |
| [`README.md`](../README.md) | Project overview, architecture, setup, troubleshooting |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Contribution guidelines, testing, PR process |

---

## Architecture

| Document | Description |
|----------|-------------|
| [`architecture/SYSTEM_OVERVIEW.md`](architecture/SYSTEM_OVERVIEW.md) | High-level system architecture, data flow, tech stack, security model |
| [`architecture/APPLICATION_ARCHITECTURE.md`](architecture/APPLICATION_ARCHITECTURE.md) | Frontend modules, theme system, responsive design, component details |
| [`architecture/DATA_FLOW.md`](architecture/DATA_FLOW.md) | Collector APIs, JSON schema, normalization, frontend consumption, timing |
| [`architecture/ARCHITECTURE_DECISIONS.md`](architecture/ARCHITECTURE_DECISIONS.md) | 20 Architecture Decision Records (ADRs) with rationale |

---

## Development

| Document | Description |
|----------|-------------|
| [`development/LOCAL_SETUP.md`](development/LOCAL_SETUP.md) | Prerequisites, local server, collector testing, debugging tips |
| [`development/CODING_STANDARDS.md`](development/CODING_STANDARDS.md) | JS/CSS/HTML/Bash conventions, naming, accessibility, commits |
| [`development/TESTING_GUIDE.md`](development/TESTING_GUIDE.md) | Pre-release checklist, regression tests per change type |
| [`development/DEBUGGING_GUIDE.md`](development/DEBUGGING_GUIDE.md) | Symptom-based troubleshooting, console commands, escalation |

---

## Deployment

| Document | Description |
|----------|-------------|
| [`deployment/DEPLOYMENT_GUIDE.md`](deployment/DEPLOYMENT_GUIDE.md) | Complete lifecycle: local → push → Actions → Pages → verification |
| [`deployment/GITHUB_ACTIONS.md`](deployment/GITHUB_ACTIONS.md) | Workflow reference, triggers, permissions, secrets, debugging |
| [`deployment/ENVIRONMENT_CONFIGURATION.md`](deployment/ENVIRONMENT_CONFIGURATION.md) | Secrets, variables, repository settings, custom domain |
| [`deployment/ROLLOVER_GUIDE.md`](deployment/ROLLOVER_GUIDE.md) | Rollback procedures, decision tree, verification, communication |

---

## Operations

| Document | Description |
|----------|-------------|
| [`operations/MONITORING.md`](operations/MONITORING.md) | Metrics, dashboards, health checks, alerting recommendations |
| [`operations/INCIDENT_RESPONSE.md`](operations/INCIDENT_RESPONSE.md) | Severity levels, response process, runbooks, postmortems |
| [`operations/TROUBLESHOOTING.md`](operations/TROUBLESHOOTING.md) | Comprehensive symptom-based diagnosis for all components |
| [`operations/KNOWN_LIMITATIONS.md`](operations/KNOWN_LIMITATIONS.md) | Documented boundaries, accepted trade-offs, future considerations |

---

## Agent Context

| Document | Description |
|----------|-------------|
| [`agent-context/PROJECT_CONTEXT.md`](agent-context/PROJECT_CONTEXT.md) | Mental map, critical files, gotchas, debugging shortcuts |
| [`agent-context/AGENT_WORKFLOW.md`](agent-context/AGENT_WORKFLOW.md) | 8-step mandatory process with detailed checklists |
| [`agent-context/CHANGE_IMPACT_MAP.md`](agent-context/CHANGE_IMPACT_MAP.md) | Change area → files, tests, docs cross-reference table |
| [`agent-context/DOCUMENTATION_MAINTENANCE.md`](agent-context/DOCUMENTATION_MAINTENANCE.md) | Documentation principles, update triggers, validation |

---

## Quick Navigation by Task

| Task | Read These |
|------|------------|
| **New agent onboarding** | `AGENTS.md` → `PROJECT_CONTEXT.md` → `AGENT_WORKFLOW.md` |
| **Fix theme/colors** | `APPLICATION_ARCHITECTURE.md` (theme section) → `css/style.css` |
| **Fix responsive bug** | `APPLICATION_ARCHITECTURE.md` (responsive) → `css/style.css` (media queries) |
| **Change refresh interval** | `APPLICATION_ARCHITECTURE.md` (auto-refresh) → `js/app.js` |
| **Modify collector** | `DATA_FLOW.md` (collector) → `.github/scripts/collect-status.sh` |
| **Change collector schedule** | `GITHUB_ACTIONS.md` → `.github/workflows/collect-status.yml` |
| **Add monitored repo** | `DATA_FLOW.md` (extending) → `.github/scripts/collect-status.sh` + PAT |
| **Fix deployment** | `DEPLOYMENT_GUIDE.md` → `GITHUB_ACTIONS.md` → workflow files |
| **Rollback production** | `ROLLOVER_GUIDE.md` (decision tree) |
| **Debug frontend issue** | `TROUBLESHOOTING.md` (frontend sections) → `DEBUGGING_GUIDE.md` |
| **Debug collector issue** | `TROUBLESHOOTING.md` (collector sections) → workflow logs |
| **Understand data schema** | `DATA_FLOW.md` (JSON schema reference) |
| **Update documentation** | `DOCUMENTATION_MAINTENANCE.md` (update triggers, standards) |

---

## File Reference

### Root Files
- `AGENTS.md` — Mandatory agent instructions
- `README.md` — Project overview
- `CONTRIBUTING.md` — Contribution guide
- `CHANGELOG.md` — Version history
- `index.html` — Application entry point
- `css/style.css` — All styles
- `js/api.js` — Data access layer
- `js/app.js` — Bootstrap, lifecycle, UI
- `js/dashboard.js` — DOM rendering
- `data/status.json` — Generated status data
- `scripts/validate-status-json.js` — Status data-contract validator
- `package.json` — Dev tooling and release version source
- `.gitignore` — Git ignore rules
- `CNAME` — Custom domain (empty, reserved)

### GitHub Workflows
- `.github/workflows/collect-status.yml` — Collector (5 min schedule)
- `.github/workflows/deploy-pages.yml` — Quality-gated Pages deployment
- `.github/workflows/security-scan.yml` — gitleaks + zizmor security scanning
- `.github/zizmor.yml` — Zizmor policy

### Collector Script
- `.github/scripts/collect-status.sh` — Bash + gh + jq collector

### Assets
- `assets/brand/` — Logo variants (light/dark pairs, favicon)

---

## Documentation Maintenance

- **Update with code**: Every implementation change updates relevant docs
- **Single source of truth**: No duplicate content
- **Factual tone**: Documents reality, not aspirations
- **Validation**: Check file paths, commands, links before reporting done

See [`agent-context/DOCUMENTATION_MAINTENANCE.md`](agent-context/DOCUMENTATION_MAINTENANCE.md) for full guidelines.