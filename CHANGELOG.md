# Changelog

All notable changes to this project are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- Comprehensive documentation system in `docs/` (architecture, development, deployment, operations, agent-context)
- Agent instructions in `AGENTS.md`
- Agent workflow definition
- Change impact map
- Documentation maintenance guide
- Security Scan workflow (`.github/workflows/security-scan.yml`) using gitleaks and zizmor, triggered on pull requests, pushes to `main`, weekly schedule, and manual dispatch
- Zizmor security policy (`.github/zizmor.yml`)
- `athmetry-system-status` as a third monitored repository, with its `collect-status.yml`, `deploy-pages.yml`, and `security-scan.yml` all shown
- Three-card layout: Backend (left), System Status (top-right), Frontend (bottom-right)
- Dynamic per-card pipeline counts and branch text derived from collected data
- Per-workflow pipeline rows with a pipeline detail dialog (jobs, run metadata, up to 5 history entries)
- Footer release label derived from `package.json` (`fetchReleaseVersion()`), with no hardcoded version
- `scripts/validate-status-json.js` status data-contract validator
- `package.json` for development tooling (`@playwright/test`, validators, release version)

### Changed
- **Workflow set reduced to three** (`collect-status.yml`, `deploy-pages.yml`, `security-scan.yml`); the Code Quality workflow was removed to keep the free GitHub Actions footprint small
- **Deployment is quality-gated**: `deploy-pages.yml` triggers on `workflow_run` completion of Security Scan or Collect System Status on `main`, and deploys only security-validated revisions (or revisions differing only by `data/status.json`). Pull requests, failed/cancelled runs, stale revisions, diverged history and duplicate deploys are blocked.
- `deploy-pages.yml` no longer uses a `push` trigger, because commits made with `GITHUB_TOKEN` do not trigger push-based workflows
- `deploy-pages.yml` checks out the exact validated SHA and verifies `git rev-parse HEAD` before deploying
- `security-scan.yml` now also runs on pushes to `main`
- **Collector self-monitoring enabled**: the collector's own workflow is no longer excluded; its most recent completed run is reported so failed collector runs are visible
- Status JSON schema advanced to `schemaVersion: 2` (per-repository `workflows[]` with per-workflow `latestRun` and `history`)
- Collector discovers workflows via `/actions/workflows` and fetches up to 5 runs per workflow (`MAX_RUNS_PER_WORKFLOW=5`)
- Collector derives `effectiveStatus` and `overallStatus`; the frontend renders stored values
- Visitor IP lookup moved from `ipinfo.io` to CORS-enabled `ipwho.is`
- Release regression viewport set reduced to six widths: 320, 375, 430, 768, 1024, 1440px
- Documentation synchronized with the current implementation

### Fixed
- HTML escaping of GitHub-sourced text rendered via `innerHTML`
- Initial-load fetch failures now show an explicit error state across all three repository cards instead of an empty dashboard that looks healthy
- Print styles now hide pipeline detail buttons and the pipeline detail dialog
- Header "Last updated" now reflects the initial page load instead of showing a dash until the first manual or automatic refresh
- Workflow names no longer truncate to a couple of characters at 430–1023px; names wrap and the duration column is hidden below 1024px

---

## [1.0.0] — 2026-11-12

> Historical entry for the initial Phase 1 deployment (commit `57238f7`,
> two repositories, schemaVersion 1, ipinfo.io). Current implementation
> changes are listed under Unreleased above.

### Added — Phase 1 Production Release

#### Dashboard Features
- Overall system status with color-coded pill (success/failure/running/queued/unknown)
- Repository health cards for backend and frontend pipelines
- Real-time status derivation from GitHub Actions `status` + `conclusion`
- Commit info (SHA, message, author), run number, timestamps, duration
- Execution history table (last 10 runs per repo) with tab switching
- View Runs dialog with repo-specific GitHub Actions URLs
- Manual refresh button with loading spinner, timeout (10s), success/error toasts
- Auto-refresh every 60 seconds with cache-busting
- Stale data detection (10 min threshold) with warning banner
- Repository error surfacing (collector API failures)

#### Theme System
- Light/dark mode with localStorage persistence
- Inline theme script in `<head>` prevents flash of wrong theme
- CSS custom properties for all colors, spacing, shadows, radii
- Professional brand palette (lime, cyan, blue, teal) with accessibility-tuned variants
- Separate light/dark logo assets with CSS show/hide
- Compact 36×36px icon-only theme toggle with proper backgrounds in both themes

#### Responsive Design
- Mobile-first breakpoints: 320, 375, 430, 768, 1024, 1440px
- Three-area header layout (Brand | Actions | Last Updated) with `margin-left: auto`
- Mobile (≤429px): Last Updated wraps to row 2 with border-top
- Zero horizontal overflow verified at all 9 test widths in both themes
- Touch targets ≥44px, fluid typography, flexible grids

#### Collector
- GitHub Actions workflow scheduled every 5 minutes (`*/5 * * * *`)
- Manual trigger via `workflow_dispatch`
- Fine-grained PAT authentication (`ATHMETRY_GITHUB_TOKEN`)
- GitHub REST API via `gh` CLI: workflow runs, jobs, commits
- Normalizes data, derives effective status, writes `data/status.json`
- Commits only when JSON content changes (`cmp -s`)
- Uses `GITHUB_TOKEN` for git push (separate from PAT)

#### Deployment
- GitHub Pages via `actions/upload-pages-artifact` + `actions/deploy-pages@v4`
- Triggers on push to `main` (including collector commits)
- OIDC token authentication (`id-token: write`)
- Live at https://athmetry.github.io/athmetry-system-status/

#### Infrastructure
- Vanilla HTML/CSS/JS — no frameworks, no build step
- ES modules (`<script type="module">`)
- JSON data contract with `schemaVersion: 1`
- Visitor IP/location via ipinfo.io (footer, non-blocking)
- Print stylesheet hides interactive elements
- Accessibility: ARIA labels, focus-visible, keyboard navigation, reduced motion

---

## [0.x] — 2026-11 (Pre-Phase 1)

### Added
- Initial repository setup
- Basic HTML structure
- Early CSS theme experiments
- Collector script prototypes
- GitHub Actions workflow prototypes

---

## Versioning Policy

- **Major**: Breaking JSON schema changes, architecture rewrites
- **Minor**: New features (new repos, new status types, new UI sections)
- **Patch**: Bug fixes, styling tweaks, documentation, config changes

Schema version in `data/status.json` (`schemaVersion`) increments on breaking data changes only.