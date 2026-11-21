## Summary

<!-- Brief 1-2 sentence description of what changed and why -->

## Changes Made

| File | Type | Description |
| --- | --- | --- |
| `path/to/file` | fix/feat/chore/docs/test | What changed |

## Validation & Tests Executed

- [ ] `for f in js/*.js; do node --check "$f"; done`
- [ ] `bash -n .github/scripts/collect-status.sh`
- [ ] `jq empty data/status.json package.json && node scripts/validate-status-json.js`
- [ ] `ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/*.yml .github/zizmor.yml`
- [ ] `zizmor --config .github/zizmor.yml --offline .github/workflows/`
- [ ] `npx --yes html-validate@11.21.1 --rule void-style:off --rule no-implicit-button-type:off --rule no-trailing-whitespace:off index.html`
- [ ] `npx --yes csstree-validator@4.0.1 css/style.css`
- [ ] `npm run test:integration`
- [ ] `npm run test:browser`

## Documentation Updated

- [ ] `AGENTS.md` / `PROJECT_STATE.md` / `MEMORY.md` (if Tier 1 context or baseline changed)
- [ ] `docs/ARCHITECTURE.md` (if frontend modules, layout, theme, or responsive behavior changed)
- [ ] `docs/DATA_FLOW.md` (if collector logic, event merging, or `data/status.json` schema changed)
- [ ] `docs/CI_CD_AND_DEPLOYMENT.md` (if GitHub Actions workflows, Zizmor policy, or deployment changed)
- [ ] `docs/DEVELOPMENT_AND_TESTING.md` (if coding standards or test suites changed)
- [ ] `docs/OPERATIONS.md` (if troubleshooting, monitoring, or known limitations changed)
- [ ] `README.md` / `CHANGELOG.md` (if user-facing behavior changed)

## Safety Checklist

- [ ] `AGENTS.md` read and followed
- [ ] No secrets, tokens, `.bak` files, or temporary artifacts committed
- [ ] Zero broken relative Markdown links
- [ ] `git status` clean
