---
name: github-actions
description: Understand, debug, and safely update GitHub Actions workflows, collector automation, and Zizmor security rules in Athmetry System Status.
---

# Skill: GitHub Actions & Collector Workflows

## Prerequisites

Read [`AGENTS.md`](../../../AGENTS.md), [`MEMORY.md`](../../../MEMORY.md), [`docs/CI_CD_AND_DEPLOYMENT.md`](../../../docs/CI_CD_AND_DEPLOYMENT.md), and [`docs/DATA_FLOW.md`](../../../docs/DATA_FLOW.md).

## Workflow Architecture (`.github/workflows/`)

1. **`collect-status.yml` (`Collect System Status`):**
   - Triggers on `workflow_run` completion of `CI Integration Tests` or `Security Scan` on `main`, `*/30 * * * *` fallback cron, and `workflow_dispatch`.
   - Never add a `push` trigger (races sibling workflows and risks loops on `data/status.json`), never include `Collect System Status` or `Deploy to GitHub Pages` in `workflow_run.workflows`, and never set `cancel-in-progress: true` (`Collect System Status` is visible on the dashboard; cancelling surfaces `Cancelled`).
   - Uses `ATHMETRY_GITHUB_TOKEN` (fine-grained PAT) for checkout and GitHub API reads, and built-in `GITHUB_TOKEN` for `git push` of `data/status.json`.
2. **`deploy-pages.yml` (`Deploy to GitHub Pages`):**
   - Triggers on `workflow_run` completion of `Security Scan` or `Collect System Status` on `main`.
   - Quality gate deploys only when `main` HEAD matches the latest successful `Security Scan` SHA or differs from it solely by `data/status.json`.
3. **`security-scan.yml` (`Security Scan`):**
   - Runs `gitleaks` `8.30.1` on tracked files and `zizmor` `1.32.0` against `.github/workflows/` using `.github/zizmor.yml`.
4. **`ci-test.yml` (`CI Integration Tests`):**
   - Runs `npm ci && npm run test:integration` on PRs and pushes to `main`.

## Zizmor & Security Rules (`.github/zizmor.yml`)

- Full-SHA pinning (`hash-pin`) is mandatory for `actions/checkout`, `actions/*`, and `*`; only `actions/upload-pages-artifact` and `actions/deploy-pages` use `@v4` (`ref-pin`).
- Every `workflow_run` trigger requires `# zizmor: ignore[dangerous-triggers] <justification>` on the `on:` line, trusted ref checkout (`default_branch` or validated gate SHA) with `persist-credentials: false`, and passing all `github.event.*` values through `env:` (never `${{ ... }}` inside `run:`).

## Verification Gate

```bash
bash -n .github/scripts/collect-status.sh
ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/*.yml .github/zizmor.yml
zizmor --config .github/zizmor.yml --offline .github/workflows/
npm run test:integration
```
