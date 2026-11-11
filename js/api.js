/**
 * api.js
 * Data access layer for the Athmetry System Status dashboard.
 * Reads data/status.json from the same origin (GitHub Pages project URL).
 */

const STATUS_JSON_PATH = "data/status.json";
// Consider data stale if older than this many milliseconds (10 minutes).
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

export class StatusApi {
  constructor() {
    this.lastData = null;
    this.lastFetchAt = null;
    this.error = null;
  }

  /**
   * Fetch the latest status JSON. Returns the parsed object or throws.
   * Uses cache-busting to avoid stale browser/CDN caches.
   */
  async fetchStatus() {
    const url = `${STATUS_JSON_PATH}?t=${Date.now()}`;
    let response;
    try {
      response = await fetch(url, { cache: "no-store" });
    } catch (err) {
      this.error = new Error("Unable to reach the status data endpoint.");
      throw this.error;
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

    this.lastData = data;
    this.lastFetchAt = Date.now();
    this.error = null;
    return data;
  }

  /**
   * Returns true if the cached data is considered stale.
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

  getError() {
    return this.error;
  }

  getLastData() {
    return this.lastData;
  }
}

export const statusApi = new StatusApi();
