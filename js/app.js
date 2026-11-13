/**
 * app.js
 * Application entry point for the Athmetry System Status dashboard.
 * Initializes the UI, loads status data, and schedules automatic refresh.
 * Also handles theme toggling, manual status refresh, and visitor IP lookup.
 */

import { statusApi } from "./api.js";
import { renderDashboard, renderErrorState } from "./dashboard.js";

const REFRESH_INTERVAL_MS = 60 * 1000; // 60 seconds
const THEME_KEY = "athmetry-theme";
const IP_LOOKUP_TIMEOUT_MS = 5000;
// Use ipwho.is which supports CORS for browser requests
const IP_LOOKUP_URL = "https://ipwho.is/";

let refreshTimer = null;
let isRefreshing = false;

/* ------------------------------------------------------------------ */
/* Theme management                                                   */
/* ------------------------------------------------------------------ */

const themeToggle = document.getElementById("theme-toggle");

function getSystemTheme() {
  // Default to light mode regardless of system preference
  return "light";
}

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (e) {
    return null;
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);

  // Update theme toggle button icon + aria-label
  if (themeToggle) {
    const isDark = theme === "dark";
    themeToggle.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
  }

  // Footer logo variants are handled via CSS [data-theme] selectors
  // No JS DOM manipulation needed.

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    // localStorage unavailable — ignore, theme still applies for this session.
  }
}

/* ------------------------------------------------------------------ */
/* Loading overlay                                                    */
/* ------------------------------------------------------------------ */

const loadingOverlay = document.getElementById("loading-overlay");
// The overlay must remain visible for at least 1.5 seconds, and longer if
// loading/rendering is still in progress.
const MIN_OVERLAY_VISIBLE_MS = 1500;
const OVERLAY_FADE_OUT_MS = 300;
let overlayShownAt = 0;
let overlayHideTimer = null;

function showLoadingOverlay() {
  if (!loadingOverlay) return;
  overlayShownAt = Date.now();
  if (overlayHideTimer) {
    clearTimeout(overlayHideTimer);
    overlayHideTimer = null;
  }
  loadingOverlay.classList.remove("hidden", "is-hiding");
}

function hideLoadingOverlay() {
  if (!loadingOverlay) return;
  if (overlayHideTimer) clearTimeout(overlayHideTimer);
  // Enforce the minimum visible duration, then dismiss the overlay smoothly.
  const remaining = Math.max(0, MIN_OVERLAY_VISIBLE_MS - (Date.now() - overlayShownAt));
  overlayHideTimer = setTimeout(() => {
    loadingOverlay.classList.add("is-hiding");
    overlayHideTimer = setTimeout(() => {
      loadingOverlay.classList.add("hidden");
      loadingOverlay.classList.remove("is-hiding");
      overlayHideTimer = null;
    }, OVERLAY_FADE_OUT_MS);
  }, remaining);
}

function updateLastUpdatedNow() {
  const lastUpdatedEl = document.getElementById('last-updated');
  if (lastUpdatedEl) {
    lastUpdatedEl.textContent = 'Last checked: just now';
    // Update to relative time after a short delay
    setTimeout(() => {
      lastUpdatedEl.textContent = 'Last checked: a few seconds ago';
    }, 5000);
  }
}

function initTheme() {
  const stored = getStoredTheme();
  if (stored === "light" || stored === "dark") {
    setTheme(stored);
  } else {
    setTheme(getSystemTheme());
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      setTheme(current === "dark" ? "light" : "dark");
    });
  }
}

/* ------------------------------------------------------------------ */
/* Manual status refresh                                              */
/* ------------------------------------------------------------------ */

const refreshBtn = document.getElementById("refresh-btn");
const refreshStatusEl = document.getElementById("refresh-status");

/**
 * Show the result of the most recent published-status refresh attempt.
 * @param {string} message - User-facing status message
 * @param {string} state - One of loading, success, or error
 */
function setRefreshStatus(message, state) {
  if (!refreshStatusEl) return;
  refreshStatusEl.textContent = message;
  refreshStatusEl.className = "refresh-message";
  if (state) {
    refreshStatusEl.classList.add(`is-${state}`);
  }
}

async function handleManualRefresh() {
  // Prevent overlapping manual refresh requests
  if (isRefreshing) return;
  isRefreshing = true;

  // Full-screen loading overlay for the duration of the manual refresh
  showLoadingOverlay();
  if (refreshBtn) {
    refreshBtn.classList.add('refreshing');
    refreshBtn.disabled = true;
  }

  setRefreshStatus("Checking latest published status...", "loading");

  try {
    // The published status.json is the authoritative dashboard source.
    // fetchStatus() adds cache busting, uses cache: "no-store", and validates
    // the schema before the dashboard is updated.
    const data = await statusApi.fetchStatus();
    await renderDashboard(data);
    updateLastUpdatedNow();
    setRefreshStatus("Published status loaded.", "success");
  } catch (err) {
    console.error("Manual refresh failed:", err);
    // Retain the last successfully rendered dashboard data where possible.
    const lastValidData = statusApi.getLastValidData();
    if (lastValidData) {
      await renderDashboard(lastValidData);
      const timedOut = err.message.includes("timed out");
      setRefreshStatus(
        timedOut
          ? "Refresh timed out. Showing the last available published status."
          : "Refresh failed. Showing the last available published status.",
        "error"
      );
    } else {
      renderErrorState("Unable to load status data. Please refresh or try again later.");
      setRefreshStatus("Refresh failed. No previously published status is available.", "error");
    }
  } finally {
    // Remove the overlay only after fetch + rendering have completed (or failed)
    hideLoadingOverlay();
    if (refreshBtn) {
      refreshBtn.classList.remove('refreshing');
      refreshBtn.disabled = false;
    }
    isRefreshing = false;
  }
}

/* ------------------------------------------------------------------ */
/* Pipeline detail dialog (handled in dashboard.js)                   */
/* ------------------------------------------------------------------ */

// Pipeline detail dialog is handled entirely in dashboard.js

/* ------------------------------------------------------------------ */
/* Visitor IP & approximate location                                  */
/* ------------------------------------------------------------------ */

const visitorIpEl = document.getElementById("visitor-ip");
const visitorLocEl = document.getElementById("visitor-location");

async function fetchVisitorInfo() {
  if (!visitorIpEl && !visitorLocEl) return;

  let controller;
  try {
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IP_LOOKUP_TIMEOUT_MS);

    const response = await fetch(IP_LOOKUP_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`IP lookup failed (HTTP ${response.status})`);
    }

    const data = await response.json();

    if (visitorIpEl) {
      visitorIpEl.textContent = `Visitor IP: ${data.ip || "Unavailable"}`;
    }
    if (visitorLocEl) {
      // ipapi.co uses country_name, ipinfo.io uses country
      const country = data.country_name || data.country;
      const parts = [data.city, data.region, country].filter(Boolean);
      visitorLocEl.textContent =
        parts.length > 0 ? `Approx. Location: ${parts.join(", ")}` : "Approx. Location: Unavailable";
    }
  } catch (err) {
    // Never block the dashboard; failures are silent to the user except for the
    // "Unavailable" placeholder already present in the markup.
    if (visitorIpEl) visitorIpEl.textContent = "Visitor IP: Unavailable";
    if (visitorLocEl) visitorLocEl.textContent = "Approx. Location: Unavailable";
    console.debug("Visitor IP lookup unavailable:", err.message);
  }
}

/* ------------------------------------------------------------------ */
/* Release version (from package.json — single source of truth)       */
/* ------------------------------------------------------------------ */

const releaseVersionEl = document.getElementById("release-version");

async function fetchReleaseVersion() {
  if (!releaseVersionEl) return;
  try {
    const response = await fetch("package.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const pkg = await response.json();
    if (pkg.version) {
      // Display major version only (e.g., "1.0.0" → "Release v1.0")
      const majorMinor = pkg.version.split(".").slice(0, 2).join(".");
      releaseVersionEl.textContent = `Release v${majorMinor}`;
    }
  } catch (err) {
    // Graceful fallback — keep placeholder
    console.debug("Release version unavailable:", err.message);
  }
}

/* ------------------------------------------------------------------ */
/* Initialisation                                                     */
/* ------------------------------------------------------------------ */

function init() {
  // Apply theme before rendering to prevent flashing.
  initTheme();

  // Show the full-screen loading overlay immediately (it is also visible by
  // default in the markup, so it covers initial page load/reload before JS runs).
  showLoadingOverlay();

  // Initial dashboard render; the overlay is removed only after the initial
  // status data has been fetched and rendered (or the attempt has failed).
  renderDashboard()
    .then(() => {
      // Reflect the browser's successful initial fetch time in the header.
      updateLastUpdatedNow();
      setRefreshStatus("Published status loaded.", "success");
    })
    .catch((err) => {
      console.error("Failed to render dashboard:", err);
      // Surface the failure instead of leaving empty cards that look like
      // a healthy dashboard with zero pipelines.
      renderErrorState("Unable to load status data. Please refresh or try again later.");
      setRefreshStatus("Failed to load published status.", "error");
    })
    .finally(() => {
      hideLoadingOverlay();
    });

  // Schedule automatic refresh without reloading the whole page.
  refreshTimer = setInterval(async () => {
    try {
      await renderDashboard();
      // Update last-checked timestamp to actual successful browser check time
      updateLastUpdatedNow();
      setRefreshStatus("Published status loaded.", "success");
    } catch (err) {
      console.error("Failed to refresh dashboard:", err);
      
      // Try to restore last valid data without claiming the browser check
      // succeeded. The header timestamp remains the last successful check.
      const lastValidData = statusApi.getLastValidData();
      if (lastValidData) {
        console.warn("Auto-refresh failed, restoring last valid data");
        await renderDashboard(lastValidData);
        setRefreshStatus("Automatic refresh failed. Showing the last available published status.", "error");
      }
    }
  }, REFRESH_INTERVAL_MS);

  // Manual refresh button.
  if (refreshBtn) {
    refreshBtn.addEventListener("click", handleManualRefresh);
  }

  // Visitor IP lookup (non-blocking, fire and forget).
  fetchVisitorInfo();

  // Release version from package.json (non-blocking).
  fetchReleaseVersion();

  // Clean up timer on page unload.
  window.addEventListener("beforeunload", () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}