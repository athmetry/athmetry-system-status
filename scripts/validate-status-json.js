#!/usr/bin/env node
/**
 * validate-status-json.js
 * Validates the data/status.json against expected schema.
 * Can be used as a pre-commit hook or CI step.
 */

const fs = require('fs');
const path = require('path');

const STATUS_FILE = path.join(__dirname, '..', 'data', 'status.json');
const EXPECTED_SCHEMA_VERSION = 2;
const STALE_THRESHOLD_MINUTES = 10;

const VALID_REPO_STATUSES = ['success', 'failure', 'running', 'unknown'];
const VALID_WORKFLOW_STATUSES = ['success', 'failure', 'running', 'queued', 'cancelled', 'skipped', 'unknown'];

function validateData(data) {
  const errors = [];
  const warnings = [];

  // Check schema version
  if (data.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    errors.push(`Expected schema version ${EXPECTED_SCHEMA_VERSION}, got ${data.schemaVersion}`);
  }

  // Check required fields
  if (!data.collectedAt || typeof data.collectedAt !== 'string') {
    errors.push('Missing or invalid collectedAt field');
  } else {
    const collectedTime = new Date(data.collectedAt).getTime();
    if (isNaN(collectedTime)) {
      errors.push('collectedAt is not a valid ISO timestamp');
    } else {
      const ageMinutes = (Date.now() - collectedTime) / 60000;
      if (ageMinutes > STALE_THRESHOLD_MINUTES) {
        warnings.push(`Data is ${Math.round(ageMinutes)} minutes old (stale threshold: ${STALE_THRESHOLD_MINUTES} minutes)`);
      }
    }
  }

  if (!data.monitoredBranch || typeof data.monitoredBranch !== 'string') {
    errors.push('Missing or invalid monitoredBranch field');
  }

  if (!Array.isArray(data.repositories)) {
    errors.push('Missing or invalid repositories array');
  } else {
    // Validate each repository
    for (const repo of data.repositories) {
      if (!repo.name || typeof repo.name !== 'string') {
        errors.push('Repository missing name');
      }
      if (!repo.owner || typeof repo.owner !== 'string') {
        errors.push(`Repository ${repo.name} missing owner`);
      }
      if (!repo.repo || typeof repo.repo !== 'string') {
        errors.push(`Repository ${repo.name} missing repo`);
      }
      if (!VALID_REPO_STATUSES.includes(repo.overallStatus)) {
        errors.push(`Repository ${repo.name} has invalid overallStatus: ${repo.overallStatus}`);
      }
      if (!Array.isArray(repo.workflows)) {
        errors.push(`Repository ${repo.name} missing workflows array`);
      } else {
        // Validate workflows
        for (const wf of repo.workflows) {
          if (!wf.id || typeof wf.id !== 'number') {
            errors.push(`Workflow in ${repo.name} missing id`);
          }
          if (!wf.name || typeof wf.name !== 'string') {
            errors.push(`Workflow in ${repo.name} missing name`);
          }
          if (!VALID_WORKFLOW_STATUSES.includes(wf.effectiveStatus)) {
            errors.push(`Workflow ${wf.name} has invalid effectiveStatus: ${wf.effectiveStatus}`);
          }
          
          // Check latestRun if present
          if (wf.latestRun) {
            if (!wf.latestRun.runNumber || typeof wf.latestRun.runNumber !== 'number') {
              errors.push(`Workflow ${wf.name} latestRun missing runNumber`);
            }
            if (!wf.latestRun.status || typeof wf.latestRun.status !== 'string') {
              errors.push(`Workflow ${wf.name} latestRun missing status`);
            }
          }
          
          // Check history
          if (wf.history && Array.isArray(wf.history)) {
            for (const run of wf.history) {
              if (!run.runNumber || typeof run.runNumber !== 'number') {
                errors.push(`History entry in ${wf.name} missing runNumber`);
              }
              if (!run.status || typeof run.status !== 'string') {
                errors.push(`History entry #${run.runNumber} in ${wf.name} missing status`);
              }
            }
          }
        }
      }
    }
  }

  return { errors, warnings };
}

function main() {
  console.log('Validating status.json...\n');
  
  if (!fs.existsSync(STATUS_FILE)) {
    console.error(`❌ ERROR: File not found: ${STATUS_FILE}`);
    process.exit(1);
  }

  let data;
  try {
    const content = fs.readFileSync(STATUS_FILE, 'utf8');
    data = JSON.parse(content);
  } catch (err) {
    console.error(`❌ ERROR: Failed to parse JSON: ${err.message}`);
    process.exit(1);
  }

  const { errors, warnings } = validateData(data);

  if (errors.length > 0) {
    console.error('❌ VALIDATION FAILED:');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log('✅ VALIDATION PASSED: data/status.json is valid');
  
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach(warn => console.log(`  - ${warn}`));
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log(`  Schema version: ${data.schemaVersion}`);
  console.log(`  Collected at: ${data.collectedAt}`);
  console.log(`  Monitored branch: ${data.monitoredBranch}`);
  console.log(`  Repositories: ${data.repositories.length}`);
  
  data.repositories.forEach(repo => {
    console.log(`  - ${repo.name}: ${repo.workflows.length} workflows, overall: ${repo.overallStatus}`);
    repo.workflows.forEach(wf => {
      console.log(`    - ${wf.name}: ${wf.effectiveStatus} (latest: #${wf.latestRun?.runNumber || 'N/A'})`);
    });
  });
}

main();