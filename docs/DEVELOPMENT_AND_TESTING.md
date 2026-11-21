# Development, Coding Standards & Testing Guide

## 1. Local Setup & Isolated Collector Testing

```bash
# 1. Install dev dependencies (Playwright test runner)
npm ci

# 2. Serve the static site locally (no build step exists)
python3 -m http.server 8000
# Open http://localhost:8000/index.html

# 3. Run the collector locally in isolation (always back up and restore data/status.json)
cp data/status.json /tmp/status.before.json
ATHMETRY_GITHUB_TOKEN="<your-fine-grained-pat>" ./.github/scripts/collect-status.sh
node scripts/validate-status-json.js
cp /tmp/status.before.json data/status.json
```

## 2. Coding Standards

- **HTML (`index.html`):** Semantic HTML5 elements (`<header>`, `<main>`, `<section>`, `<dialog>`, `<footer>`), explicit `aria-label` / `aria-live` attributes, and the inline theme initialization script in `<head>` before `css/style.css` (prevents flash of unthemed content).
- **CSS (`css/style.css`):** Mobile-first media queries (`375px`, `430px`, `768px`, `1024px`, `1440px`), all colors defined via `:root` and `[data-theme="dark"]` custom properties (never hardcode hex colors in component rules), touch targets `>= 44px` (except the compact `36×36px` icon-only theme button), and `@media print` / `prefers-reduced-motion` rules preserved.
- **JavaScript (`js/*.js`):** Vanilla ES2020 modules (`export function`, `export class`), `async`/`await` with `try`/`catch` and `AbortController` timeouts, zero top-level DOM access in exported utility modules so Node.js integration tests can import [`js/dashboard.js`](../js/dashboard.js) and [`js/api.js`](../js/api.js) directly, and mandatory `escapeHtml()` on every dynamic string interpolated into `innerHTML`.
- **Bash (`.github/scripts/collect-status.sh`, `tests/integration/*.sh`):** `set -euo pipefail`, all logs written to `stderr` (`>&2`) so function `stdout` remains pure JSON, JSON constructed exclusively via `jq` (never string concatenation with unescaped fields), and strict compatibility with **macOS `/bin/bash` 3.2** (no `declare -A`, `mapfile`, `${var,,}`, or unguarded empty array expansion under `set -u`).
- **Commits:** Conventional Commits (`fix(status): ...`, `feat(collector): ...`, `docs(context): ...`, `test(status): ...`, `chore(status): ...`).

## 3. Automated Validation & Test Suites

Run the complete validation suite before opening or merging any pull request:

```bash
# 1. JavaScript & Bash syntax check
for f in js/*.js; do node --check "$f"; done
bash -n .github/scripts/collect-status.sh

# 2. JSON & schema v2 contract validation
jq empty data/status.json package.json
node scripts/validate-status-json.js

# 3. Workflow YAML & Zizmor security policy scan
ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/*.yml .github/zizmor.yml
zizmor --config .github/zizmor.yml --offline .github/workflows/

# 4. HTML & CSS static validators
npx --yes html-validate@11.21.1 --rule void-style:off --rule no-implicit-button-type:off --rule no-trailing-whitespace:off index.html
npx --yes csstree-validator@4.0.1 css/style.css

# 5. Integration test suite (6 suites / 119 checks, zero network calls)
npm run test:integration

# 6. Playwright browser test suite (11 headless Chromium tests on 127.0.0.1:4173)
npm run test:browser
```

### Automated Test Inventory

| Suite | File | Coverage |
| --- | --- | --- |
| Backend Event Integration (`20` tests) | [`tests/integration/test_backend_integration.sh`](../tests/integration/test_backend_integration.sh) | `read_backend_event` schema/SHA/URL/repo/product/branch/meta validation, `merge_backend_event` stale & duplicate rejection, higher `runAttempt`, 5-run history limit, last-success preservation. |
| Frontend Event Integration (`30` tests) | [`tests/integration/test_frontend_integration.sh`](../tests/integration/test_frontend_integration.sh) | `read_frontend_event` validation, `merge_frontend_event` stale & duplicate protection, history deduplication/order, preservation of sibling Frontend workflows (`Dependency Audit`). |
| Workflow Trigger Contract (`3` checks) | [`tests/integration/test_workflow_triggers.sh`](../tests/integration/test_workflow_triggers.sh) | `collect-status.yml` `workflow_run` (`CI Integration Tests`, `Security Scan` on `main`), absence of premature `push` and loop triggers, `*/30` cron, `workflow_dispatch`, `cancel-in-progress: false`, least-privilege permissions. |
| Collector Preservation (`4` checks) | [`tests/integration/test_collector_preservation.sh`](../tests/integration/test_collector_preservation.sh) | Full `collect-status.sh` execution with mocked `gh` CLI across all 3 repos, stale/duplicate event rejection, and `cmp -s` no-op check. |
| Collector Status Accuracy (`9` tests) | [`tests/integration/test_collector_status_accuracy.sh`](../tests/integration/test_collector_status_accuracy.sh) | Self-monitoring `status=completed` + `GITHUB_RUN_ID` exclusion + 5-run depth, first-run `unknown` fallback, failed collector surfacing, `wait_for_commit_workflows` polling, API run-vs-jobs lag reconciliation, hidden-workflow exclusion from `overallStatus`, duplicate `workflow_run` skip vs rerun update, extended status mappings. |
| Dashboard Filtering & Status Resolution (`53` assertions) | [`tests/integration/test_dashboard_filtering.js`](../tests/integration/test_dashboard_filtering.js) | `getDisplayWorkflows`, `calculateOverallStatus`, `resolveEffectiveStatus` (completed `latestRun` overrides stale `running`), `getStatusLabel`/`getStatusClass` raw GitHub mappings, `escapeHtml`, `StatusApi.processWorkflow` self-monitoring. |
| Browser Regression (`11` tests) | [`tests/browser/manual-refresh.spec.js`](../tests/browser/manual-refresh.spec.js) | Internal reporter hiding, manual refresh scroll lock (375px & 1280px), cache busting, failure/invalid-JSON/timeout fallback to `lastValidData`, zero horizontal overflow at `320, 375, 430, 768, 1024, 1440px`, dark-mode persistence. |

## 4. Browser Console Debugging Shortcuts

```javascript
statusApi.getLastData()                                              // Inspect current parsed status.json
statusApi.isCurrentDataStale()                                       // Check 10-minute stale state
document.documentElement.getAttribute("data-theme")                  // Current theme ("light" | "dark")
document.documentElement.scrollWidth - document.documentElement.clientWidth // Must be <= 0
```
