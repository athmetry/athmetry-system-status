#!/usr/bin/env node
/**
 * Dashboard Filtering Tests
 * Tests the getDisplayWorkflows and calculateOverallStatus functions
 */

import { getDisplayWorkflows, calculateOverallStatus } from '../../js/dashboard.js';

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

// Test data for backend repo (should not be filtered)
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

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  process.exit(1);
}