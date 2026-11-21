---
name: repository-investigation
description: Quickly orient and inspect Athmetry System Status using the 3-tier context hierarchy and targeted search.
---

# Skill: Repository Investigation

## Progressive Context Loading

1. **Tier 1 (Always Read First):**
   - [`AGENTS.md`](../../../AGENTS.md) — Stack, invariants, validation commands, and safety rules.
   - [`PROJECT_STATE.md`](../../../PROJECT_STATE.md) — Current baseline, test counts, and limitations.
   - [`MEMORY.md`](../../../MEMORY.md) — File map and critical operational gotchas.
2. **Tier 2 (Load Single Owning Reference via [`docs/README.md`](../../../docs/README.md)):**
   - Frontend UI / layout / theme / filtering → [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md)
   - Collector script / event merging / `status.json` schema → [`docs/DATA_FLOW.md`](../../../docs/DATA_FLOW.md)
   - Workflows / Zizmor / PAT / Pages deploy → [`docs/CI_CD_AND_DEPLOYMENT.md`](../../../docs/CI_CD_AND_DEPLOYMENT.md)
   - Coding standards / test suites / debugging → [`docs/DEVELOPMENT_AND_TESTING.md`](../../../docs/DEVELOPMENT_AND_TESTING.md)
   - Troubleshooting / incidents / limitations → [`docs/OPERATIONS.md`](../../../docs/OPERATIONS.md)
3. **Tier 3 (Historical Archive — Skip for Routine Work):**
   - [`docs/archive/README.md`](../../../docs/archive/README.md)

## Targeted Inspection Commands

```bash
# Git & branch state
git status --short --branch
git log --oneline -n 10

# Search symbols across frontend, collector, workflows, and tests
rg -n "<pattern>" index.html css/ js/ .github/ scripts/ tests/

# Inspect current published status summary
jq '{collectedAt, monitoredBranch, repos: [.repositories[] | {name, overallStatus, workflows: [.workflows[] | {name, effectiveStatus, latestStatus, latestConclusion, run: .latestRun.runNumber}]}]}' data/status.json
```
