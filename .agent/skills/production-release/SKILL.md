---
name: production-release
description: Prepare, validate, merge, and verify production releases and rollbacks for Athmetry System Status on GitHub Pages.
---

# Skill: Production Release & Rollback

## Prerequisites & Release Boundary

1. Read [`AGENTS.md`](../../../AGENTS.md), [`PROJECT_STATE.md`](../../../PROJECT_STATE.md), [`docs/CI_CD_AND_DEPLOYMENT.md`](../../../docs/CI_CD_AND_DEPLOYMENT.md), and [`docs/OPERATIONS.md`](../../../docs/OPERATIONS.md).
2. **Authorization gate:** Never commit, push, merge, deploy, or modify secrets/schedules without explicit user authorization.
3. **Version source of truth:** Update `"version"` in [`package.json`](../../../package.json) only when releasing a new version; `js/app.js` renders `Release v<major>.<minor>` dynamically.

## Pre-Release Verification Gate

```bash
for f in js/*.js; do node --check "$f"; done
bash -n .github/scripts/collect-status.sh
jq empty data/status.json package.json && node scripts/validate-status-json.js
ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/*.yml .github/zizmor.yml
zizmor --config .github/zizmor.yml --offline .github/workflows/
npx --yes html-validate@11.21.1 --rule void-style:off --rule no-implicit-button-type:off --rule no-trailing-whitespace:off index.html
npx --yes csstree-validator@4.0.1 css/style.css
npm run test:integration
npm run test:browser
```

## Release & Post-Merge Verification Flow

1. Push feature branch and open a PR to `main`.
2. Wait for required PR checks (`CI Integration Tests` and `Security Scan`) to succeed (`gh pr checks <num> --watch`).
3. Squash-merge PR into `main` (`gh pr merge <num> --squash --delete-branch`).
4. Verify post-merge `main` workflow chain:
   - `Security Scan` and `CI Integration Tests` succeed on the merge commit `M`.
   - `Collect System Status` triggers automatically via `workflow_run`, settles sibling workflows on `M`, and commits updated `data/status.json` (`C`).
   - `Deploy to GitHub Pages` passes its quality gate and deploys to `https://athmetry.github.io/athmetry-system-status/`.
5. Inspect live `https://athmetry.github.io/athmetry-system-status/data/status.json` to confirm `overallStatus == "success"` and all completed workflows show `completed`/`success` (not `running`).

## Rollback

- **Code regression:** Revert the commit on a branch via `git revert --no-edit <sha>`, pass PR checks, and squash-merge to `main`.
- **Stale/corrupt status data:** Dispatch `Collect System Status` manually (`gh workflow run collect-status.yml -R athmetry/athmetry-system-status`).
- **Emergency offline:** Switch **Settings → Pages → Source** from `GitHub Actions` to `None`.
