/**
 * dashboard.js
 * Rendering logic for the Athmetry System Status dashboard.
 * Reads normalized data from data/status.json and updates the DOM.
 */

import { statusApi } from "./api.js";

// ---------------------------------------------------------------------------
// CSS class maps
// ---------------------------------------------------------------------------

const STATUS_CLASS_MAP = {
  success: "status-success",
  failure: "status-failure",
  running: "status-running",
  queued: "status-queued",
  cancelled: "status-cancelled",
  skipped: "status-skipped",
  unknown: "status-unknown",
};

const JOB_STATUS_CLASS_MAP = {
  success: "success",
  failure: "failure",
  running: "running",
  queued: "queued",
  cancelled: "cancelled",
  skipped: "skipped",
  unknown: "unknown",
};

// ---------------------------------------------------------------------------
// DOM element cache
// ---------------------------------------------------------------------------

const EL = {
  lastUpdated: document.getElementById("last-updated"),
  overallPill: document.getElementById("overall-status-pill"),
  overallText: document.getElementById("overall-status-text"),
  overallDetail: document.getElementById("overall-detail"),
  monitoredBranch: document.getElementById("monitored-branch"),
  lastSuccessfulBuild: document.getElementById("last-successful-build"),
  alertCard: document.getElementById("alert-card"),
  alertBody: document.getElementById("alert-body"),
  historyBody: document.getElementById("history-body"),
  tabs: document.querySelectorAll(".history-tabs .tab"),
  lastCollectedAt: document.querySelector(".last-collected-at"),
};

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Escape HTML to prevent XSS when rendering commit messages/authors.
 */
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format a timestamp for display, or return a dash if missing.
 */
function formatTimestamp(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (e) {
    return "—";
  }
}

/**
 * Format a duration string (e.g. "2m 34s") from start/end ISO timestamps.
 */
function formatDuration(startedAt, completedAt) {
  if (!startedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (isNaN(start) || isNaN(end)) return "—";
  const ms = end - start;
  if (ms < 0) return "—";
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / 1000 / 60) % 60);
  const hours = Math.floor((ms / 1000 / 60 / 60) % 24);
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

/**
 * Get the CSS class for a workflow status.
 */
function statusClass(status) {
  return STATUS_CLASS_MAP[status] || "status-unknown";
}

/**
 * Get the CSS class for a job status.
 */
function jobStatusClass(status) {
  return JOB_STATUS_CLASS_MAP[status] || "unknown";
}

/**
 * Capitalize a status string for display.
 */
function capitalize(str) {
  if (!str) return "Unknown";
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, " ");
}

/**
 * Derive the effective display status from GitHub Actions status + conclusion.
 * GitHub Actions workflow runs have:
 *   - status: "completed", "in_progress", "queued", "failure", etc.
 *   - conclusion: "success", "failure", "cancelled", "timed_out", "skipped", "action_required", null
 *
 * For display we want:
 *   - completed + success => "success"
 *   - completed + failure => "failure"
 *   - completed + cancelled => "cancelled"
 *   - completed + timed_out => "failure" (or "timed_out")
 *   - in_progress => "running"
 *   - queued => "queued"
 *   - anything else => "unknown"
 */
function deriveEffectiveStatus(run) {
  if (!run) return "unknown";

  const status = run.status;
  const conclusion = run.conclusion;

  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return "success";
      case "failure":
      case "action_required":
        return "failure";
      case "cancelled":
        return "cancelled";
      case "timed_out":
        return "failure"; // treat timeout as failure for overall health
      case "skipped":
        return "skipped";
      default:
        return "unknown";
    }
  }

  if (status === "in_progress") return "running";
  if (status === "queued") return "queued";
  if (status === "failure") return "failure"; // direct failure status

  return "unknown";
}

/**
 * Determine the overall system status from repository data.
 * Priority: failure > running/queued > success > unknown.
 */
function computeOverallStatus(repos) {
  if (!repos || repos.length === 0) return "unknown";

  let hasFailure = false;
  let hasRunning = false;
  let anyData = false;

  for (const repo of repos) {
    if (repo.error) {
      anyData = true;
      hasFailure = true;
      continue;
    }
    const effective = deriveEffectiveStatus(repo.latestRun);
    if (effective === "failure") {
      hasFailure = true;
      anyData = true;
    } else if (effective === "running" || effective === "queued") {
      hasRunning = true;
      anyData = true;
    } else if (effective === "success") {
      anyData = true;
    } else {
      anyData = true;
    }
  }

  if (!anyData) return "unknown";
  if (hasFailure) return "failure";
  if (hasRunning) return "running";
  return "success";
}

/**
 * Find the most recent successful build across repos.
 * Uses effective status = success.
 */
function findLastSuccessfulBuild(repos) {
  let best = null;
  for (const repo of repos) {
    const effective = deriveEffectiveStatus(repo.latestRun);
    const run = repo.latestRun;
    if (effective === "success" && run && run.completedAt) {
      if (!best || new Date(run.completedAt) > new Date(best.completedAt)) {
        best = { ...run, repo: repo.name };
      }
    }
  }
  return best;
}

/**
 * Render a single repository health card.
 * HTML structure expects:
 *   - #repo-row-{backend|frontend} .repo-status-pill .status-dot + .status-text
 *   - .repo-meta .repo-run, .repo-commit, .repo-started, .repo-duration
 */
function renderRepoCard(repo) {
  const run = repo.latestRun;
  const effectiveStatus = deriveEffectiveStatus(run);

  // Normalize repo name to match HTML IDs: athmetry-backend -> repo-row-backend
  const repoId = repo.name.replace("athmetry-", "");
  const card = document.querySelector(`#repo-row-${repoId}`);
  if (!card) return;

  // Status pill
  const pill = card.querySelector(".repo-status-pill");
  const statusDot = card.querySelector(".repo-status-pill .status-dot");
  const statusText = card.querySelector(".repo-status-pill .status-text");
  if (pill) pill.className = `status-pill ${statusClass(effectiveStatus)} repo-status-pill`;
  if (statusDot) statusDot.className = `dot status-dot ${statusClass(effectiveStatus)}-dot`;
  if (statusText) statusText.textContent = capitalize(effectiveStatus);

  // Repo meta
  if (run) {
    const runEl = card.querySelector(".repo-run");
    const commitEl = card.querySelector(".repo-commit");
    const startedEl = card.querySelector(".repo-started");
    const durationEl = card.querySelector(".repo-duration");

    if (runEl) runEl.textContent = run.runNumber ? `#${run.runNumber}` : "—";
    if (commitEl) commitEl.textContent = run.commitSha ? run.commitSha.substring(0, 7) : "—";
    if (startedEl) startedEl.textContent = formatTimestamp(run.startedAt);
    if (durationEl) durationEl.textContent = formatDuration(run.startedAt, run.completedAt);
  }
}

/**
 * Render the execution history table for a given repo.
 */
function renderHistory(repoName, history) {
  const body = document.getElementById("history-body");
  if (!body) return;

  const items = (history || []).slice(0, 10);
  if (items.length === 0) {
    body.innerHTML = `
      <tr><td colspan="6" style="text-align:center;color:var(--text-secondary);">No execution history available.</td></tr>
    `;
    return;
  }

  body.innerHTML = items
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.runId || item.runNumber || "—")}</td>
        <td>${escapeHtml(item.commitSha ? item.commitSha.substring(0, 7) : "—")}</td>
        <td>
          <span class="badge ${jobStatusClass(item.status)}">
            ${capitalize(item.status || "unknown")}
          </span>
        </td>
        <td>${formatTimestamp(item.startedAt || item.createdAt)}</td>
        <td>${formatDuration(item.startedAt, item.completedAt)}</td>
        <td>
          <a href="${escapeHtml(item.runUrl || "#")}" class="run-link" target="_blank" rel="noopener">View run</a>
        </td>
      </tr>
    `
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Tab switching (registered once, not on every render)
// ---------------------------------------------------------------------------

function initHistoryTabs(repos) {
  const tabs = document.querySelectorAll(".history-tabs .tab");
  tabs.forEach((tab) => {
    // Remove any existing listener to avoid duplicates
    tab.replaceWith(tab.cloneNode(true));
  });

  // Re-query after clone
  const freshTabs = document.querySelectorAll(".history-tabs .tab");
  freshTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      freshTabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const repo = tab.getAttribute("data-repo");
      const repoData = repos.find((r) => r.name === repo);
      renderHistory(repo, repoData ? repoData.history : []);
    });
  });
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

export async function renderDashboard() {
  let data;
  try {
    data = await statusApi.fetchStatus();
  } catch (err) {
    renderErrorState(err.message);
    return;
  }

  // Header metadata
  if (EL.lastUpdated) {
    EL.lastUpdated.textContent = `Last updated: ${formatTimestamp(data.collectedAt || data.lastCollectedAt)}`;
  }
  if (EL.monitoredBranch && data.monitoredBranch) {
    EL.monitoredBranch.textContent = data.monitoredBranch;
  }

  // Overall status
  const repos = data.repositories || [];
  const overall = computeOverallStatus(repos);
  if (EL.overallPill) {
    EL.overallPill.className = `status-pill ${statusClass(overall)}`;
    const textEl = EL.overallPill.querySelector("span:last-child");
    if (textEl) textEl.textContent = capitalize(overall);
  }
  if (EL.overallDetail) {
    EL.overallDetail.textContent = overallDetailMessage(overall, repos);
  }

  // Last successful build
  const lastSuccess = findLastSuccessfulBuild(repos);
  if (EL.lastSuccessfulBuild) {
    if (lastSuccess) {
      EL.lastSuccessfulBuild.innerHTML = `Last successful build: <strong>${escapeHtml(
        lastSuccess.repo
      )}</strong> at ${formatTimestamp(lastSuccess.completedAt)}`;
    } else {
      EL.lastSuccessfulBuild.textContent = "Last successful build: —";
    }
  }

  // Last collected at (in meta row)
  if (EL.lastCollectedAt) {
    const collectedAt = data.collectedAt || data.lastCollectedAt;
    if (collectedAt) {
      EL.lastCollectedAt.textContent = `Collected: ${formatTimestamp(collectedAt)}`;
    } else {
      EL.lastCollectedAt.textContent = "Collected: —";
    }
  }

  // Render each repo card
  repos.forEach((repo) => {
    renderRepoCard(repo);
  });

  // Render history for the active tab
  const activeTab = document.querySelector(".history-tabs .tab.active");
  const activeRepo = activeTab ? activeTab.getAttribute("data-repo") : "athmetry-backend";
  const activeRepoData = repos.find((r) => r.name === activeRepo);
  renderHistory(activeRepo, activeRepoData ? activeRepoData.history : []);

  // Initialize tab handlers once
  initHistoryTabs(repos);

  // Alerts
  renderAlerts(data);
}

function overallDetailMessage(overall, repos) {
  if (overall === "failure") return "One or more pipelines are failing.";
  if (overall === "running") return "One or more pipelines are running or queued.";
  if (overall === "success") return "All monitored pipelines are healthy.";
  return "No pipeline data available.";
}

function renderErrorState(message) {
  if (EL.overallPill) {
    EL.overallPill.className = "status-pill status-unknown";
    const textEl = EL.overallPill.querySelector("span:last-child");
    if (textEl) textEl.textContent = "Unknown";
  }
  if (EL.overallDetail) {
    EL.overallDetail.textContent = `Unable to load status data: ${message}`;
  }
  if (EL.alertCard) {
    EL.alertCard.style.display = "block";
  }
  if (EL.alertBody) {
    EL.alertBody.innerHTML = `<p style="color:var(--color-failure);">${escapeHtml(message)}</p>`;
  }
}

function renderAlerts(data) {
  if (!EL.alertCard || !EL.alertBody) return;

  const alerts = [];

  // Stale data warning
  const collectedAt = data.collectedAt || data.lastCollectedAt;
  if (collectedAt) {
    const ageMs = Date.now() - new Date(collectedAt).getTime();
    if (ageMs > 10 * 60 * 1000) {
      alerts.push(
        `<p><strong>Stale data:</strong> Status was last collected ${Math.round(
          ageMs / 60000
        )} minutes ago.</p>`
      );
    }
  } else {
    alerts.push("<p><strong>No collection timestamp:</strong> status data may be incomplete.</p>");
  }

  // Repo errors
  const repos = data.repositories || [];
  for (const repo of repos) {
    if (repo.error) {
      alerts.push(`<p><strong>${escapeHtml(repo.name)}:</strong> ${escapeHtml(repo.error)}</p>`);
    }
  }

  if (alerts.length > 0) {
    EL.alertCard.style.display = "block";
    EL.alertBody.innerHTML = alerts.join("");
  } else {
    EL.alertCard.style.display = "none";
  }
}