# Contributing Guide

## Workflow & Setup

1. Read [`AGENTS.md`](AGENTS.md), [`PROJECT_STATE.md`](PROJECT_STATE.md), and [`MEMORY.md`](MEMORY.md) before making changes.
2. Consult [`docs/README.md`](docs/README.md) to load the relevant Tier 2 reference ([`docs/DEVELOPMENT_AND_TESTING.md`](docs/DEVELOPMENT_AND_TESTING.md) for standards and test suites).
3. Create a feature branch from the latest `origin/main` (`git fetch origin main && git checkout -b <type>/<scope> origin/main`).
4. Serve locally with `python3 -m http.server 8000` (no build step exists).

## Coding & Commit Conventions

- **HTML/CSS/JS:** Vanilla HTML5, CSS custom properties (`:root` + `[data-theme="dark"]`), ES2020 modules, mandatory `escapeHtml()` for all dynamic HTML, inline `<head>` theme script preserved, and zero horizontal overflow across `320, 375, 430, 768, 1024, 1440px` in light and dark mode.
- **Bash (`.github/scripts/collect-status.sh`):** `set -euo pipefail`, logs to `stderr` (`>&2`), JSON via `jq`, and macOS Bash `3.2+` compatibility.
- **Workflows (`.github/workflows/*.yml`):** Follow [`.github/zizmor.yml`](.github/zizmor.yml) SHA-pinning policy and pass `workflow_run` inputs exclusively via `env:`.
- **Commits:** Conventional Commits (`fix(status): ...`, `feat(collector): ...`, `docs(context): ...`, `test(status): ...`, `chore(status): ...`).

## Mandatory Pre-PR Validation

All checks must be executed and pass before opening or merging a pull request:

```bash
for f in js/*.js; do node --check "$f"; done
bash -n .github/scripts/collect-status.sh
jq empty data/status.json package.json
node scripts/validate-status-json.js
ruby -ryaml -e 'ARGV.each { |f| YAML.load_file(f); puts "OK #{f}" }' .github/workflows/*.yml .github/zizmor.yml
zizmor --config .github/zizmor.yml --offline .github/workflows/
npx --yes html-validate@11.21.1 --rule void-style:off --rule no-implicit-button-type:off --rule no-trailing-whitespace:off index.html
npx --yes csstree-validator@4.0.1 css/style.css
npm run test:integration
npm run test:browser
```

## Pull Request & Release Rules

- Update the owning Tier 1 / Tier 2 documentation in [`docs/`](docs/README.md) alongside any code or workflow change and verify zero broken relative links.
- Never commit secrets, tokens, `.bak` files, or temporary artifacts.
- Merge to `main` only after `CI Integration Tests` and `Security Scan` pass; `Collect System Status` and `Deploy to GitHub Pages` run automatically via `workflow_run`.
