# Known Limitations

This document lists known limitations, design constraints, and intentional trade-offs in the Athmetry System Status system. These are not bugs — they are documented boundaries of the current implementation.

---

## Architecture Limitations

### No Real-Time Updates
- **Current**: Polling every 60 seconds (frontend) + collection every 5 minutes (collector)
- **Latency**: Up to ~5 minutes for new pipeline runs to appear, plus up to 60s for frontend to fetch
- **Reason**: Static site architecture; no WebSocket server, no server-sent events
- **Workaround**: Manual refresh button fetches latest published JSON immediately

### No Authentication / Access Control
- **Current**: Public GitHub Pages URL, anyone can view
- **Reason**: Simplicity, no backend, free hosting
- **Risk**: Pipeline status visible to anyone with URL
- **Mitigation**: Status data is already public via GitHub Actions UI; no secrets exposed

### Single Branch Monitoring
- **Current**: Only `main` branch monitored (hardcoded in collector)
- **Reason**: Simplicity; current workflow runs on `main` only
- **Future**: Per-repo branch config in `MONITORED_REPOS` array

### No Historical Trend Analysis
- **Current**: Up to 5 runs per workflow in each `workflows[].history` array
- **Reason**: JSON file size, static storage, no database
- **Limitation**: Cannot show trends, MTTR, success rates over time

---

## Collector Limitations

### GitHub API Rate Limits
- **Current**: Fine-grained PAT has generous limits (~5000/hr)
- **Usage**: Roughly 300 calls/hr — one workflow listing per repo, plus up to three calls per active workflow (runs, jobs, commit) at 12 collections/hr
- **Headroom**: Significant, but adding many repos or workflows could approach limits
- **Monitoring**: Not currently monitored

### Collector Dependency on GitHub-Hosted Runners
- **Requires**: `gh` CLI and `jq` pre-installed
- **Runs on**: `ubuntu-latest` only
- **Cannot run**: Locally without `gh`/`jq`, on self-hosted runners without tools
- **Portability**: Tied to GitHub Actions ecosystem

### No Collector Health Webhook
- **Current**: Failure detected only by checking Actions tab
- **No**: Alerting, paging, automatic retry beyond GitHub's built-in
- **Workaround**: Manual workflow dispatch re-run

### Collector Commits Create Git History Noise
- **Current**: One commit per data change (every 5 min when runs change)
- **Impact**: `git log` cluttered with `chore(status): ...` commits
- **Mitigation**: Only commits when JSON actually changes (`cmp -s`)

### No Cross-Repo Dependency Modeling
- **Current**: Each repo monitored independently
- **Limitation**: Cannot express "frontend depends on backend" relationships
- **Future**: Could add `depends_on` field in repo config

---

## Frontend Limitations

### Static Validation Only, No Browser Test Suite
- **Current**: static validation (JS/JSON/HTML/CSS/schema/assets) runs locally before a push; browser flows are tested manually (`TESTING_GUIDE.md`)
- **Risk**: UI and interaction regressions are caught only by human verification
- **Coverage**: Responsive (6 viewports × 2 themes), functional flows
- **Tooling**: `@playwright/test` is installed but no committed browser suite exists

### No TypeScript / Type Safety
- **Current**: Plain JavaScript (ES2020 modules)
- **Risk**: Runtime errors from typos, refactoring mistakes
- **Mitigation**: JSDoc comments, small modules, careful review

### Client-Side Only Rendering
- **Current**: All rendering in browser after JS loads
- **No SSR**: First paint waits for JS (but inline theme script prevents flash)
- **SEO**: Not applicable (internal tool)

### IP Lookup Dependency
- **Current**: `ipwho.is` for visitor info (footer)
- **Failure Mode**: Shows "Unavailable" silently
- **Risks**: External service downtime, rate limits, CORS/browser blockers
- **Gap**: A `success: false` response without `ip` is treated as "Unavailable" but is not distinguished from a network failure
- **No Fallback**: No alternative provider

### Stale Threshold Independent of Collector Schedule
- **Frontend**: 10 minutes stale threshold
- **Collector**: 5 minutes schedule
- **Gap**: Up to 10 minutes of stale data before warning
- **Design**: Intentional (allows 1 collector failure without alarm)

### Manual Refresh Does Not Trigger Collection
- **Current**: Refresh button only re-fetches published `status.json`
- **Misconception Risk**: Users may think it triggers new collection
- **Documented**: In UI tooltip, AGENTS.md, README.md

### No Offline Support
- **Current**: Requires network for initial load and every refresh
- **No**: Service worker, cached data display when offline
- **Reason**: Internal tool, always online expected

---

## Data Limitations

### Schema Versioning Manual
- **Current**: `schemaVersion: 2` in JSON
- **Process**: Manual bump on breaking changes
- **Risk**: Forgotten bump → frontend breaks silently

### History Limited to 5 Runs per Workflow
- **Current**: `MAX_RUNS_PER_WORKFLOW=5`, also used as `per_page=5`
- **Reason**: JSON file size, render performance
- **Configurable**: Only by editing the collector script

### No Duration for In-Progress Runs
- **Current**: `latestRun.completedAt` is empty/null until GitHub reports completion
- **Frontend**: Shows elapsed time since `startedAt` (calculated client-side)
- **Accuracy**: Approximate (client clock vs GitHub clock)

### Commit Message Truncation
- **Current**: First line only (`head -n 1`)
- **Reason**: Single-line display in dashboard
- **Loss**: Full commit message not stored

### No Artifact / Log Links in History
- **Current**: Only `runUrl` (workflow run page)
- **Missing**: Direct links to job logs, artifacts
- **Reason**: Would require additional API calls per run

---

## Deployment Limitations

### GitHub Pages Only
- **Current**: Single deployment target
- **No**: Multi-region, CDN configuration, custom headers
- **Custom Domain**: Reserved but not configured (`CNAME` empty)

### No Staging / Preview Environments
- **Current**: Push to `main` → production
- **No**: PR previews, staging branch, feature branch deploys
- **Reason**: Simplicity, low risk, small team

### No Build Step / Optimization
- **Current**: Raw HTML/CSS/JS served
- **No**: Minification, bundling, tree-shaking, compression (beyond GitHub Pages defaults)
- **Impact**: Larger than necessary transfer (but still tiny ~50 KB total)

### Deploy Triggered by Collector Commits
- **Current**: Collector commit → deploy workflow → Pages update
- **Race Condition**: Theoretical — collector commit + developer push concurrent
- **Mitigation**: `concurrency` groups, fast deploys

---

## Operational Limitations

### No Structured Logging / Metrics
- **Current**: `echo` statements in collector, browser console
- **No**: Centralized logging, metrics export, dashboards
- **Observability**: Limited to GitHub Actions logs + manual checks

### Single Point of Failure: PAT
- **Current**: One fine-grained PAT for all collector API access
- **Risk**: Token expiry → collector stops; token compromise → read access to 3 repos
- **Rotation**: Manual process, no automation

### No Disaster Recovery Automation
- **Current**: Manual rollback procedures (ROLLOVER_GUIDE.md)
- **No**: Automated failover, backup restoration, chaos testing

### Documentation Maintenance Manual
- **Current**: Docs in `docs/` updated manually with code changes
- **Risk**: Drift between code and documentation
- **Mitigation**: AGENTS.md mandates doc updates; review checklist

---

## Security Limitations

### No Content Security Policy
- **Current**: No CSP header (GitHub Pages limitation)
- **Risk**: XSS if any injection vector found
- **Mitigation**: `escapeHtml()` on all dynamic content, no `eval`, no user input

### No Subresource Integrity
- **Current**: No SRI hashes on external resources (none used)
- **Not Applicable**: All resources local

### Visitor IP Sent to Third Party
- **Current**: `ipwho.is` receives visitor IP
- **Privacy**: Not stored by us, but visible to ipwho.is
- **Disclosure**: Footer note explains this

---

## Future Considerations (Not Limitations Per Se)

These are areas where the architecture would need significant changes to support:

| Feature | Required Changes |
|---------|------------------|
| Real-time updates | WebSocket server / SSE endpoint / GitHub webhook receiver |
| Authentication | Backend auth service, protected Pages (not possible on free tier) |
| Multi-branch | Per-repo branch config, schema changes |
| Historical analytics | Database, aggregation pipeline, charting library |
| Alerting | Webhook handler, notification service, on-call rotation |
| Multi-repo dependencies | Graph model, topological status computation |
| Team dashboards | User accounts, preferences, saved views |

---

## Acceptance Criteria for Current Scope

The following are **intentionally out of scope** for Phase 1 and documented as accepted limitations:

- ✅ Real-time / push updates
- ✅ Authentication / RBAC
- ✅ Automated browser/E2E testing
- ✅ TypeScript
- ✅ Staging environments
- ✅ Historical trend analysis
- ✅ Alerting / paging
- ✅ Custom domain (reserved only)
- ✅ CSP / SRI
- ✅ Offline support
- ✅ Multi-region deployment

These may be revisited in future phases if requirements change.