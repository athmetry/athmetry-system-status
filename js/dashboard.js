/**
 * dashboard.js
 * Rendering logic for the Athmetry System Status dashboard.
 * Reads normalized data from data/status.json and updates the DOM.
 */

import { statusApi } from "./api.js";

const STATUS_CLASS_MAP = {
  success: "status-success",
  failure: "status-failure",
  in_progress: "status-running",
  queued: "status-queued",
  cancelled: "status-cancelled",
  skipped: "status-skipped",
  unknown: "status-unknown",
};

const JOB_STATUS_CLASS_MAP = {
  success: "success",
  failure: "failure",
  in_progress: "running",
  queued: "queued",
  cancelled: "cancelled",
  skipped: "skipped",
  unknown: "unknown",
};

const EL = {
  lastUpdated: document.getElementById("last-updated"),
  overallPill: document.getElementById("overall-status-pill"),
  overallText: document.getElementById("overall-status-text"),
  overallDetail: document.getElementById("overall-detail"),
  monitoredBranch: document.getElementById("monitored-branch"),
  lastSuccessfulBuild: document.getElementById("last-successful-build"),
  alertCard: document.getElementById("alert-card"),
  alertBody: document.getElementById("alert-body"),
  repoCards: {},
  historyBody: document.getElementById("history-body"),
  tabs: document.querySelectorAll(".history-tabs .tab"),
};

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
 * Determine the overall system status from repository data.
 * Priority: failure > in_progress/queued > completed-success > success > unknown.
 */
function computeOverallStatus(repos) {
  if (!repos || repos.length === 0) return "unknown";

  let hasFailure = false;
  let hasRunning = false;
  let allSuccess = true;
  let anyData = false;

  for (const repo of repos) {
    if (repo.error) {
      anyData = true;
      allSuccess = false;
      continue;
    }
    const run = repo.latestRun;
    const status = run && run.status ? run.status : "unknown";
    const conclusion = run && run.conclusion ? run.conclusion : null;

    if (status === "failure") {
      hasFailure = true;
      allSuccess = false;
      anyData = true;
    } else if (status === "in_progress") {
      hasRunning = true;
      allSuccess = false;
      anyData = true;
    } else if (status === "queued") {
      hasRunning = true;
      allSuccess = false;
      anyData = true;
    } else if (status === "completed") {
      // Completed runs: promotion depends on conclusion
      if (conclusion === "success") {
        anyData = true;
        // Stay success unless another repo drags it down
      } else if (conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out") {
        hasFailure = true;
        allSuccess = false;
        anyData = true;
      } else {
        // completed with unknown conclusion
        allSuccess = false;
        anyData = true;
      }
    } else if (status === "success") {
      anyData = true;
    } else {
      allSuccess = false;
      anyData = true;
    }
  }

  if (!anyData) return "unknown";
  if (hasFailure) return "failure";
  if (hasRunning) return "running";
  // "completed" with all-success conclusions, or pure "success" statuses
  if (allSuccess) return "success";
  return "unknown";
}

/**
 * Find the most recent successful build across repos.
 */
function findLastSuccessfulBuild(repos) {
  let best = null;
  for (const repo of repos) {
    const run = repo.latestRun;
    if (run && run.status === "success" && run.completedAt) {
      if (!best || new Date(run.completedAt) > new Date(best.completedAt)) {
        best = { ...run, repo: repo.name };
      }
    }
  }
  return best;
}

/**
 * Render a single repository card.
 */
function renderRepoCard(repo) {
  const cardId = `card-${repo.name}`;
  let card = document.getElementById(cardId);
  if (!card) {
    // Card exists in markup already; we just update internals.
    card = document.getElementById(cardId);
  }
  if (!card) return;

  const run = repo.latestRun;
  const status = (run && run.status) || "unknown";

  // Status pill for the compact health row
  const healthStatusDot = document.querySelector(`.status-dot.status-${status}-dot`);
  const healthStatusText = document.querySelector(`.status-${status}-text`);
  if (healthStatusDot) healthStatusDot.className = `status-dot ${statusClass(status)}-dot`;
  if (healthStatusText) healthStatusText.textContent = capitalize(status);

  // Commit info
  if (run) {
    const shaEl = document.querySelector(`#commit-${repo.name}-sha`);
    const msgEl = document.querySelector(`#commit-${repo.name}-message`);
    const authorEl = document.querySelector(`#commit-${repo.name}-author`);
    const execEl = document.querySelector(`#exec-${repo.name}`);
    const workflowEl = document.querySelector(`.workflow-name`);
    const runNumEl = document.querySelector(`.run-number`);
    const startEl = document.querySelector(`.started-at`);
    const completeEl = document.querySelector(`.completed-at`);
    const durationEl = document.querySelector(`.duration`);
    const outcomeEl = document.querySelector(`.workflow-outcome`);
    const runLinkEl = document.querySelector(`.run-link-detail`);

    if (shaEl) shaEl.textContent = run.commitSha ? run.commitSha.substring(0, 7) : "—";
    if (msgEl) msgEl.textContent = escapeHtml(run.commitMessage || "—");
    if (authorEl) authorEl.textContent = escapeHtml(run.commitAuthor || "—");
    if (workflowEl) workflowEl.textContent = run.workflowName || "—";
    if (runNumEl) runNumEl.textContent = run.runNumber || "—";
    if (startEl) startEl.textContent = formatTimestamp(run.startedAt);
    if (completeEl) completeEl.textContent = formatTimestamp(run.completedAt);
    if (durationEl) durationEl.textContent = formatDuration(run.startedAt, run.completedAt);
    if (outcomeEl) outcomeEl.textContent = run.conclusion || "—";
    if (runLinkEl) runLinkEl.href = run.runUrl || "#";

    // Show the compact health row indicators
    const healthRow = document.querySelector(`#repo-row-${repo.name}`);
    if (healthRow) {
      healthRow.setAttribute("aria-expanded", "true");
      const statusDot = healthRow.querySelector(".status-dot");
      const statusText = healthRow.querySelector(".status-text");
      if (statusDot) statusDot.className = `status-dot ${statusClass(status)}-dot`;
      if (statusText) statusText.textContent = capitalize(status);
    }
  }

  // Run link
  const runLink = card.querySelector(".btn-link");
  if (runLink && run && run.runUrl) {
    runLink.href = run.runUrl;
    runLink.style.display = "inline-block";
  } else if (runLink) {
    runLink.style.display = "none";
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
      <tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);">No execution history available.</td></tr>
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

/**
 * Render the whole dashboard from status data.
 */
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

  // Last collected at
  if (EL.lastUpdated) {
    const collectedAt = data.collectedAt || data.lastCollectedAt;
    if (collectedAt) {
      // Show in meta row - but we'll use a different approach
      const lastCollectedEl = document.querySelector('.last-collected-at');
      if (lastCollectedEl) {
        lastCollectedEl.textContent = formatTimestamp(collectedAt);
      }
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

/**
 * Initialize repo health rows and expand/collapse details.
 */
function initRepoHealth() {
  const repoRows = document.querySelectorAll('.repo-health-row');

  repoRows.forEach((row) => {
    row.addEventListener('click', () => {
      const isExpanded = row.getAttribute('aria-expanded') === 'true';
      row.setAttribute('aria-expanded', !isExpanded.toString());
      
      const detailsId = row.getAttribute('data-details-id');
      if (detailsId) {
        const detailsEl = document.getElementById(detailsId);
        if (detailsEl) {
          if (isExpanded) {
            detailsEl.style.display = 'none';
          } else {
            detailsEl.style.display = 'block';
          }
        }
      }
    });
  });
}