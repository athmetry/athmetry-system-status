#!/usr/bin/env bash
# Verify the Collect System Status workflow trigger and security contract.
# This test does not dispatch workflows or contact GitHub.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKFLOW_FILE="${REPO_ROOT}/.github/workflows/collect-status.yml"

ruby -ryaml -e '
  workflow = YAML.safe_load(File.read(ARGV.fetch(0)), aliases: true)
  # Psych/YAML 1.1 parses the unquoted `on` key as boolean true.
  triggers = workflow["on"] || workflow[true]
  abort "missing workflow triggers" unless triggers.is_a?(Hash)

  schedule = triggers.fetch("schedule")
  abort "schedule must remain every 30 minutes" unless schedule == [{"cron" => "*/30 * * * *"}]

  abort "workflow_dispatch must remain enabled" unless triggers.key?("workflow_dispatch")

  abort "premature push trigger must not be enabled on collector" if triggers.key?("push")

  workflow_run = triggers.fetch("workflow_run")
  abort "workflow_run must be restricted to main" unless workflow_run["branches"] == ["main"]
  abort "workflow_run must trigger on completed only" unless workflow_run["types"] == ["completed"]
  abort "workflow_run workflows must match CI Integration Tests and Security Scan" unless workflow_run["workflows"] == ["CI Integration Tests", "Security Scan"]
  abort "collector must not trigger itself via workflow_run" if workflow_run.fetch("workflows", []).include?("Collect System Status")
  abort "deploy workflow must not trigger collector via workflow_run" if workflow_run.fetch("workflows", []).include?("Deploy to GitHub Pages")

  concurrency = workflow.fetch("concurrency")
  abort "collector concurrency group changed" unless concurrency["group"] == "collect-status"
  abort "collector concurrency policy changed" unless concurrency["cancel-in-progress"] == false

  abort "workflow permissions must be least-privilege read" unless workflow.fetch("permissions") == {"contents" => "read"}
  collect_job = workflow.fetch("jobs").fetch("collect")
  abort "collect job permissions must be contents: write" unless collect_job.fetch("permissions") == {"contents" => "write"}
' "${WORKFLOW_FILE}"

echo "✓ PASS: Collector triggers on completed CI Integration Tests and Security Scan workflow_run on main, 30-min schedule, and workflow_dispatch"
echo "✓ PASS: Premature push trigger and self/deploy loop triggers are absent"
echo "✓ PASS: Concurrency (cancel-in-progress: false) and least-privilege permissions are preserved"
