/**
 * app.js
 * Application entry point for the Athmetry System Status dashboard.
 * Initializes the UI, loads status data, and schedules automatic refresh.
 * Also handles theme toggling, manual status refresh, and visitor IP lookup.
 */

import { statusApi } from "./api.js";
import { renderDashboard } from "./dashboard.js";

const REFRESH_INTERVAL_MS = 60 * 1000; // 60 seconds
const THEME_KEY = "athmetry-theme";
const IP_LOOKUP_TIMEOUT_MS = 5000;
const IP_LOOKUP_URL = "https://ipinfo.io/json";

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
const refreshStatus = document.getElementById("refresh-status");

const REFRESH_TIMEOUT_MS = 10000; // 10 second timeout

function setRefreshState(loading) {
  isRefreshing = loading;
  if (refreshBtn) {
    refreshBtn.disabled = loading;
    refreshBtn.classList.toggle("refreshing", loading);
    // Update button label
    const label = refreshBtn.querySelector('.refresh-label');
    if (label) {
      label.textContent = loading ? "Refreshing..." : "Refresh";
    }
  }
  if (refreshStatus && loading) {
    // Only set loading message; success/error messages are set separately after loading ends
    refreshStatus.textContent = "Checking latest published status...";
    refreshStatus.className = "refresh-status loading";
  }
}

function showRefreshMessage(text, kind) {
  if (!refreshStatus) return;
  refreshStatus.textContent = text;
  refreshStatus.className = `refresh-status ${kind}`;
  // Clear after 4 seconds for better visibility
  setTimeout(() => {
    refreshStatus.textContent = "";
    refreshStatus.className = "refresh-status";
  }, 4000);
}

async function handleManualRefresh() {
  if (isRefreshing) return;

  setRefreshState(true);

  // Create a timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Request timed out")), REFRESH_TIMEOUT_MS);
  });

  try {
    // renderDashboard calls statusApi.fetchStatus() which already uses
    // cache-busting (?t=timestamp). This fetches the latest published JSON
    // from GitHub Pages without triggering any GitHub Actions collector workflow.
    // The collector runs on its own schedule (every 5 minutes).
    await Promise.race([renderDashboard(), timeoutPromise]);
    // Show success message AFTER loading state ends
    setRefreshState(false);
    showRefreshMessage("Status updated successfully", "success");
  } catch (err) {
    // Preserve previously displayed data — do not reset the dashboard.
    console.error("Manual refresh failed:", err);
    const isTimeout = err.message === "Request timed out";
    // Show error message AFTER loading state ends
    setRefreshState(false);
    showRefreshMessage(
      isTimeout ? "Refresh timed out. Showing last available data." : "Refresh failed. Showing last available data.",
      "error"
    );
  }
}

/* ------------------------------------------------------------------ */
/* GitHub Actions confirmation dialog                                 */
/* ------------------------------------------------------------------ */

const viewRunsBtns = document.querySelectorAll(".view-runs-btn");
const githubActionsDialog = document.getElementById("github-actions-dialog");

if (viewRunsBtns.length > 0 && githubActionsDialog) {
  // Define the repository-specific GitHub Actions URLs
  const githubUrls = {
    backend: "https://github.com/athmetry/athmetry-backend/actions",
    frontend: "https://github.com/athmetry/athmetry-frontend/actions",
  };

  // Open the dialog for the selected repository
  function openGitHubActionsDialog(repo) {
    const url = githubUrls[repo] || "#";
    const continueBtn = githubActionsDialog.querySelector(".dialog-continue");
    if (continueBtn) {
      continueBtn.href = url;
    }
    githubActionsDialog.showModal();
  }

  // Close the dialog
  function closeGitHubActionsDialog() {
    githubActionsDialog.close();
  }

  // Event listeners for View runs buttons
  viewRunsBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const repoCard = btn.closest(".repo-card");
      const repoId = repoCard.getAttribute("id").replace("repo-row-", "");
      openGitHubActionsDialog(repoId);
    });
  });

  // Close dialog buttons
  const dialogCancelBtns = githubActionsDialog.querySelectorAll(".dialog-cancel");
  dialogCancelBtns.forEach((btn) => {
    btn.addEventListener("click", closeGitHubActionsDialog);
  });

  // Close on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && githubActionsDialog.open) {
      closeGitHubActionsDialog();
    }
  });

  // Close on background click
  githubActionsDialog.addEventListener("click", (e) => {
    if (e.target === githubActionsDialog) {
      closeGitHubActionsDialog();
    }
  });
}

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
      const parts = [data.city, data.region, data.country].filter(Boolean);
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
/* Initialisation                                                     */
/* ------------------------------------------------------------------ */

function init() {
  // Apply theme before rendering to prevent flashing.
  initTheme();

  // Initial dashboard render.
  renderDashboard().catch((err) => {
    console.error("Failed to render dashboard:", err);
  });

  // Schedule automatic refresh without reloading the whole page.
  refreshTimer = setInterval(() => {
    renderDashboard().catch((err) => {
      console.error("Failed to refresh dashboard:", err);
    });
  }, REFRESH_INTERVAL_MS);

  // Manual refresh button.
  if (refreshBtn) {
    refreshBtn.addEventListener("click", handleManualRefresh);
  }

  // Visitor IP lookup (non-blocking, fire and forget).
  fetchVisitorInfo();

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