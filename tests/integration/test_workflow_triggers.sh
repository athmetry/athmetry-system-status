#!/usr/bin/env bash
# Verify the Collect System Status workflow trigger contract.
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

  push = triggers.fetch("push")
  abort "push must be restricted to main" unless push["branches"] == ["main"]
  abort "push path must be the Backend event only" unless push["paths"] == ["data/status-events/backend.json"]
  abort "data/status.json must not trigger collection" if push.fetch("paths", []).include?("data/status.json")

  concurrency = workflow.fetch("concurrency")
  abort "collector concurrency group changed" unless concurrency["group"] == "collect-status"
  abort "collector concurrency policy changed" unless concurrency["cancel-in-progress"] == false

  abort "collector permissions changed" unless workflow.fetch("permissions") == {"contents" => "write"}
' "${WORKFLOW_FILE}"

echo "✓ PASS: Collector triggers are schedule, workflow_dispatch, and Backend-event push only"
echo "✓ PASS: Push trigger is restricted to main and data/status-events/backend.json"
echo "✓ PASS: 30-minute schedule, concurrency, and permissions are preserved"
