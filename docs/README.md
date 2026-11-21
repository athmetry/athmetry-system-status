# Athmetry System Status Documentation Hub

Load context progressively using this 3-tier hierarchy. Search first (`rg`), then read only the single document needed for your task.

## Tier 1 — Session-Start Context (Read First)

- [`AGENTS.md`](../AGENTS.md) — Stack, workflow/collector/frontend invariants, mandatory validation gates, safety rules, and skill routing.
- [`PROJECT_STATE.md`](../PROJECT_STATE.md) — Current `main` baseline, verified test/CI counts, implemented capabilities, and known limitations.
- [`MEMORY.md`](../MEMORY.md) — File map, `workflow_run` / self-monitoring / API-lag / hidden-workflow gotchas, Zizmor policy, and verified commands.

## Tier 2 — On-Demand Technical References (Load Per Task)

| Document | Owns | Read When |
| --- | --- | --- |
| [`../README.md`](../README.md) | Human-facing overview, live URL, quick start, repository structure | Onboarding or checking project overview |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Frontend module boundaries, 3-card layout, theme variables, responsive breakpoints, presentation filtering, key ADRs | Modifying HTML, CSS, theme tokens, layout, or `js/{app,api,dashboard}.js` |
| [`DATA_FLOW.md`](DATA_FLOW.md) | Collector API pipeline, commit settlement, self-monitoring, Backend/Frontend event merging, `data/status.json` schema v2, status mapping, adding repos | Modifying `.github/scripts/collect-status.sh`, `data/status.json`, or `scripts/validate-status-json.js` |
| [`CI_CD_AND_DEPLOYMENT.md`](CI_CD_AND_DEPLOYMENT.md) | All 4 GitHub Actions workflows, `.github/zizmor.yml` pinning policy, `ATHMETRY_GITHUB_TOKEN` PAT scopes, Pages quality gate, rollback procedures | Modifying `.github/workflows/*.yml`, `.github/zizmor.yml`, secrets, or deployment |
| [`DEVELOPMENT_AND_TESTING.md`](DEVELOPMENT_AND_TESTING.md) | Local server, isolated collector testing, HTML/CSS/JS/Bash standards, integration & Playwright browser tests, manual regression checklist | Running tests, writing new specs, or checking coding conventions |
| [`OPERATIONS.md`](OPERATIONS.md) | Freshness monitoring, symptom-based troubleshooting (frontend, collector, deploy), incident response runbooks, known limitations | Diagnosing stale/missing data, workflow failures, or production incidents |

## Tier 3 — Historical Archive (Audit Only)

- [`archive/README.md`](archive/README.md) — Archived 2026-11-20 end-to-end engineering audit and handover report ([`archive/ATHMETRY_SYSTEM_STATUS_CONTEXT.md`](archive/ATHMETRY_SYSTEM_STATUS_CONTEXT.md)). **Do not load during routine coding tasks.**

## Maintenance Rules

- Update documents only with verified facts and command outputs; keep each fact in one owner document and link instead of duplicating.
- Keep Tier 1 (`AGENTS.md`, `PROJECT_STATE.md`, `MEMORY.md`) concise; place detailed specs in the owning Tier 2 reference.
- Verify all relative Markdown links resolve on disk before committing.
