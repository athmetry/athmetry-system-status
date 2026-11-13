/**
 * api.js
 * Data access layer for the Athmetry System Status dashboard.
 * Reads data/status.json from the same origin (GitHub Pages project URL).
 */

const STATUS_JSON_PATH = "data/status.json";
// Consider data stale if older than this many milliseconds (10 minutes).
const STALE_THRESHOLD_MS = 10 * 60 * 1000;
// Fetch timeout in milliseconds
const FETCH_TIMEOUT_MS = 10000;
// Expected schema version
const EXPECTED_SCHEMA_VERSION = 2;

export class StatusApi {
  constructor() {
    this.lastData = null;
    this.lastFetchAt = null;
    this.error = null;
    this.lastValidData = null; // Preserve last successfully validated data
  }

  /**
   * Validate the data structure against expected schema.
   * @param {any} data - The data to validate
   * @returns {object} - { valid: boolean, error: string|null }
   */
  validateData(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Data is not a valid object' };
    }

    // Check schema version
    if (data.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
      return { valid: false, error: `Expected schema version ${EXPECTED_SCHEMA_VERSION}, got ${data.schemaVersion}` };
    }

    // Check required fields
    if (!data.collectedAt || typeof data.collectedAt !== 'string') {
      return { valid: false, error: 'Missing or invalid collectedAt field' };
    }

    if (!data.monitoredBranch || typeof data.monitoredBranch !== 'string') {
      return { valid: false, error: 'Missing or invalid monitoredBranch field' };
    }

    if (!Array.isArray(data.repositories)) {
      return { valid: false, error: 'Missing or invalid repositories array' };
    }

    // Validate each repository
    for (const repo of data.repositories) {
      if (!repo.name || typeof repo.name !== 'string') {
        return { valid: false, error: 'Repository missing name' };
      }
      if (!repo.owner || typeof repo.owner !== 'string') {
        return { valid: false, error: `Repository ${repo.name} missing owner` };
      }
      if (!repo.repo || typeof repo.repo !== 'string') {
        return { valid: false, error: `Repository ${repo.name} missing repo` };
      }
      if (!['success', 'failure', 'running', 'unknown'].includes(repo.overallStatus)) {
        return { valid: false, error: `Repository ${repo.name} has invalid overallStatus: ${repo.overallStatus}` };
      }
      if (!Array.isArray(repo.workflows)) {
        return { valid: false, error: `Repository ${repo.name} missing workflows array` };
      }
      
      // Validate workflows
      for (const wf of repo.workflows) {
        if (!wf.id || typeof wf.id !== 'number') {
          return { valid: false, error: `Workflow in ${repo.name} missing id` };
        }
        if (!wf.name || typeof wf.name !== 'string') {
          return { valid: false, error: `Workflow in ${repo.name} missing name` };
        }
        if (!['success', 'failure', 'running', 'queued', 'cancelled', 'skipped', 'unknown'].includes(wf.effectiveStatus)) {
          return { valid: false, error: `Workflow ${wf.name} has invalid effectiveStatus: ${wf.effectiveStatus}` };
        }
      }
    }

    return { valid: true, error: null };
  }

  /**
   * Check if data is stale based on collectedAt timestamp.
   * @param {object} data - The data to check
   * @returns {boolean} - true if data is stale
   */
  isDataStale(data) {
    if (!data || !data.collectedAt) return true;
    const collectedTime = new Date(data.collectedAt).getTime();
    if (isNaN(collectedTime)) return true;
    return Date.now() - collectedTime > STALE_THRESHOLD_MS;
  }

  /**
   * Fetch the latest status JSON. Returns the parsed object or throws.
   * Uses cache-busting to avoid stale browser/CDN caches.
   * Validates data structure and preserves last valid data on failure.
   */
  async fetchStatus() {
    const url = `${STATUS_JSON_PATH}?t=${Date.now()}`;
    let response;
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    try {
      response = await fetch(url, { 
        cache: "no-store",
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        this.error = new Error("Request timed out while fetching status data.");
      } else {
        this.error = new Error("Unable to reach the status data endpoint.");
      }
      throw this.error;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      this.error = new Error(`Status data unavailable (HTTP ${response.status}).`);
      throw this.error;
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      this.error = new Error("Status data could not be parsed.");
      throw this.error;
    }

    // Validate data structure
    const validation = this.validateData(data);
    if (!validation.valid) {
      this.error = new Error(`Data validation failed: ${validation.error}`);
      throw this.error;
    }

    // Check if data is stale
    if (this.isDataStale(data)) {
      // Data is stale but we still use it, just warn
      console.warn(`Status data is stale (collected at ${data.collectedAt})`);
    }

    this.lastData = data;
    this.lastFetchAt = Date.now();
    this.lastValidData = data; // Preserve valid data
    this.error = null;
    return data;
  }

  /**
   * Returns true if the cached data is considered stale (based on fetch time).
   */
  isStale() {
    if (!this.lastData || !this.lastFetchAt) {
      return true;
    }
    return Date.now() - this.lastFetchAt > STALE_THRESHOLD_MS;
  }

  /**
   * Returns true if data has been loaded at least once.
   */
  hasData() {
    return !!this.lastData;
  }

  /**
   * Returns the last error encountered.
   */
  getError() {
    return this.error;
  }

  /**
   * Returns the last successfully fetched data (even if stale).
   */
  getLastData() {
    return this.lastData;
  }

  /**
   * Returns the last validated good data (for fallback on fetch failure).
   */
  getLastValidData() {
    return this.lastValidData;
  }

  /**
   * Returns true if the current data is stale based on collectedAt timestamp.
   */
  isCurrentDataStale() {
    return this.isDataStale(this.lastData);
  }

  /**
   * Fetch live status data from GitHub API for public repositories.
   * Falls back to published data/status.json for private/inaccessible repos.
   * @returns {object} - Merged data with live updates where available
   */
  async fetchLiveStatus() {
    // First, get the base data from published status.json (without strict validation)
    // This allows live refresh to work even if base data has old schema version
    const baseData = await this.fetchBaseData();
    
    if (!baseData || !baseData.repositories) {
      throw new Error('Base data is invalid or missing');
    }
    
    // Clone the base data to avoid mutations
    const mergedData = JSON.parse(JSON.stringify(baseData));
    mergedData.liveRefresh = true;
    mergedData.liveRefreshedAt = new Date().toISOString();
    // Live refresh always uses current schema version
    mergedData.schemaVersion = EXPECTED_SCHEMA_VERSION;
    
    // Track which repos have live data
    const liveRepos = new Set();
    const failedRepos = new Set();
    
    // Try to fetch live data for each repository
    for (const repo of mergedData.repositories) {
      try {
        const liveRepoData = await this.fetchLiveRepoData(repo);
        if (liveRepoData) {
          // Merge live data into the repo
          Object.assign(repo, liveRepoData);
          liveRepos.add(repo.name);
        }
      } catch (err) {
        // If live fetch fails, normalize base data to new schema format
        console.debug(`Live fetch failed for ${repo.name}:`, err.message);
        this.normalizeRepoData(repo);
        failedRepos.add(repo.name);
      }
    }
    
    // Add metadata about live refresh
    mergedData.liveRefreshMeta = {
      updatedRepos: Array.from(liveRepos),
      failedRepos: Array.from(failedRepos),
      timestamp: mergedData.liveRefreshedAt
    };
    
    // Update overall status based on merged data
    this.updateOverallStatus(mergedData);
    
    // Validate the merged data
    const validation = this.validateData(mergedData);
    if (!validation.valid) {
      throw new Error(`Merged data validation failed: ${validation.error}`);
    }
    
    this.lastData = mergedData;
    this.lastFetchAt = Date.now();
    this.lastValidData = mergedData;
    this.error = null;
    
    return mergedData;
  }

  /**
   * Fetch base data from published status.json without strict schema validation.
   * Used by fetchLiveStatus() to allow live refresh even with old base data.
   * @returns {object} - Raw parsed JSON data
   */
  async fetchBaseData() {
    const url = `${STATUS_JSON_PATH}?t=${Date.now()}`;
    let response;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    try {
      response = await fetch(url, { 
        cache: "no-store",
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error("Request timed out while fetching status data.");
      } else {
        throw new Error("Unable to reach the status data endpoint.");
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(`Status data unavailable (HTTP ${response.status}).`);
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error("Status data could not be parsed.");
    }

    // Basic structure check without schema version validation
    if (!data || typeof data !== 'object' || !Array.isArray(data.repositories)) {
      throw new Error('Base data has invalid structure');
    }

    return data;
  }

  /**
   * Fetch live data for a single repository from GitHub API.
   * @param {object} repo - Repository config from base data
   * @returns {object|null} - Live repo data or null if not accessible
   */
  async fetchLiveRepoData(repo) {
    const owner = repo.owner;
    const repoName = repo.repo;
    
    // Fetch workflows for this repository
    const workflowsUrl = `https://api.github.com/repos/${owner}/${repoName}/actions/workflows`;
    const workflowsResponse = await this.fetchWithTimeout(workflowsUrl);
    
    if (!workflowsResponse.ok) {
      if (workflowsResponse.status === 404) {
        throw new Error(`Repository not found or private (HTTP 404)`);
      }
      throw new Error(`Failed to fetch workflows (HTTP ${workflowsResponse.status})`);
    }
    
    const workflowsData = await workflowsResponse.json();
    const workflows = workflowsData.workflows || [];
    
    // Filter to active workflows
    const activeWorkflows = workflows.filter(wf => wf.state === 'active');
    
    if (activeWorkflows.length === 0) {
      return {
        workflows: [],
        overallStatus: 'unknown',
        error: null
      };
    }
    
    // Process each workflow
    const processedWorkflows = [];
    let repoOverallStatus = 'unknown';
    let hasFailure = false;
    let hasRunning = false;
    let hasData = false;
    
    for (const workflow of activeWorkflows) {
      try {
        const processedWf = await this.processWorkflow(owner, repoName, workflow);
        if (processedWf) {
          processedWorkflows.push(processedWf);
          
          // Update repo overall status
          if (processedWf.effectiveStatus === 'failure') {
            hasFailure = true;
            hasData = true;
          } else if (processedWf.effectiveStatus === 'running' || processedWf.effectiveStatus === 'queued') {
            hasRunning = true;
            hasData = true;
          } else if (processedWf.effectiveStatus === 'success') {
            hasData = true;
          }
        }
      } catch (err) {
        console.debug(`Failed to process workflow ${workflow.name}:`, err.message);
      }
    }
    
    if (hasFailure) repoOverallStatus = 'failure';
    else if (hasRunning) repoOverallStatus = 'running';
    else if (hasData) repoOverallStatus = 'success';
    
    return {
      workflows: processedWorkflows,
      overallStatus: repoOverallStatus,
      error: null
    };
  }

  /**
   * Process a single workflow - fetch runs, jobs, commit details.
   */
  async processWorkflow(owner, repoName, workflow) {
    const workflowId = workflow.id;
    const workflowName = workflow.name;
    const workflowPath = workflow.path;
    const workflowState = workflow.state;
    const workflowHtmlUrl = workflow.html_url;
    
    // Fetch latest runs for this workflow
    const runsUrl = `https://api.github.com/repos/${owner}/${repoName}/actions/workflows/${workflowId}/runs?branch=main&per_page=5`;
    const runsResponse = await this.fetchWithTimeout(runsUrl);
    
    if (!runsResponse.ok) {
      throw new Error(`Failed to fetch runs (HTTP ${runsResponse.status})`);
    }
    
    const runsData = await runsResponse.json();
    const runs = runsData.workflow_runs || [];
    
    if (runs.length === 0) {
      return {
        id: workflowId,
        name: workflowName,
        path: workflowPath,
        state: workflowState,
        html_url: workflowHtmlUrl,
        effectiveStatus: 'unknown',
        latestStatus: 'unknown',
        latestConclusion: 'unknown',
        latestRun: null,
        history: []
      };
    }
    
    // For collector's own workflow, prefer completed runs (self-monitoring)
    let runsToUse = runs;
    if (workflowPath === '.github/workflows/collect-status.yml') {
      const completedRuns = runs.filter(r => r.status === 'completed');
      if (completedRuns.length > 0) {
        runsToUse = completedRuns;
      }
    }
    
    const latestRun = runsToUse[0];
    
    // Fetch job details for latest run
    let jobs = [];
    try {
      const jobsUrl = `https://api.github.com/repos/${owner}/${repoName}/actions/runs/${latestRun.id}/jobs`;
      const jobsResponse = await this.fetchWithTimeout(jobsUrl);
      if (jobsResponse.ok) {
        const jobsData = await jobsResponse.json();
        jobs = (jobsData.jobs || []).map(job => ({
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          started_at: job.started_at,
          completed_at: job.completed_at
        }));
      }
    } catch (err) {
      console.debug(`Failed to fetch jobs for run ${latestRun.id}:`, err.message);
    }
    
    // Fetch commit details
    let commitMessage = '';
    let commitAuthor = '';
    if (latestRun.head_sha) {
      try {
        const commitUrl = `https://api.github.com/repos/${owner}/${repoName}/commits/${latestRun.head_sha}`;
        const commitResponse = await this.fetchWithTimeout(commitUrl);
        if (commitResponse.ok) {
          const commitData = await commitResponse.json();
          commitMessage = commitData.commit?.message?.split('\n')[0] || '';
          commitAuthor = commitData.commit?.author?.name || commitData.author?.login || '';
        }
      } catch (err) {
        console.debug(`Failed to fetch commit ${latestRun.head_sha}:`, err.message);
      }
    }
    
    // Determine effective status
    let effectiveStatus = 'unknown';
    if (latestRun.status === 'completed') {
      switch (latestRun.conclusion) {
        case 'success': effectiveStatus = 'success'; break;
        case 'failure':
        case 'action_required': effectiveStatus = 'failure'; break;
        case 'cancelled': effectiveStatus = 'cancelled'; break;
        case 'timed_out': effectiveStatus = 'failure'; break;
        case 'skipped': effectiveStatus = 'skipped'; break;
        default: effectiveStatus = 'unknown';
      }
    } else if (latestRun.status === 'in_progress') {
      effectiveStatus = 'running';
    } else if (latestRun.status === 'queued') {
      effectiveStatus = 'queued';
    } else if (latestRun.status === 'failure') {
      effectiveStatus = 'failure';
    }
    
    // Build latest run object
    const latestRunObj = {
      status: latestRun.status,
      conclusion: latestRun.conclusion,
      runId: latestRun.id,
      runNumber: latestRun.run_number,
      runUrl: latestRun.html_url,
      commitSha: latestRun.head_sha,
      commitMessage: commitMessage,
      commitAuthor: commitAuthor,
      startedAt: latestRun.run_started_at || latestRun.created_at,
      completedAt: latestRun.updated_at,
      jobs: jobs
    };
    
    // Build history
    const history = runs.map(run => ({
      runNumber: run.run_number,
      status: run.status,
      conclusion: run.conclusion,
      commitSha: run.head_sha,
      startedAt: run.run_started_at || run.created_at,
      completedAt: run.updated_at,
      runUrl: run.html_url
    }));
    
    return {
      id: workflowId,
      name: workflowName,
      path: workflowPath,
      state: workflowState,
      html_url: workflowHtmlUrl,
      effectiveStatus: effectiveStatus,
      latestStatus: latestRun.status,
      latestConclusion: latestRun.conclusion,
      latestRun: latestRunObj,
      history: history
    };
  }

  /**
   * Fetch with timeout.
   */
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    
    try {
      const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          ...options.headers
        }
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Normalize old schema repo data to new schema format.
   * Called when live fetch fails for private/inaccessible repos.
   * @param {object} repo - Repository data (may be old schema format)
   */
  normalizeRepoData(repo) {
    // If already in new format (has overallStatus and workflows), skip
    if (repo.overallStatus && Array.isArray(repo.workflows)) {
      return;
    }
    
    // Infer overall status from old schema data
    let overallStatus = 'unknown';
    if (repo.latestRun) {
      if (repo.latestRun.status === 'completed') {
        if (repo.latestRun.conclusion === 'success') overallStatus = 'success';
        else if (repo.latestRun.conclusion === 'failure' || repo.latestRun.conclusion === 'action_required') overallStatus = 'failure';
        else if (repo.latestRun.conclusion === 'cancelled') overallStatus = 'cancelled';
        else if (repo.latestRun.conclusion === 'timed_out') overallStatus = 'failure';
        else if (repo.latestRun.conclusion === 'skipped') overallStatus = 'skipped';
      } else if (repo.latestRun.status === 'in_progress') {
        overallStatus = 'running';
      } else if (repo.latestRun.status === 'queued') {
        overallStatus = 'queued';
      }
    }
    
    // Convert latestRun to workflows array format
    const workflows = [];
    if (repo.latestRun) {
      const effectiveStatus = overallStatus;
      const latestRun = repo.latestRun;
      
      // Create a workflow entry from the old latestRun
      // Use runId as workflow ID if available, otherwise generate from repo name
      const workflowId = latestRun.runId || this.constructor.hashCode(repo.name);
      const workflow = {
        id: workflowId,
        name: 'Default Pipeline',
        path: '.github/workflows/default.yml',
        state: 'active',
        html_url: latestRun.runUrl || '',
        effectiveStatus: effectiveStatus,
        latestStatus: latestRun.status,
        latestConclusion: latestRun.conclusion,
        latestRun: {
          status: latestRun.status,
          conclusion: latestRun.conclusion,
          runId: latestRun.runId,
          runNumber: latestRun.runNumber,
          runUrl: latestRun.runUrl,
          commitSha: latestRun.commitSha,
          commitMessage: latestRun.commitMessage,
          commitAuthor: latestRun.commitAuthor,
          startedAt: latestRun.startedAt,
          completedAt: latestRun.completedAt,
          jobs: latestRun.jobs || []
        },
        history: []
      };
      workflows.push(workflow);
    }
    
    // Set new schema fields
    repo.overallStatus = overallStatus;
    repo.workflows = workflows;
    repo.error = repo.error || null;
  }

  /**
   * Update overall status in merged data.
   */
  updateOverallStatus(data) {
    let hasFailure = false;
    let hasRunning = false;
    let hasData = false;
    
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
    });
    
    let overallStatus = 'unknown';
    if (hasFailure) overallStatus = 'failure';
    else if (hasRunning) overallStatus = 'running';
    else if (hasData) overallStatus = 'success';
    
    data.overallStatus = overallStatus;
  }

  /**
   * Simple hash function for generating workflow IDs from repo names.
   * @param {string} str - String to hash
   * @returns {number} - Positive integer hash
   */
  static hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

export const statusApi = new StatusApi();
