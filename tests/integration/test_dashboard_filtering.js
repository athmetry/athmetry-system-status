#!/usr/bin/env node
/**
 * Dashboard Filtering Tests
 * Tests the getDisplayWorkflows and calculateOverallStatus functions
 */

import {
  getDisplayWorkflows,
  calculateOverallStatus,
  resolveEffectiveStatus,
  getStatusLabel,
  getStatusClass,
  escapeHtml
} from '../../js/dashboard.js';
import {
  StatusApi,
  deriveEffectiveStatus,
  isHiddenInternalWorkflow
} from '../../js/api.js';

// Test data for system-status repo with deploy workflow
const SYSTEM_STATUS_REPO_WITH_DEPLOY = {
  name: 'athmetry-system-status',
  owner: 'athmetry',
  repo: 'athmetry-system-status',
  error: null,
  overallStatus: 'success',
  workflows: [
    {
      id: 1,
      name: 'Collect System Status',
      path: '.github/workflows/collect-status.yml',
      state: 'active',
      html_url: 'https://github.com/athmetry/athmetry-system-status/actions/workflows/collect-status.yml',
      effectiveStatus: 'success',
      latestStatus: 'completed',
      latestConclusion: 'success',
      latestRun: { runNumber: 34 },
      history: []
    },
    {
      id: 2,
      name: 'Security Scan',
      path: '.github/workflows/security-scan.yml',
      state: 'active',
      html_url: 'https://github.com/athmetry/athmetry-system-status/actions/workflows/security-scan.yml',
      effectiveStatus: 'success',
      latestStatus: 'completed',
      latestConclusion: 'success',
      latestRun: { runNumber: 9 },
      history: []
    },
    {
      id: 3,
      name: 'Deploy to GitHub Pages',
      path: '.github/workflows/deploy-pages.yml',
      state: 'active',
      html_url: 'https://github.com/athmetry/athmetry-system-status/actions/workflows/deploy-pages.yml',
      effectiveStatus: 'success',
      latestStatus: 'completed',
      latestConclusion: 'success',
      latestRun: { runNumber: 30 },
      history: []
    }
  ]
};

// Test data for system-status repo without deploy workflow
const SYSTEM_STATUS_REPO_WITHOUT_DEPLOY = {
  name: 'athmetry-system-status',
  owner: 'athmetry',
  repo: 'athmetry-system-status',
  error: null,
  overallStatus: 'success',
  workflows: [
    {
      id: 1,
      name: 'Collect System Status',
      path: '.github/workflows/collect-status.yml',
      state: 'active',
      html_url: 'https://github.com/athmetry/athmetry-system-status/actions/workflows/collect-status.yml',
      effectiveStatus: 'success',
      latestStatus: 'completed',
      latestConclusion: 'success',
      latestRun: { runNumber: 34 },
      history: []
    },
    {
      id: 2,
      name: 'Security Scan',
      path: '.github/workflows/security-scan.yml',
      state: 'active',
      html_url: 'https://github.com/athmetry/athmetry-system-status/actions/workflows/security-scan.yml',
      effectiveStatus: 'success',
      latestStatus: 'completed',
      latestConclusion: 'success',
      latestRun: { runNumber: 9 },
      history: []
    }
  ]
};

// Test data for backend repo (should not be filtered, except internal reporters)
const BACKEND_REPO = {
  name: 'athmetry-backend',
  owner: 'athmetry',
  repo: 'athmetry-backend',
  error: null,
  overallStatus: 'success',
  workflows: [
    {
      id: 1,
      name: 'Athmetry Backend Validation',
      path: '.github/workflows/ci.yml',
      state: 'active',
      html_url: 'https://github.com/athmetry/athmetry-backend/actions/workflows/ci.yml',
      effectiveStatus: 'success',
      latestStatus: 'completed',
      latestConclusion: 'success',
      latestRun: { runNumber: 38 },
      history: []
    },
    {
      id: 2,
      name: 'Deploy to Production', // Different name - should not be filtered
      path: '.github/workflows/deploy.yml',
      state: 'active',
      html_url: 'https://github.com/athmetry/athmetry-backend/actions/workflows/deploy.yml',
      effectiveStatus: 'success',
      latestStatus: 'completed',
      latestConclusion: 'success',
      latestRun: { runNumber: 10 },
      history: []
    }
  ]
};

// Test data with the internal reporter workflows that must stay hidden
const BACKEND_WITH_REPORTER = {
  name: 'athmetry-backend',
  workflows: [
    { id: 1, name: 'Athmetry Backend Validation', effectiveStatus: 'success' },
    { id: 2, name: 'Athmetry Backend Status Reporter', effectiveStatus: 'success' }
  ]
};

const FRONTEND_WITH_REPORTER = {
  name: 'athmetry-frontend',
  workflows: [
    { id: 1, name: 'Athmetry Frontend CI', effectiveStatus: 'success' },
    { id: 2, name: 'Dependency Audit', effectiveStatus: 'success' },
    { id: 3, name: 'Athmetry Frontend Status Reporter', effectiveStatus: 'success' }
  ]
};

const FAILING_REPORTER_REPO = {
  name: 'athmetry-backend',
  workflows: [
    { id: 1, name: 'Athmetry Backend Validation', effectiveStatus: 'success' },
    { id: 2, name: 'Athmetry Backend Status Reporter', effectiveStatus: 'failure' }
  ]
};

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passed++;
  } else {
    console.log(`✗ FAIL: ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`✓ PASS: ${message}`);
    passed++;
  } else {
    console.log(`✗ FAIL: ${message} (expected: ${expected}, got: ${actual})`);
    failed++;
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    console.log(`✓ PASS: ${message}`);
    passed++;
  } else {
    console.log(`✗ FAIL: ${message}`);
    console.log(`  Expected: ${expectedStr}`);
    console.log(`  Actual:   ${actualStr}`);
    failed++;
  }
}

// Test getDisplayWorkflows
console.log('\n=== Testing getDisplayWorkflows ===\n');

// Test 1: system-status repo with deploy workflow - should filter it out
const filteredSystemStatus = getDisplayWorkflows(SYSTEM_STATUS_REPO_WITH_DEPLOY);
assertEqual(filteredSystemStatus.length, 2, 'System-status with deploy: returns 2 workflows (excludes Deploy to GitHub Pages)');
assertEqual(filteredSystemStatus[0].name, 'Collect System Status', 'System-status: first workflow is Collect System Status');
assertEqual(filteredSystemStatus[1].name, 'Security Scan', 'System-status: second workflow is Security Scan');

// Test 2: system-status repo without deploy workflow - should return all
const filteredSystemStatusNoDeploy = getDisplayWorkflows(SYSTEM_STATUS_REPO_WITHOUT_DEPLOY);
assertEqual(filteredSystemStatusNoDeploy.length, 2, 'System-status without deploy: returns 2 workflows');
assertEqual(filteredSystemStatusNoDeploy[0].name, 'Collect System Status', 'System-status no deploy: first is Collect System Status');
assertEqual(filteredSystemStatusNoDeploy[1].name, 'Security Scan', 'System-status no deploy: second is Security Scan');

// Test 3: backend repo - should not filter anything (even if it has a deploy-like workflow)
const filteredBackend = getDisplayWorkflows(BACKEND_REPO);
assertEqual(filteredBackend.length, 2, 'Backend repo: returns 2 workflows (no filtering)');
assertEqual(filteredBackend[0].name, 'Athmetry Backend Validation', 'Backend: first is Athmetry Backend Validation');
assertEqual(filteredBackend[1].name, 'Deploy to Production', 'Backend: second is Deploy to Production (not filtered)');

// Test 4: repo with no workflows
const EMPTY_REPO = { name: 'test-repo', workflows: [] };
assertEqual(getDisplayWorkflows(EMPTY_REPO).length, 0, 'Empty workflows array: returns empty array');

// Test 5: repo with missing workflows property
const NO_WORKFLOWS_REPO = { name: 'test-repo' };
assertEqual(getDisplayWorkflows(NO_WORKFLOWS_REPO).length, 0, 'Missing workflows property: returns empty array');

// Test 6: system-status with only deploy workflow
const ONLY_DEPLOY_REPO = {
  name: 'athmetry-system-status',
  workflows: [
    { name: 'Deploy to GitHub Pages', effectiveStatus: 'success' }
  ]
};
assertEqual(getDisplayWorkflows(ONLY_DEPLOY_REPO).length, 0, 'System-status with only deploy workflow: returns empty array');

// Test 7: internal Status Reporter workflows are hidden, application pipelines remain
const filteredBackendReporter = getDisplayWorkflows(BACKEND_WITH_REPORTER);
assertEqual(filteredBackendReporter.length, 1, 'Backend reporter: returns only the application workflow');
assertEqual(filteredBackendReporter[0].name, 'Athmetry Backend Validation', 'Backend reporter: validation workflow remains visible');

const filteredFrontendReporter = getDisplayWorkflows(FRONTEND_WITH_REPORTER);
assertEqual(filteredFrontendReporter.length, 2, 'Frontend reporter: returns only application workflows');
assertEqual(filteredFrontendReporter[0].name, 'Athmetry Frontend CI', 'Frontend reporter: CI workflow remains visible');
assertEqual(filteredFrontendReporter[1].name, 'Dependency Audit', 'Frontend reporter: dependency audit remains visible');

// Test 8: hidden reporter workflows do not affect displayed repository health
const filteredFailingReporter = getDisplayWorkflows(FAILING_REPORTER_REPO);
assertEqual(filteredFailingReporter.length, 1, 'Failing reporter: only the application workflow is displayed');
assertEqual(
  calculateOverallStatus(filteredFailingReporter),
  'success',
  'Failing internal reporter does not affect displayed repository health'
);

// Test 9: source data is not mutated by display filtering
getDisplayWorkflows(BACKEND_WITH_REPORTER);
assertEqual(BACKEND_WITH_REPORTER.workflows.length, 2, 'Display filtering does not mutate source workflows');

// Test calculateOverallStatus
console.log('\n=== Testing calculateOverallStatus ===\n');

// Test 7: all success
const ALL_SUCCESS = [
  { effectiveStatus: 'success' },
  { effectiveStatus: 'success' }
];
assertEqual(calculateOverallStatus(ALL_SUCCESS), 'success', 'All success: returns success');

// Test 8: one failure
const ONE_FAILURE = [
  { effectiveStatus: 'success' },
  { effectiveStatus: 'failure' }
];
assertEqual(calculateOverallStatus(ONE_FAILURE), 'failure', 'One failure: returns failure');

// Test 9: one running
const ONE_RUNNING = [
  { effectiveStatus: 'success' },
  { effectiveStatus: 'running' }
];
assertEqual(calculateOverallStatus(ONE_RUNNING), 'running', 'One running: returns running');

// Test 10: queued counts as running
const ONE_QUEUED = [
  { effectiveStatus: 'success' },
  { effectiveStatus: 'queued' }
];
assertEqual(calculateOverallStatus(ONE_QUEUED), 'running', 'One queued: returns running');

// Test 11: unknown statuses
const ALL_UNKNOWN = [
  { effectiveStatus: 'unknown' },
  { effectiveStatus: 'unknown' }
];
assertEqual(calculateOverallStatus(ALL_UNKNOWN), 'unknown', 'All unknown: returns unknown');

// Test 12: empty workflows
assertEqual(calculateOverallStatus([]), 'unknown', 'Empty workflows: returns unknown');

// Test 13: mixed success and failure - failure wins
const MIXED = [
  { effectiveStatus: 'success' },
  { effectiveStatus: 'failure' },
  { effectiveStatus: 'running' }
];
assertEqual(calculateOverallStatus(MIXED), 'failure', 'Mixed with failure: returns failure');

// Test 14: running + success = running
const RUNNING_SUCCESS = [
  { effectiveStatus: 'running' },
  { effectiveStatus: 'success' }
];
assertEqual(calculateOverallStatus(RUNNING_SUCCESS), 'running', 'Running + success: returns running');

// Test 15: system-status overall status with filtering
const systemStatusWithDeploy = SYSTEM_STATUS_REPO_WITH_DEPLOY;
const filteredWorkflows = getDisplayWorkflows(systemStatusWithDeploy);
const overallStatus = calculateOverallStatus(filteredWorkflows);
assertEqual(overallStatus, 'success', 'System-status (filtered): overall status is success');

// Test 16: system-status with failed collect but successful deploy - should show failure
const FAILED_COLLECT_REPO = {
  name: 'athmetry-system-status',
  workflows: [
    { name: 'Collect System Status', effectiveStatus: 'failure' },
    { name: 'Security Scan', effectiveStatus: 'success' },
    { name: 'Deploy to GitHub Pages', effectiveStatus: 'success' }
  ]
};
const filteredFailed = getDisplayWorkflows(FAILED_COLLECT_REPO);
const failedOverall = calculateOverallStatus(filteredFailed);
assertEqual(failedOverall, 'failure', 'System-status with failed collect (deploy filtered): shows failure');

// Test 17: system-status with running collect but successful deploy - should show running
const RUNNING_COLLECT_REPO = {
  name: 'athmetry-system-status',
  workflows: [
    { name: 'Collect System Status', effectiveStatus: 'running' },
    { name: 'Security Scan', effectiveStatus: 'success' },
    { name: 'Deploy to GitHub Pages', effectiveStatus: 'success' }
  ]
};
const filteredRunning = getDisplayWorkflows(RUNNING_COLLECT_REPO);
const runningOverall = calculateOverallStatus(filteredRunning);
assertEqual(runningOverall, 'running', 'System-status with running collect (deploy filtered): shows running');

// Test status resolution, labels, escaping, and API self-monitoring
console.log('\n=== Testing Status Resolution, Labels, Escaping & API Self-Monitoring ===\n');

// Completed latestRun overrides stale running effectiveStatus
const STALE_RUNNING_COMPLETED_RUN = {
  name: 'Collect System Status',
  path: '.github/workflows/collect-status.yml',
  effectiveStatus: 'running',
  latestStatus: 'in_progress',
  latestConclusion: 'unknown',
  latestRun: {
    status: 'completed',
    conclusion: 'success',
    runNumber: 65
  }
};
assertEqual(
  resolveEffectiveStatus(STALE_RUNNING_COMPLETED_RUN),
  'success',
  'Completed latestRun (success) overrides stale running effectiveStatus'
);
assertEqual(
  calculateOverallStatus([STALE_RUNNING_COMPLETED_RUN]),
  'success',
  'calculateOverallStatus resolves completed latestRun as success instead of running'
);

// Raw GitHub statuses and conclusions map to proper labels and classes
assertEqual(getStatusLabel('completed'), 'Completed', 'Raw status "completed" renders "Completed"');
assertEqual(getStatusClass('completed'), 'success', 'Raw status "completed" uses success class');
assertEqual(getStatusLabel('in_progress'), 'Running', 'Raw status "in_progress" renders "Running"');
assertEqual(getStatusClass('in_progress'), 'running', 'Raw status "in_progress" uses running class');
assertEqual(getStatusLabel('waiting'), 'Queued', 'Raw status "waiting" renders "Queued"');
assertEqual(getStatusLabel('timed_out'), 'Timed Out', 'Raw conclusion "timed_out" renders "Timed Out"');
assertEqual(getStatusClass('timed_out'), 'failure', 'Raw conclusion "timed_out" uses failure class');
assertEqual(getStatusLabel('startup_failure'), 'Startup Failure', 'Raw conclusion "startup_failure" renders "Startup Failure"');
assertEqual(getStatusLabel('neutral'), 'Neutral', 'Raw conclusion "neutral" renders "Neutral"');

// HTML escaping
assertEqual(
  escapeHtml('<script src="x">&\'</script>'),
  '&lt;script src=&quot;x&quot;&gt;&amp;&#039;&lt;/script&gt;',
  'escapeHtml escapes &, <, >, ", and \''
);

// API deriveEffectiveStatus & isHiddenInternalWorkflow
assertEqual(deriveEffectiveStatus('completed', 'neutral'), 'success', 'API deriveEffectiveStatus maps neutral to success');
assertEqual(deriveEffectiveStatus('completed', 'startup_failure'), 'failure', 'API deriveEffectiveStatus maps startup_failure to failure');
assertEqual(deriveEffectiveStatus('waiting', null), 'queued', 'API deriveEffectiveStatus maps waiting to queued');
assert(isHiddenInternalWorkflow('athmetry-system-status', 'Deploy to GitHub Pages'), 'Deploy to GitHub Pages is hidden internal for system-status');
assert(!isHiddenInternalWorkflow('athmetry-backend', 'Deploy to GitHub Pages'), 'Deploy to GitHub Pages is not hidden for backend');
assert(isHiddenInternalWorkflow('athmetry-backend', 'Athmetry Backend Status Reporter'), 'Backend Status Reporter is hidden internal');

// API processWorkflow self-monitoring requests status=completed and excludes in_progress from history
const api = new StatusApi();
const requestedUrls = [];
api.fetchWithTimeout = async (url) => {
  requestedUrls.push(url);
  if (url.includes('/runs?')) {
    return {
      ok: true,
      json: async () => ({
        workflow_runs: [
          { id: 100, run_number: 65, status: 'in_progress', conclusion: null, head_sha: 'abc12345', html_url: 'https://example.com/100', created_at: '2026-11-21T00:05:00Z', updated_at: '2026-11-21T00:05:01Z' },
          { id: 99, run_number: 64, status: 'completed', conclusion: 'success', head_sha: 'def67890', html_url: 'https://example.com/99', created_at: '2026-11-21T00:00:00Z', updated_at: '2026-11-21T00:00:20Z' }
        ]
      })
    };
  }
  return { ok: true, json: async () => ({ jobs: [], commit: { message: 'ok', author: { name: 'bot' } } }) };
};

const processedCollector = await api.processWorkflow('athmetry', 'athmetry-system-status', {
  id: 302,
  name: 'Collect System Status',
  path: '.github/workflows/collect-status.yml',
  state: 'active',
  html_url: 'https://github.com/athmetry/athmetry-system-status/actions/workflows/collect-status.yml'
});
assert(
  requestedUrls[0].includes('status=completed'),
  'StatusApi.processWorkflow queries status=completed for collect-status.yml'
);
assertEqual(processedCollector.effectiveStatus, 'success', 'StatusApi.processWorkflow reports completed collector run as success');
assertEqual(processedCollector.latestRun.runNumber, 64, 'StatusApi.processWorkflow selects completed run #64');
assertEqual(processedCollector.history.length, 1, 'StatusApi.processWorkflow excludes in_progress run from collector history');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  process.exit(1);
}