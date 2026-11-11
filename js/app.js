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
const themeIcon = document.querySelector(".theme-icon");

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
  if (themeIcon) {
    themeIcon.textContent = theme === "dark" ? "\u2600" : "\u263A"; // ☀️ / 🌙
  }
  // Use the correct official logo variant for each background.
  // logo.svg   = light variant (white bg rect, dark wordmark) — for light mode
  // logo-dark.svg = dark variant (dark bg rect, white wordmark) — for dark mode
  const logoEl = document.querySelector(".logo");
  if (logoEl) {
    logoEl.src = theme === "dark" ? "assets/brand/logo-dark.svg" : "assets/brand/logo.svg";
  }
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

function setRefreshState(loading) {
  isRefreshing = loading;
  if (refreshBtn) {
    refreshBtn.disabled = loading;
    refreshBtn.classList.toggle("refreshing", loading);
  }
  if (refreshStatus) {
    refreshStatus.textContent = "";
    refreshStatus.className = "refresh-status";
  }
}

function showRefreshMessage(text, kind) {
  if (!refreshStatus) return;
  refreshStatus.textContent = text;
  refreshStatus.className = `refresh-status ${kind}`;
  setTimeout(() => {
    refreshStatus.textContent = "";
    refreshStatus.className = "refresh-status";
  }, 3000);
}

async function handleManualRefresh() {
  if (isRefreshing) return;

  setRefreshState(true);

  try {
    // renderDashboard calls statusApi.fetchStatus() which already uses
    // cache-busting (?t=timestamp). This fetches the latest published JSON
    // without triggering any GitHub Actions collector workflow.
    await renderDashboard();
    showRefreshMessage("Refreshed", "success");
  } catch (err) {
    // Preserve previously displayed data — do not reset the dashboard.
    console.error("Manual refresh failed:", err);
    showRefreshMessage("Failed", "error");
  } finally {
    setRefreshState(false);
  }
}

function initRefreshButton() {
  if (!refreshBtn) return;
  refreshBtn.addEventListener("click", handleManualRefresh);
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
/* Boot                                                               */
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
  initRefreshButton();

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
