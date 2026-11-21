---
name: testing-and-regression
description: Run automated integration, Playwright browser, and static validation suites plus manual responsive/theme regression checks for Athmetry System Status.
---

# Skill: Testing and Regression

## Prerequisites

Read [`AGENTS.md`](../../../AGENTS.md) and [`docs/DEVELOPMENT_AND_TESTING.md`](../../../docs/DEVELOPMENT_AND_TESTING.md). Always execute checks directly and report actual exit codes and test counts.

## Mandatory Automated Suite

```bash
# 1. Syntax & data contract validation
for f in js/*.js; do node --check "$f"; done
bash -n .github/scripts/collect-status.sh
jq empty data/status.json package.json
node scripts/validate-status-json.js

# 2. Workflow YAML & Zizmor security scan
ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/*.yml .github/zizmor.yml
zizmor --config .github/zizmor.yml --offline .github/workflows/

# 3. HTML & CSS static validators
npx --yes html-validate@11.21.1 --rule void-style:off --rule no-implicit-button-type:off --rule no-trailing-whitespace:off index.html
npx --yes csstree-validator@4.0.1 css/style.css

# 4. Integration tests (6 suites / 119 checks: backend events, frontend events, workflow triggers, collector preservation, collector status accuracy & commit settlement, dashboard filtering/status resolution/API)
npm run test:integration

# 5. Playwright browser regression suite (11 tests: internal reporter hiding, manual refresh scroll lock at 375px & 1280px, cache busting, failure/invalid-JSON/timeout fallback, zero horizontal overflow across 320/375/430/768/1024/1440px, theme persistence)
npm run test:browser
```

## Isolated Live Collector Check (When Modifying `.github/scripts/collect-status.sh`)

Always back up and restore `data/status.json` so local collector runs do not dirty the working tree:

```bash
cp data/status.json /tmp/status.before.json
ATHMETRY_GITHUB_TOKEN="<pat>" ./.github/scripts/collect-status.sh
node scripts/validate-status-json.js
cp /tmp/status.before.json data/status.json
```
