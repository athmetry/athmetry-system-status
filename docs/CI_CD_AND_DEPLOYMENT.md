# CI/CD Workflows, Security & Deployment Guide

## 1. GitHub Actions Workflows (`.github/workflows/`)

| Workflow File | Name | Triggers | Permissions | Purpose |
| --- | --- | --- | --- | --- |
| [`collect-status.yml`](../.github/workflows/collect-status.yml) | `Collect System Status` | `workflow_run` completed (`CI Integration Tests`, `Security Scan` on `main`), `schedule` (`*/30 * * * *`), `workflow_dispatch` | Workflow: `contents: read`; Job `collect`: `contents: write` | Waits for commit pipelines on `main` to settle, collects all 3 repos + status events via `ATHMETRY_GITHUB_TOKEN`, and pushes `data/status.json` via `GITHUB_TOKEN`. Concurrency: `group: collect-status`, `cancel-in-progress: false`. |
| [`deploy-pages.yml`](../.github/workflows/deploy-pages.yml) | `Deploy to GitHub Pages` | `workflow_run` completed (`Security Scan`, `Collect System Status` on `main`) | Workflow: `contents: read`; Job `gate`: `contents: read, actions: read`; Job `deploy`: `contents: read, pages: write, id-token: write` | Quality-gated GitHub Pages deployment (`group: pages`, `cancel-in-progress: false`). Deploys only when `main` HEAD is the latest `Security Scan`-validated SHA or differs from it solely by `data/status.json`, and skips already-deployed SHAs. |
| [`security-scan.yml`](../.github/workflows/security-scan.yml) | `Security Scan` | `pull_request` (`main`), `push` (`main`), `schedule` (`17 3 * * 1`), `workflow_dispatch` | `contents: read` | Runs `gitleaks` `8.30.1` (SHA-256 verified archive) on tracked files (`git archive HEAD`) and `zizmor` `1.32.0` (`min-severity: medium`, `min-confidence: high`) on `.github/workflows/`. |
| [`ci-test.yml`](../.github/workflows/ci-test.yml) | `CI Integration Tests` | `pull_request` (`main`), `push` (`main`) | `contents: read` | Runs `npm ci` and `npm run test:integration` on Node.js 20. |

## 2. Action-Pinning & Zizmor Policy (`.github/zizmor.yml`)

[`zizmor.yml`](../.github/zizmor.yml) enforces:
- `actions/checkout`: `hash-pin` (currently `3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`)
- `actions/*` and `*`: `hash-pin` (`actions/setup-node@a0853c24544627f65ddf259abe73b1d18a591444 # v4.0.0`, `zizmorcore/zizmor-action@45d7276c9ca790aabd705e31ca99c6185c3e76dd # v0.8.1`)
- `actions/upload-pages-artifact` and `actions/deploy-pages`: `ref-pin` (`@v4`)
- Workflows using `workflow_run` (`collect-status.yml`, `deploy-pages.yml`) must include `# zizmor: ignore[dangerous-triggers] <justification>` on the `on:` line, pass event fields exclusively via `env:` (never `${{ ... }}` interpolation inside `run:`), and check out trusted refs (`default_branch` or validated gate SHA) with `persist-credentials: false`.

## 3. Secrets & Repository Configuration

### Required Actions Secret: `ATHMETRY_GITHUB_TOKEN`
Configured at **Settings → Secrets and variables → Actions → Repository secrets**:
- **Type:** Fine-grained Personal Access Token (resource owner: `athmetry`, max 1-year expiry).
- **Minimum repository permissions:**
  - `athmetry/athmetry-backend`: `Actions: Read`, `Contents: Read`
  - `athmetry/athmetry-frontend`: `Actions: Read`, `Contents: Read`
  - `athmetry/athmetry-system-status`: `Actions: Read`, `Contents: Read and write`
- **Upstream reporter token (`ATHMETRY_STATUS_REPORTER_TOKEN` in backend & frontend repos):** Separate fine-grained PAT scoped to `athmetry/athmetry-system-status` (`Contents: Read and write`) used by upstream `status-reporter.yml` workflows to write `data/status-events/{backend,frontend}.json`.
- **Rotation:** Generate a replacement fine-grained PAT with identical scopes, update the `ATHMETRY_GITHUB_TOKEN` secret, and trigger `Collect System Status` via `workflow_dispatch` to verify.

### GitHub Pages & Custom Domain (`CNAME`)
- **Settings → Pages → Build and deployment → Source:** `GitHub Actions` (`github-pages` environment).
- **Live URL:** `https://athmetry.github.io/athmetry-system-status/`
- **`CNAME` file:** Kept empty at root. Do **not** populate `status.athmetry.com` until DNS records are live and ready to bind, as premature population breaks the default GitHub Pages URL.

## 4. End-to-End Deployment Lifecycle

1. **Code/Docs Change (via PR to `main`):**
   - PR runs `CI Integration Tests` and `Security Scan`.
   - After squash-merge to `main`, `CI Integration Tests` and `Security Scan` run on the merge commit `M`.
   - `Security Scan` completion triggers `Deploy to GitHub Pages` (deploys code at `M`) and `Collect System Status`.
   - `Collect System Status` waits for `CI Integration Tests` on `M` to finish, writes updated `data/status.json`, and pushes commit `C` with `GITHUB_TOKEN`.
   - `Collect System Status` completion triggers `Deploy to GitHub Pages`; the gate verifies `M...C` modifies only `data/status.json` and deploys `C`.
2. **Upstream Pipeline Completion (Backend / Frontend):**
   - Upstream status reporter pushes `data/status-events/{backend,frontend}.json` to `main` (commit `E`).
   - `CI Integration Tests` and `Security Scan` run on `E` → `Collect System Status` waits for both to settle, merges the event into `data/status.json`, and pushes commit `C` → `Deploy to GitHub Pages` deploys `C`.

## 5. Rollback & Recovery Procedures

- **Revert a bad code/docs commit on `main` (preferred):**
  ```bash
  git fetch origin main && git checkout -b fix/revert-change origin/main
  git revert --no-edit <bad-commit-sha>
  # Push branch, open PR, pass CI Integration Tests + Security Scan, and squash-merge
  ```
- **Refresh corrupted or stale `data/status.json`:**
  - Trigger **Actions → Collect System Status → Run workflow** (`workflow_dispatch`) on `main`.
- **Emergency site takedown:**
  - In **Settings → Pages → Build and deployment → Source**, switch from `GitHub Actions` to `None` (takes site offline immediately without deleting history; switch back to `GitHub Actions` after fixing).
