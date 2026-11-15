#!/usr/bin/env bash
# Integration tests for Frontend event integration
# Tests execute the actual production collector functions from collect-status.sh

set -uo pipefail

# Source the production collector functions (without running main)
source /Users/tausif/Documents/Projects/athmetry/athmetry-system-status/.github/scripts/collect-status.sh

# Set up isolated temporary directory
TEMP_DIR="$(mktemp -d)"
export TEMP_DIR
trap 'rm -rf "${TEMP_DIR}"' EXIT

# Set the FRONTEND_EVENT_FILE to the test fixture path for the main tests
export FRONTEND_EVENT_FILE="/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json"

# Test helper functions
check_error_output() {
    local event_file="$1"
    local pattern="$2"
    local output
    # Temporarily override FRONTEND_EVENT_FILE for this check
    local old_event_file="$FRONTEND_EVENT_FILE"
    export FRONTEND_EVENT_FILE="$event_file"
    output=$(read_frontend_event 2>&1)
    export FRONTEND_EVENT_FILE="$old_event_file"
    if echo "$output" | grep -q "$pattern"; then
        return 0
    else
        return 1
    fi
}

main() {
    echo "=== Testing Frontend Event Integration (using production functions) ==="

    # Test 1: Valid event file exists and passes validation
    echo ""
    echo "Test 1: Valid event validation"
    if read_frontend_event >/dev/null 2>&1; then
        echo "✓ PASS: Valid event passes validation"
    else
        echo "✗ FAIL: Valid event should pass validation"
        read_frontend_event
        exit 1
    fi

    # Test 2: Invalid commit SHA rejected
    echo ""
    echo "Test 2: Invalid commit SHA rejected"
    INVALID_SHA_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.payload.commit.sha = "invalid"')
    echo "$INVALID_SHA_EVENT" > "${TEMP_DIR}/invalid_sha.json"
    if check_error_output "${TEMP_DIR}/invalid_sha.json" "ERROR.*commit SHA is invalid"; then
        echo "✓ PASS: Invalid commit SHA rejected"
    else
        echo "✗ FAIL: Invalid commit SHA should be rejected"
        read_frontend_event "${TEMP_DIR}/invalid_sha.json"
        exit 1
    fi

    # Test 3: Missing workflow URL rejected
    echo ""
    echo "Test 3: Missing workflow URL rejected"
    MISSING_URL_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq 'del(.payload.workflow.runUrl)')
    echo "$MISSING_URL_EVENT" > "${TEMP_DIR}/missing_url.json"
    if check_error_output "${TEMP_DIR}/missing_url.json" "ERROR.*workflow run URL is missing"; then
        echo "✓ PASS: Missing workflow URL rejected"
    else
        echo "✗ FAIL: Missing workflow URL should be rejected"
        read_frontend_event "${TEMP_DIR}/missing_url.json"
        exit 1
    fi

    # Test 4: Wrong repository rejected
    echo ""
    echo "Test 4: Wrong repository rejected"
    WRONG_REPO_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.payload.repository = "wrong-repo"')
    echo "$WRONG_REPO_EVENT" > "${TEMP_DIR}/wrong_repo.json"
    if check_error_output "${TEMP_DIR}/wrong_repo.json" "ERROR.*repository mismatch"; then
        echo "✓ PASS: Wrong repository rejected"
    else
        echo "✗ FAIL: Wrong repository should be rejected"
        read_frontend_event "${TEMP_DIR}/wrong_repo.json"
        exit 1
    fi

    # Test 5: Wrong product rejected
    echo ""
    echo "Test 5: Wrong product rejected"
    WRONG_PRODUCT_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.payload.product = "WRONG-PRODUCT"')
    echo "$WRONG_PRODUCT_EVENT" > "${TEMP_DIR}/wrong_product.json"
    if check_error_output "${TEMP_DIR}/wrong_product.json" "ERROR.*product mismatch"; then
        echo "✓ PASS: Wrong product rejected"
    else
        echo "✗ FAIL: Wrong product should be rejected"
        read_frontend_event "${TEMP_DIR}/wrong_product.json"
        exit 1
    fi

    # Test 6: Wrong branch rejected
    echo ""
    echo "Test 6: Wrong branch rejected"
    WRONG_BRANCH_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.payload.branch = "develop"')
    echo "$WRONG_BRANCH_EVENT" > "${TEMP_DIR}/wrong_branch.json"
    if check_error_output "${TEMP_DIR}/wrong_branch.json" "ERROR.*branch mismatch"; then
        echo "✓ PASS: Wrong branch rejected"
    else
        echo "✗ FAIL: Wrong branch should be rejected"
        read_frontend_event "${TEMP_DIR}/wrong_branch.json"
        exit 1
    fi

    # Test 7: Missing meta.sourceRunId rejected
    echo ""
    echo "Test 7: Missing meta.sourceRunId rejected"
    MISSING_RUNID_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq 'del(.meta.sourceRunId)')
    echo "$MISSING_RUNID_EVENT" > "${TEMP_DIR}/missing_runid.json"
    if check_error_output "${TEMP_DIR}/missing_runid.json" "ERROR.*missing meta.sourceRunId"; then
        echo "✓ PASS: Missing meta.sourceRunId rejected"
    else
        echo "✗ FAIL: Missing meta.sourceRunId should be rejected"
        read_frontend_event "${TEMP_DIR}/missing_runid.json"
        exit 1
    fi

    # Test 8: Missing meta.sourceRunAttempt rejected
    echo ""
    echo "Test 8: Missing meta.sourceRunAttempt rejected"
    MISSING_ATTEMPT_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq 'del(.meta.sourceRunAttempt)')
    echo "$MISSING_ATTEMPT_EVENT" > "${TEMP_DIR}/missing_attempt.json"
    if check_error_output "${TEMP_DIR}/missing_attempt.json" "ERROR.*missing meta.sourceRunAttempt"; then
        echo "✓ PASS: Missing meta.sourceRunAttempt rejected"
    else
        echo "✗ FAIL: Missing meta.sourceRunAttempt should be rejected"
        read_frontend_event "${TEMP_DIR}/missing_attempt.json"
        exit 1
    fi

    # Test 9: Invalid meta.sourceRunId (non-numeric) rejected
    echo ""
    echo "Test 9: Invalid meta.sourceRunId (non-numeric) rejected"
    INVALID_RUNID_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.meta.sourceRunId = "not-a-number"')
    echo "$INVALID_RUNID_EVENT" > "${TEMP_DIR}/invalid_runid.json"
    if check_error_output "${TEMP_DIR}/invalid_runid.json" "ERROR.*meta.sourceRunId is not a valid positive integer"; then
        echo "✓ PASS: Invalid meta.sourceRunId rejected"
    else
        echo "✗ FAIL: Invalid meta.sourceRunId should be rejected"
        read_frontend_event "${TEMP_DIR}/invalid_runid.json"
        exit 1
    fi

    # Test 10: Invalid meta.sourceRunAttempt (non-numeric) rejected
    echo ""
    echo "Test 10: Invalid meta.sourceRunAttempt (non-numeric) rejected"
    INVALID_ATTEMPT_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.meta.sourceRunAttempt = "not-a-number"')
    echo "$INVALID_ATTEMPT_EVENT" > "${TEMP_DIR}/invalid_attempt.json"
    if check_error_output "${TEMP_DIR}/invalid_attempt.json" "ERROR.*meta.sourceRunAttempt is not a valid positive integer"; then
        echo "✓ PASS: Invalid meta.sourceRunAttempt rejected"
    else
        echo "✗ FAIL: Invalid meta.sourceRunAttempt should be rejected"
        read_frontend_event "${TEMP_DIR}/invalid_attempt.json"
        exit 1
    fi

    # Test 11: Missing workflow run URL rejected (duplicate check)
    echo ""
    echo "Test 11: Missing workflow run URL rejected (duplicate check)"
    MISSING_URL_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq 'del(.payload.workflow.runUrl)')
    echo "$MISSING_URL_EVENT" > "${TEMP_DIR}/missing_url2.json"
    if check_error_output "${TEMP_DIR}/missing_url2.json" "ERROR.*workflow run URL is missing"; then
        echo "✓ PASS: Missing workflow run URL rejected"
    else
        echo "✗ FAIL: Missing workflow run URL should be rejected"
        read_frontend_event "${TEMP_DIR}/missing_url2.json"
        exit 1
    fi

    # Test 12: Missing workflow status rejected
    echo ""
    echo "Test 12: Missing workflow status rejected"
    MISSING_STATUS_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq 'del(.payload.workflow.status)')
    echo "$MISSING_STATUS_EVENT" > "${TEMP_DIR}/missing_status.json"
    if check_error_output "${TEMP_DIR}/missing_status.json" "ERROR.*workflow status is missing"; then
        echo "✓ PASS: Missing workflow status rejected"
    else
        echo "✗ FAIL: Missing workflow status should be rejected"
        read_frontend_event "${TEMP_DIR}/missing_status.json"
        exit 1
    fi

    # Test 13: Missing workflow conclusion rejected
    echo ""
    echo "Test 13: Missing workflow conclusion rejected"
    MISSING_CONCLUSION_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq 'del(.payload.workflow.conclusion)')
    echo "$MISSING_CONCLUSION_EVENT" > "${TEMP_DIR}/missing_conclusion.json"
    if check_error_output "${TEMP_DIR}/missing_conclusion.json" "ERROR.*workflow conclusion is missing"; then
        echo "✓ PASS: Missing workflow conclusion rejected"
    else
        echo "✗ FAIL: Missing workflow conclusion should be rejected"
        read_frontend_event "${TEMP_DIR}/missing_conclusion.json"
        exit 1
    fi

    # Test 14: Invalid runNumber (non-positive) rejected
    echo ""
    echo "Test 14: Invalid runNumber rejected"
    INVALID_RUNNUMBER_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.payload.workflow.runNumber = -1')
    echo "$INVALID_RUNNUMBER_EVENT" > "${TEMP_DIR}/invalid_runnumber.json"
    if check_error_output "${TEMP_DIR}/invalid_runnumber.json" "ERROR.*runNumber is not a valid positive integer"; then
        echo "✓ PASS: Invalid runNumber rejected"
    else
        echo "✗ FAIL: Invalid runNumber should be rejected"
        read_frontend_event "${TEMP_DIR}/invalid_runnumber.json"
        exit 1
    fi

    # Test 15: Missing meta.sourceRunId rejected (additional check)
    echo ""
    echo "Test 15: Missing meta.sourceRunId rejected (additional)"
    MISSING_RUNID_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq 'del(.meta.sourceRunId)')
    echo "$MISSING_RUNID_EVENT" > "${TEMP_DIR}/missing_runid2.json"
    if check_error_output "${TEMP_DIR}/missing_runid2.json" "ERROR.*missing meta.sourceRunId"; then
        echo "✓ PASS: Missing meta.sourceRunId rejected"
    else
        echo "✗ FAIL: Missing meta.sourceRunId should be rejected"
        read_frontend_event "${TEMP_DIR}/missing_runid2.json"
        exit 1
    fi

    # ========================================================================
    # MERGE TESTS (using merge_frontend_event)
    # ========================================================================

    # Create a realistic existing frontend repo JSON with history
    EXISTING_REPO='{
      "name": "athmetry-frontend",
      "owner": "athmetry",
      "repo": "athmetry-frontend",
      "error": null,
      "overallStatus": "success",
      "workflows": [
        {
          "id": 411036630,
          "name": "Athmetry Frontend CI",
          "path": ".github/workflows/ci.yml",
          "state": "active",
          "html_url": "https://github.com/athmetry/athmetry-frontend/blob/main/.github/workflows/ci.yml",
          "effectiveStatus": "success",
          "latestStatus": "completed",
          "latestConclusion": "success",
          "latestRun": {
            "status": "completed",
            "conclusion": "success",
            "runId": 42737661398,
            "runNumber": 4,
            "runAttempt": 1,
            "runUrl": "https://github.com/athmetry/athmetry-frontend/actions/runs/42737661398",
            "commitSha": "b827866f1f95965d6e4ffd099b610b4ba1981a71",
            "commitMessage": "docs: synchronize frontend project state and memory",
            "commitAuthor": "mdtausif1",
            "startedAt": "2026-11-10T01:42:15Z",
            "completedAt": "2026-11-10T01:43:11Z",
            "jobs": [
              {
                "name": "ci",
                "status": "completed",
                "conclusion": "success",
                "started_at": "2026-11-10T01:42:19Z",
                "completed_at": "2026-11-10T01:43:10Z"
              }
            ]
          },
          "history": [
            {
              "runNumber": 4,
              "status": "completed",
              "conclusion": "success",
              "commitSha": "b827866f1f95965d6e4ffd099b610b4ba1981a71",
              "startedAt": "2026-11-10T01:42:15Z",
              "completedAt": "2026-11-10T01:43:11Z",
              "runUrl": "https://github.com/athmetry/athmetry-frontend/actions/runs/42737661398"
            },
            {
              "runNumber": 3,
              "status": "completed",
              "conclusion": "success",
              "commitSha": "0ba9a4783016a91a1a0020a31c2b7addaafed016",
              "startedAt": "2026-11-10T01:29:22Z",
              "completedAt": "2026-11-10T01:30:24Z",
              "runUrl": "https://github.com/athmetry/athmetry-frontend/actions/runs/42736122791"
            }
          ]
        },
        {
          "id": 412766100,
          "name": "Dependency Audit",
          "path": ".github/workflows/dependency-audit.yml",
          "state": "active",
          "html_url": "https://github.com/athmetry/athmetry-frontend/blob/main/.github/workflows/dependency-audit.yml",
          "effectiveStatus": "unknown",
          "latestStatus": "unknown",
          "latestConclusion": "unknown",
          "latestRun": null,
          "history": []
        }
      ]
    }'

    # Test 16: Valid newer run ID accepted and merged
    echo ""
    echo "Test 16: Valid newer run ID accepted and merged"
    NEWER_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.meta.sourceRunId = "50000000000" | .payload.workflow.runId = 50000000000 | .payload.workflow.runNumber = 6 | .payload.workflow.runUrl = "https://github.com/athmetry/athmetry-frontend/actions/runs/50000000000"')
    echo "$NEWER_EVENT" > "${TEMP_DIR}/newer_event.json"

    MERGED=$(merge_frontend_event "$EXISTING_REPO" "$NEWER_EVENT")
    if echo "$MERGED" | jq -e '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun.runId == 50000000000' >/dev/null; then
        echo "✓ PASS: Newer run ID accepted and merged"
    else
        echo "✗ FAIL: Newer run ID should be accepted"
        echo "$MERGED" | jq '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun'
        exit 1
    fi

    # Test 17: Stale event (older run ID) rejected
    echo ""
    echo "Test 17: Stale event (older run ID) rejected"
    STALE_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.meta.sourceRunId = "1000" | .payload.workflow.runId = 1000 | .payload.workflow.runNumber = 2 | .payload.workflow.runUrl = "https://github.com/athmetry/athmetry-frontend/actions/runs/1000"')
    echo "$STALE_EVENT" > "${TEMP_DIR}/stale_event.json"

    MERGED=$(merge_frontend_event "$EXISTING_REPO" "$STALE_EVENT")
    if echo "$MERGED" | jq -e '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun.runId == 42737661398' >/dev/null; then
        echo "✓ PASS: Stale event (older run ID) rejected - existing data preserved"
    else
        echo "✗ FAIL: Stale event should be rejected"
        echo "$MERGED" | jq '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun'
        exit 1
    fi

    # Test 18: Same run ID, older attempt rejected
    echo ""
    echo "Test 18: Same run ID, older attempt rejected"
    OLDER_ATTEMPT_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.meta.sourceRunId = "42737661398" | .meta.sourceRunAttempt = "1" | .payload.workflow.runId = 42737661398 | .payload.workflow.runNumber = 4 | .payload.workflow.runUrl = "https://github.com/athmetry/athmetry-frontend/actions/runs/42737661398" | .payload.workflow.conclusion = "failure" | .payload.workflow.status = "completed"')
    echo "$OLDER_ATTEMPT_EVENT" > "${TEMP_DIR}/older_attempt.json"

    MERGED=$(merge_frontend_event "$EXISTING_REPO" "$OLDER_ATTEMPT_EVENT")
    if echo "$MERGED" | jq -e '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun.runId == 42737661398 and .latestRun.runAttempt == 1' >/dev/null; then
        echo "✓ PASS: Same run ID, older attempt rejected - existing data preserved"
    else
        echo "✗ FAIL: Same run ID, older attempt should be rejected"
        echo "$MERGED" | jq '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun'
        exit 1
    fi

    # Test 19: Same run ID, same attempt rejected (duplicate)
    echo ""
    echo "Test 19: Same run ID, same attempt rejected (duplicate)"
    SAME_ATTEMPT_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.meta.sourceRunId = "42737661398" | .meta.sourceRunAttempt = "1" | .payload.workflow.runId = 42737661398 | .payload.workflow.runNumber = 4 | .payload.workflow.runUrl = "https://github.com/athmetry/athmetry-frontend/actions/runs/42737661398" | .payload.workflow.conclusion = "failure" | .payload.workflow.status = "completed"')
    echo "$SAME_ATTEMPT_EVENT" > "${TEMP_DIR}/same_attempt.json"

    MERGED=$(merge_frontend_event "$EXISTING_REPO" "$SAME_ATTEMPT_EVENT")
    if echo "$MERGED" | jq -e '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun.runId == 42737661398 and .latestRun.runAttempt == 1' >/dev/null; then
        echo "✓ PASS: Same run ID, same attempt rejected - existing data preserved"
    else
        echo "✗ FAIL: Same run ID, same attempt should be rejected"
        echo "$MERGED" | jq '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun'
        exit 1
    fi

    # Test 20: Same run ID, newer attempt accepted
    echo ""
    echo "Test 20: Same run ID, newer attempt accepted"
    NEWER_ATTEMPT_EVENT=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.meta.sourceRunId = "42737661398" | .meta.sourceRunAttempt = "2" | .payload.workflow.runId = 42737661398 | .payload.workflow.runNumber = 4 | .payload.workflow.runUrl = "https://github.com/athmetry/athmetry-frontend/actions/runs/42737661398" | .payload.workflow.conclusion = "success" | .payload.workflow.status = "completed"')
    echo "$NEWER_ATTEMPT_EVENT" > "${TEMP_DIR}/newer_attempt.json"

    MERGED=$(merge_frontend_event "$EXISTING_REPO" "$NEWER_ATTEMPT_EVENT")
    if echo "$MERGED" | jq -e '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun.runAttempt == 2' >/dev/null; then
        echo "✓ PASS: Same run ID, newer attempt accepted"
    else
        echo "✗ FAIL: Same run ID, newer attempt should be accepted"
        echo "$MERGED" | jq '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun'
        exit 1
    fi

    # Test 21: Newer run ID accepted and merged (second case)
    echo ""
    echo "Test 21: Newer run ID accepted and merged"
    NEWER_EVENT2=$(cat "/Users/tausif/Documents/Projects/athmetry/athmetry-system-status/tests/fixtures/frontend.json" | jq '.meta.sourceRunId = "60000000000" | .payload.workflow.runId = 60000000000 | .payload.workflow.runNumber = 7 | .payload.workflow.runUrl = "https://github.com/athmetry/athmetry-frontend/actions/runs/60000000000"')
    echo "$NEWER_EVENT2" > "${TEMP_DIR}/newer_event2.json"

    MERGED=$(merge_frontend_event "$EXISTING_REPO" "$NEWER_EVENT2")
    if echo "$MERGED" | jq -e '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun.runId == 60000000000' >/dev/null; then
        echo "✓ PASS: Newer run ID accepted and merged"
    else
        echo "✗ FAIL: Newer run ID should be accepted"
        echo "$MERGED" | jq '.workflows[] | select(.name == "Athmetry Frontend CI") | .latestRun'
        exit 1
    fi

    # Test 22: History preservation - verify existing history is preserved
    echo ""
    echo "Test 22: History preservation - existing history preserved"
    if echo "$MERGED" | jq -e '.workflows[] | select(.name == "Athmetry Frontend CI") | .history | length >= 2' >/dev/null; then
        echo "✓ PASS: History preserved with existing entries"
    else
        echo "✗ FAIL: History should be preserved with existing entries"
        echo "$MERGED" | jq '.workflows[] | select(.name == "Athmetry Frontend CI") | .history'
        exit 1
    fi

    # Test 23: History deduplication - duplicate runNumber not added twice
    echo ""
    echo "Test 23: History deduplication - duplicate runNumber not added twice"
    RUN4_COUNT=$(echo "$MERGED" | jq '.workflows[] | select(.name == "Athmetry Frontend CI") | .history | map(select(.runNumber == 4)) | length')
    if [[ "$RUN4_COUNT" -eq 1 ]]; then
        echo "✓ PASS: History deduplication works (runNumber 4 appears once)"
    else
        echo "✗ FAIL: History deduplication failed"
        echo "$MERGED" | jq '.workflows[] | select(.name == "Athmetry Frontend CI") | .history'
        exit 1
    fi

    # Test 24: History order - newest first
    echo ""
    echo "Test 24: History order (newest first)"
    FIRST_RUN=$(echo "$MERGED" | jq -r '.workflows[] | select(.name == "Athmetry Frontend CI") | .history[0].runNumber')
    if [[ "$FIRST_RUN" -gt 4 ]]; then
        echo "✓ PASS: History ordered newest first (new run first)"
    else
        echo "✗ FAIL: History should be ordered newest first"
        echo "$MERGED" | jq '.workflows[] | select(.name == "Athmetry Frontend CI") | .history'
        exit 1
    fi

    # Test 25: Other workflows preserved (Dependency Audit)
    echo ""
    echo "Test 25: Other workflows preserved (Dependency Audit)"
    DEP_AUDIT=$(echo "$MERGED" | jq -e '.workflows[] | select(.name == "Dependency Audit")')
    if [[ -n "$DEP_AUDIT" ]]; then
        echo "✓ PASS: Dependency Audit workflow preserved"
    else
        echo "✗ FAIL: Dependency Audit workflow should be preserved"
        echo "$MERGED" | jq '.workflows'
        exit 1
    fi

    # Test 26: Only frontend workflows present (no cross-repo contamination)
    echo ""
    echo "Test 26: Only frontend workflows present"
    FRONTEND_WORKFLOWS=$(echo "$MERGED" | jq '.workflows | map(select(.name == "Athmetry Frontend CI" or .name == "Dependency Audit")) | length')
    if [[ "$FRONTEND_WORKFLOWS" -eq 2 ]]; then
        echo "✓ PASS: Only frontend workflows present"
    else
        echo "✗ FAIL: Should only have frontend workflows"
        echo "$MERGED" | jq '.workflows'
        exit 1
    fi

    # Test 27: Invalid JSON (missing fields) rejected by read_frontend_event
    echo ""
    echo "Test 27: Invalid JSON (missing fields) rejected"
    INVALID_EVENT='{"payload": {"repository": "athmetry/athmetry-frontend"}}'
    echo "$INVALID_EVENT" > "${TEMP_DIR}/invalid_event.json"
    export FRONTEND_EVENT_FILE="${TEMP_DIR}/invalid_event.json"
    if read_frontend_event >/dev/null 2>&1; then
        echo "✗ FAIL: Invalid JSON should be rejected"
        exit 1
    else
        echo "✓ PASS: Invalid JSON rejected"
    fi

    # Test 28: Empty file rejected
    echo ""
    echo "Test 28: Empty file rejected"
    > "${TEMP_DIR}/empty_event.json"
    export FRONTEND_EVENT_FILE="${TEMP_DIR}/empty_event.json"
    if read_frontend_event >/dev/null 2>&1; then
        echo "✗ FAIL: Empty file should be rejected"
        exit 1
    else
        echo "✓ PASS: Empty file rejected"
    fi

    # Test 29: Missing file handled gracefully
    echo ""
    echo "Test 29: Missing file handled gracefully"
    export FRONTEND_EVENT_FILE="${TEMP_DIR}/nonexistent_file.json"
    if read_frontend_event >/dev/null 2>&1; then
        echo "✗ FAIL: Missing file should be rejected"
        exit 1
    else
        echo "✓ PASS: Missing file rejected gracefully"
    fi

    # Test 30: Malformed JSON rejected
    echo ""
    echo "Test 30: Malformed JSON rejected"
    echo "not valid json" > "${TEMP_DIR}/malformed.json"
    export FRONTEND_EVENT_FILE="${TEMP_DIR}/malformed.json"
    if read_frontend_event >/dev/null 2>&1; then
        echo "✗ FAIL: Malformed JSON should be rejected"
        exit 1
    else
        echo "✓ PASS: Malformed JSON rejected"
    fi

    echo ""
    echo "=== All Tests Passed ==="
}

main