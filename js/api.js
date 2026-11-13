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
}

export const statusApi = new StatusApi();
