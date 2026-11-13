/**
 * dashboard.js — Athmetry System Status dashboard rendering
 *
 * Renders the status data into the DOM. Handles:
 * - Overall system status
 * - Per-repository pipeline lists
 * - Pipeline detail dialogs
 * - Status indicators and pills
 * - Time formatting and relative time
 *
 * Expected data shape (schemaVersion 2):
 * {
 *   schemaVersion: 2,
 *   collectedAt: "2026-11-11T20:58:39Z",
 *   monitoredBranch: "main",
 *   repositories: [
 *     {
 *       name: "athmetry-backend",
 *       owner: "athmetry",
 *       repo: "athmetry-backend",
 *       error: null | string,
 *       overallStatus: "success" | "failure" | "running" | "unknown",
 *       workflows: [
 *         {
 *           id: 12345678,
 *           name: "CI",
 *           path: ".github/workflows/ci.yml",
 *           state: "active",
 *           html_url: "https://github.com/.../actions/workflows/ci.yml",
 *           effectiveStatus: "success" | "failure" | "running" | "queued" | "unknown",
 *           latestStatus: "completed" | "in_progress" | "queued" | "unknown",
 *           latestConclusion: "success" | "failure" | "cancelled" | "unknown",
 *           latestRun: { ... } | null,
 *           history: [ { runNumber, status, conclusion, commitSha, startedAt, completedAt, runUrl }, ... ]
 *         },
 *         ...
 *       ]
 *     },
 *     ...
 *   ],
 *   notes: "..."
 * }
 */

// ============================================================================
// Constants and configuration
// ============================================================================

const REPO_KEYS = {
  'athmetry-backend': 'backend',
  'athmetry-frontend': 'frontend',
  'athmetry-system-status': 'system-status'
};

const STATUS_COLORS = {
  success: 'success',
  failure: 'failure',
  running: 'running',
  queued: 'queued',
  cancelled: 'cancelled',
  skipped: 'skipped',
  unknown: 'unknown'
};

const STATUS_LABELS = {
  success: 'Success',
  failure: 'Failure',
  running: 'Running',
  queued: 'Queued',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
  unknown: 'Unknown'
};

const REPO_DISPLAY_NAMES = {
  'athmetry-backend': 'Athmetry Backend',
  'athmetry-frontend': 'Athmetry Frontend',
  'athmetry-system-status': 'Athmetry System Status Page'
};

// ============================================================================
// Utility functions
// ============================================================================

/** Format an ISO timestamp as a human-readable date/time. */
function formatDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch {
    return '—';
  }
}

/** Format an ISO timestamp as a short relative time (e.g., "2m ago", "3h ago"). */
function formatRelativeTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return formatDateTime(isoString);
  } catch {
    return '—';
  }
}

/** Calculate duration between two ISO timestamps. */
function calculateDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return null;
  try {
    const start = new Date(startedAt);
    const end = new Date(completedAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffMs = end - start;
    if (diffMs < 0) return null;

    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  } catch {
    return null;
  }
}

/** Escape HTML to prevent XSS. */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

/** Lock body scroll when modal is open. */
function lockBodyScroll() {
  document.body.classList.add('modal-open');
}

/** Unlock body scroll when modal is closed. */
function unlockBodyScroll() {
  document.body.classList.remove('modal-open');
}

/** Get CSS class for a status. */
function getStatusClass(status) {
  return STATUS_COLORS[status] || 'unknown';
}

/** Get display label for a status. */
function getStatusLabel(status) {
  return STATUS_LABELS[status] || 'Unknown';
}

/** Create a status pill element. */
function createStatusPill(status, label = null, className = '') {
  const statusClass = getStatusClass(status);
  const displayLabel = label || getStatusLabel(status);
  const pill = document.createElement('div');
  pill.className = `status-pill status-${statusClass} ${className}`.trim();
  pill.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="status-text">${escapeHtml(displayLabel)}</span>`;
  return pill;
}

/** Create a pipeline row element. */
function createPipelineRow(workflow, repoName) {
  const row = document.createElement('div');
  row.className = 'pipeline-row';
  row.dataset.workflowId = workflow.id;
  row.dataset.repoName = repoName;

  const effectiveStatus = workflow.effectiveStatus || 'unknown';
  const statusClass = getStatusClass(effectiveStatus);

  // Latest run info
  const latestRun = workflow.latestRun;
  const runNumber = latestRun?.runNumber ? `#${latestRun.runNumber}` : '—';
  const runTime = latestRun?.startedAt ? formatRelativeTime(latestRun.startedAt) : '—';
  const duration = latestRun ? calculateDuration(latestRun.startedAt, latestRun.completedAt) : null;

  row.innerHTML = `
    <div class="pipeline-status">
      <span class="status-dot status-${statusClass}" aria-hidden="true"></span>
    </div>
    <div class="pipeline-info">
      <span class="pipeline-name">${escapeHtml(workflow.name)}</span>
      <span class="pipeline-meta">${escapeHtml(workflow.path)}</span>
    </div>
    <div class="pipeline-run">
      <span class="pipeline-run-number">${escapeHtml(runNumber)}</span>
      <span class="pipeline-run-time">${escapeHtml(runTime)}</span>
    </div>
    <div class="pipeline-duration">${duration ? escapeHtml(duration) : '—'}</div>
    <button class="icon-btn pipeline-view-btn" aria-label="View ${escapeHtml(workflow.name)} details" data-workflow-id="${workflow.id}" data-repo="${repoName}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    </button>
  `;

  // Add click handler for pipeline detail
  const viewBtn = row.querySelector('.pipeline-view-btn');
  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showPipelineDetail(workflow, repoName);
  });

  // Also make the whole row clickable
  row.addEventListener('click', () => {
    showPipelineDetail(workflow, repoName);
  });

  return row;
}

/** Create pipeline detail dialog content (body only, no footer). */
function createPipelineDetailContent(workflow, repoName) {
  const latestRun = workflow.latestRun;
  const history = workflow.history || [];

  const commitSha = latestRun?.commitSha || '';
  const commitMessage = latestRun?.commitMessage || '';
  const commitAuthor = latestRun?.commitAuthor || '';
  const startedAt = latestRun?.startedAt ? formatDateTime(latestRun.startedAt) : '—';
  const completedAt = latestRun?.completedAt ? formatDateTime(latestRun.completedAt) : '—';
  const duration = latestRun ? calculateDuration(latestRun.startedAt, latestRun.completedAt) : null;

  // Jobs from latest run
  const jobs = latestRun?.jobs || [];

  let html = `
    <div class="detail-header">
      <div class="detail-status">
        ${createStatusPill(workflow.effectiveStatus || 'unknown', getStatusLabel(workflow.effectiveStatus || 'unknown'), 'detail-status-pill').outerHTML}
      </div>
      <div class="detail-title">
        <h3>${escapeHtml(workflow.name)}</h3>
        <span class="detail-path">${escapeHtml(workflow.path)}</span>
      </div>
    </div>

    <div class="detail-section">
      <h4>Latest Run</h4>
      <dl class="detail-grid">
        <dt>Run Number</dt><dd>${latestRun?.runNumber ? `#${latestRun.runNumber}` : '—'}</dd>
        <dt>Status</dt><dd>${getStatusLabel(latestRun?.status || 'unknown')}</dd>
        <dt>Conclusion</dt><dd>${getStatusLabel(latestRun?.conclusion || 'unknown')}</dd>
        <dt>Started</dt><dd>${startedAt}</dd>
        <dt>Completed</dt><dd>${completedAt}</dd>
        <dt>Duration</dt><dd>${duration || '—'}</dd>
        <dt>Commit</dt><dd><code>${escapeHtml(commitSha.substring(0, 8))}</code> ${escapeHtml(commitMessage)}</dd>
        <dt>Author</dt><dd>${escapeHtml(commitAuthor)}</dd>
      </dl>
    </div>
  `;

  if (jobs.length > 0) {
    html += `
      <div class="detail-section">
        <h4>Jobs</h4>
        <div class="table-wrapper">
          <table class="jobs-table">
            <thead>
              <tr><th>Job</th><th>Status</th><th>Conclusion</th><th>Started</th><th>Completed</th></tr>
            </thead>
            <tbody>
    `;
    jobs.forEach(job => {
      const jobStatusClass = getStatusClass(job.status);
      const jobConclusionClass = getStatusClass(job.conclusion || 'unknown');
      html += `
        <tr>
          <td>${escapeHtml(job.name)}</td>
          <td><span class="status-badge status-${jobStatusClass}">${getStatusLabel(job.status)}</span></td>
          <td><span class="status-badge status-${jobConclusionClass}">${getStatusLabel(job.conclusion || 'unknown')}</span></td>
          <td>${job.started_at ? formatDateTime(job.started_at) : '—'}</td>
          <td>${job.completed_at ? formatDateTime(job.completed_at) : '—'}</td>
        </tr>
      `;
    });
    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (history.length > 1) {
    html += `
      <div class="detail-section">
        <h4>Run History</h4>
        <div class="table-wrapper">
          <table class="history-table">
            <thead>
              <tr><th>#</th><th>Status</th><th>Conclusion</th><th>Commit</th><th>Started</th><th>Completed</th></tr>
            </thead>
            <tbody>
    `;
    history.forEach(run => {
      const statusClass = getStatusClass(run.status);
      const conclusionClass = getStatusClass(run.conclusion || 'unknown');
      html += `
        <tr>
          <td>#${run.runNumber}</td>
          <td><span class="status-badge status-${statusClass}">${getStatusLabel(run.status)}</span></td>
          <td><span class="status-badge status-${conclusionClass}">${getStatusLabel(run.conclusion || 'unknown')}</span></td>
          <td><code>${run.commitSha ? escapeHtml(run.commitSha.substring(0, 8)) : '—'}</code></td>
          <td>${run.startedAt ? formatDateTime(run.startedAt) : '—'}</td>
          <td>${run.completedAt ? formatDateTime(run.completedAt) : '—'}</td>
        </tr>
      `;
    });
    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  return html;
}

/** Create pipeline detail dialog footer actions. */
function createPipelineDetailFooter(workflow) {
  const latestRun = workflow.latestRun;
  let html = `
    <button class="btn btn-secondary dialog-close" id="detail-close-btn">Close</button>
  `;
  if (latestRun?.runUrl) {
    html += `
      <button class="btn btn-primary" id="detail-github-btn" data-github-url="${escapeHtml(latestRun.runUrl)}">
        View on GitHub
      </button>
    `;
  }
  return html;
}

// ============================================================================
// Main rendering functions
// ============================================================================

/** Render the entire dashboard from status data. */
export async function renderDashboard(data) {
  // If data not provided, fetch it
  if (!data) {
    const { statusApi } = await import('./api.js');
    data = await statusApi.fetchStatus();
  }
  
  if (!data || !data.repositories) {
    renderErrorState('Invalid data format');
    return;
  }

  // Update overall status
  renderOverallStatus(data);

  // Render each repository's pipelines
  data.repositories.forEach(repo => {
    const repoKey = REPO_KEYS[repo.name];
    if (repoKey) {
      renderRepositoryPipelines(repo, repoKey, data.monitoredBranch);
    }
  });

  // Update monitored branch display
  const branchEl = document.getElementById('monitored-branch');
  if (branchEl) branchEl.textContent = data.monitoredBranch || 'main';

  // Update last collected time (collector's timestamp)
  const collectedEl = document.getElementById('last-collected-at');
  if (collectedEl && data.collectedAt) {
    collectedEl.textContent = `Last collected: ${formatRelativeTime(data.collectedAt)} (${formatDateTime(data.collectedAt)})`;
  }

  // NOTE: Header last-updated timestamp is now managed by app.js to show browser refresh time
  // It gets updated when user clicks Refresh button, showing "just now" / "a few seconds ago"

  // Check for errors and show alerts
  checkAndShowAlerts(data);

  // Show live refresh indicator if present
  if (data.liveRefreshMeta) {
    renderLiveRefreshIndicator(data.liveRefreshMeta);
  }
}

/** Render live refresh indicator showing which repos have live data. */
function renderLiveRefreshIndicator(meta) {
  const existing = document.getElementById('live-refresh-indicator');
  if (existing) existing.remove();

  const indicator = document.createElement('div');
  indicator.id = 'live-refresh-indicator';
  indicator.className = 'live-refresh-indicator';
  
  const updated = meta.updatedRepos.length > 0
    ? `Live: ${meta.updatedRepos.map(r => r.replace('athmetry-', '')).join(', ')}`
    : 'Live: none';
  const failed = meta.failedRepos.length > 0
    ? `Cached: ${meta.failedRepos.map(r => r.replace('athmetry-', '')).join(', ')}`
    : 'Cached: none';
  
  indicator.innerHTML = `
    <span class="live-refresh-label">Manual Refresh</span>
    <span class="live-refresh-updated" title="Repositories with live data from GitHub API">${updated}</span>
    <span class="live-refresh-failed" title="Repositories using cached collector data (private or inaccessible)">${failed}</span>
    <span class="live-refresh-time">${formatRelativeTime(meta.timestamp)}</span>
  `;
  
  // Insert after the overall status card
  const overallCard = document.querySelector('.overall-card');
  if (overallCard && overallCard.parentNode) {
    overallCard.parentNode.insertBefore(indicator, overallCard.nextSibling);
  }
}

/** Render overall system status. */
function renderOverallStatus(data) {
  const pill = document.getElementById('overall-status-pill');
  const text = document.getElementById('overall-status-text');
  const detail = document.getElementById('overall-detail');
  const lastBuildEl = document.getElementById('last-successful-build');

  // Determine overall status from all repositories
  let overallStatus = 'unknown';
  let hasFailure = false;
  let hasRunning = false;
  let hasData = false;
  let latestSuccessTime = null;

  data.repositories.forEach(repo => {
    if (repo.error) {
      hasFailure = true;
      hasData = true;
      return;
    }
    if (repo.overallStatus === 'failure') {
      hasFailure = true;
      hasData = true;
    } else if (repo.overallStatus === 'running') {
      hasRunning = true;
      hasData = true;
    } else if (repo.overallStatus === 'success') {
      hasData = true;
    }

    // Find latest successful build time
    repo.workflows?.forEach(wf => {
      if (wf.latestRun && wf.latestConclusion === 'success' && wf.latestRun.completedAt) {
        const time = new Date(wf.latestRun.completedAt).getTime();
        if (!latestSuccessTime || time > latestSuccessTime) {
          latestSuccessTime = time;
        }
      }
    });
  });

  if (hasFailure) overallStatus = 'failure';
  else if (hasRunning) overallStatus = 'running';
  else if (hasData) overallStatus = 'success';

  // Update overall status pill
  if (pill) {
    pill.className = `status-pill status-${getStatusClass(overallStatus)}`;
    if (text) text.textContent = getStatusLabel(overallStatus);
  }

  // Update detail text
  if (detail) {
    if (!hasData) {
      detail.textContent = 'No pipeline data available.';
    } else if (overallStatus === 'failure') {
      detail.textContent = 'One or more pipelines are failing. Check individual pipelines for details.';
    } else if (overallStatus === 'running') {
      detail.textContent = 'One or more pipelines are currently running.';
    } else {
      detail.textContent = 'All pipelines are healthy.';
    }
  }

  // Update last successful build
  if (lastBuildEl) {
    if (latestSuccessTime) {
      lastBuildEl.innerHTML = `<strong>Last successful build:</strong> ${formatRelativeTime(new Date(latestSuccessTime).toISOString())}`;
    } else {
      lastBuildEl.textContent = '—';
    }
  }
}

/** Render pipelines for a single repository. */
function renderRepositoryPipelines(repo, repoKey, monitoredBranch) {
  const listEl = document.getElementById(`${repoKey}-pipelines-list`);
  const countEl = document.getElementById(`${repoKey}-pipelines-count`);
  const overallPill = document.getElementById(`${repoKey}-overall-pill`);
  const overallText = overallPill?.querySelector('.status-text');
  const repoMetaEl = document.getElementById(`${repoKey}-repo-meta`);

  if (!listEl) return;

  // Update repo overall status
  if (overallPill && overallText) {
    overallPill.className = `status-pill status-${getStatusClass(repo.overallStatus)} repo-overall-pill`;
    overallText.textContent = getStatusLabel(repo.overallStatus);
  }

  // Update pipeline count
  const workflows = repo.workflows || [];
  if (countEl) countEl.textContent = workflows.length;

  // Update repo meta (pipeline count + branch)
  if (repoMetaEl) {
    const pipelineCount = workflows.length;
    const branch = monitoredBranch || 'main';
    const pipelineText = pipelineCount === 1 ? '1 pipeline' : `${pipelineCount} pipelines`;
    repoMetaEl.textContent = `${pipelineText} · ${branch} branch`;
  }

  // Render pipelines
  listEl.innerHTML = '';

  if (workflows.length === 0) {
    listEl.innerHTML = '<div class="pipeline-empty">No active pipelines found</div>';
    return;
  }

  workflows.forEach(workflow => {
    const row = createPipelineRow(workflow, repo.name);
    listEl.appendChild(row);
  });
}

/** Show pipeline detail dialog. */
function showPipelineDetail(workflow, repoName) {
  const dialog = document.getElementById('pipeline-detail-dialog');
  const title = document.getElementById('pipeline-detail-title');
  const body = document.getElementById('pipeline-detail-body');
  const footer = document.getElementById('pipeline-detail-footer');

  if (!dialog || !title || !body || !footer) return;

  title.textContent = `${REPO_DISPLAY_NAMES[repoName] || repoName} — ${workflow.name}`;
  body.innerHTML = createPipelineDetailContent(workflow, repoName);
  footer.innerHTML = createPipelineDetailFooter(workflow);

  // Add close handler for header close button
  const headerCloseBtn = dialog.querySelector('.dialog-close');
  if (headerCloseBtn) {
    headerCloseBtn.addEventListener('click', () => dialog.close());
  }

  // Add close handler for footer close button
  const closeBtn = footer.querySelector('#detail-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => dialog.close());
  }

  // Handle GitHub button click - show confirmation dialog
  const githubBtn = footer.querySelector('#detail-github-btn');
  if (githubBtn) {
    githubBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const githubUrl = githubBtn.getAttribute('data-github-url');
      if (githubUrl) {
        showGitHubConfirmation(githubUrl);
      }
    });
  }

  // Close on backdrop click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  // Close on Escape key
  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      dialog.close();
      dialog.removeEventListener('keydown', handleKeydown);
    }
  };
  dialog.addEventListener('keydown', handleKeydown);

  // Lock body scroll when modal opens
  lockBodyScroll();

  // Unlock body scroll when modal closes
  dialog.addEventListener('close', () => {
    unlockBodyScroll();
  }, { once: true });

  dialog.showModal();
}

/** Show GitHub confirmation dialog. */
function showGitHubConfirmation(githubUrl) {
  const dialog = document.getElementById('github-actions-dialog');
  const continueBtn = dialog?.querySelector('.dialog-continue');
  const cancelBtn = dialog?.querySelector('.dialog-cancel');

  if (!dialog || !continueBtn || !cancelBtn) return;

  // Set the GitHub URL
  continueBtn.href = githubUrl;

  // Close handlers
  const closeDialog = () => {
    dialog.close();
    cleanup();
  };

  const handleCancel = () => closeDialog();
  const handleContinue = () => {
    // Allow the link to navigate naturally
    closeDialog();
  };

  const handleBackdropClick = (e) => {
    if (e.target === dialog) closeDialog();
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape') closeDialog();
  };

  const cleanup = () => {
    cancelBtn.removeEventListener('click', handleCancel);
    continueBtn.removeEventListener('click', handleContinue);
    dialog.removeEventListener('click', handleBackdropClick);
    dialog.removeEventListener('keydown', handleKeydown);
  };

  cancelBtn.addEventListener('click', handleCancel);
  continueBtn.addEventListener('click', handleContinue);
  dialog.addEventListener('click', handleBackdropClick);
  dialog.addEventListener('keydown', handleKeydown);

  // Lock body scroll when modal opens
  lockBodyScroll();

  // Unlock body scroll when modal closes
  dialog.addEventListener('close', () => {
    unlockBodyScroll();
  }, { once: true });

  dialog.showModal();
}

/** Check for errors and show alerts. */
function checkAndShowAlerts(data) {
  const alertCard = document.getElementById('alert-card');
  const alertBody = document.getElementById('alert-body');

  if (!alertCard || !alertBody) return;

  const errors = [];

  data.repositories.forEach(repo => {
    if (repo.error) {
      errors.push({
        type: 'collector',
        repo: REPO_DISPLAY_NAMES[repo.name] || repo.name,
        message: repo.error
      });
    }
  });

  // Check if data is stale (older than 10 minutes)
  if (data.collectedAt) {
    const collectedTime = new Date(data.collectedAt).getTime();
    const now = Date.now();
    const diffMin = Math.floor((now - collectedTime) / 60000);
    if (diffMin > 10) {
      errors.push({
        type: 'stale',
        repo: 'System',
        message: `Data is ${diffMin} minutes old. Collector may not be running.`
      });
    }
  }

  if (errors.length === 0) {
    alertCard.style.display = 'none';
    return;
  }

  alertCard.style.display = 'block';
  alertBody.innerHTML = errors.map(err => `
    <div class="alert-item alert-${err.type}">
      <div class="alert-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          ${err.type === 'collector' 
            ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
            : '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'}
        </svg>
      </div>
      <div class="alert-content">
        <strong>${escapeHtml(err.repo)}:</strong> ${escapeHtml(err.message)}
      </div>
    </div>
  `).join('');
}

/** Render error state when data is invalid. */
export function renderErrorState(message) {
  const overallPill = document.getElementById('overall-status-pill');
  const overallText = document.getElementById('overall-status-text');
  const overallDetail = document.getElementById('overall-detail');

  if (overallPill) overallPill.className = 'status-pill status-unknown';
  if (overallText) overallText.textContent = 'Error';
  if (overallDetail) overallDetail.textContent = message;

  // Clear repository cards
  ['backend', 'system-status', 'frontend'].forEach(key => {
    const listEl = document.getElementById(`${key}-pipelines-list`);
    if (listEl) listEl.innerHTML = '<div class="pipeline-empty">Error loading data</div>';
    const countEl = document.getElementById(`${key}-pipelines-count`);
    if (countEl) countEl.textContent = '0';
  });
}