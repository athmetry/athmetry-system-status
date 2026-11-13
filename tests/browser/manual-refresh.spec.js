const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const STATUS_FIXTURE = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'data/status.json'), 'utf8')
);

/**
 * Serve a valid published status document while allowing individual tests to
 * fail or delay the next data/status.json request.
 */
async function mockStatusRequests(page, behavior = {}) {
  const requests = [];
  let requestCount = 0;

  await page.route('**/data/status.json*', async (route) => {
    requestCount += 1;
    requests.push(route.request().url());

    if (behavior.failAfterInitial && requestCount > 1) {
      await route.abort('failed');
      return;
    }

    if (behavior.invalidAfterInitial && requestCount > 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: 1, collectedAt: 'invalid' }),
      });
      return;
    }

    if (behavior.delayAfterInitial && requestCount > 1 && behavior.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, behavior.delayMs));
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(STATUS_FIXTURE),
    });
  });

  return requests;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#backend-pipelines-list')).not.toHaveText('Loading pipelines...');
});

test('manual refresh loads published status with cache busting', async ({ page }) => {
  const requests = await mockStatusRequests(page);
  const githubApiRequests = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://api.github.com/')) {
      githubApiRequests.push(request.url());
    }
  });
  await page.reload();
  await expect(page.locator('#backend-pipelines-list')).not.toHaveText('Loading pipelines...');

  const initialRequest = requests.at(-1);
  expect(initialRequest).toContain('/data/status.json?t=');

  await page.locator('#refresh-btn').click();
  await expect(page.locator('#refresh-status')).toHaveText('Published status loaded.');

  const refreshRequest = requests.at(-1);
  expect(refreshRequest).toContain('/data/status.json?t=');
  expect(refreshRequest).not.toBe(initialRequest);
  expect(await page.locator('#last-updated').textContent()).toContain('Last checked');
  expect(await page.locator('#last-collected-at').textContent()).toContain('Last collected');
  // The existing stale-data alert remains active for the stale fixture.
  await expect(page.locator('#alert-card')).toBeVisible();
  expect(githubApiRequests).toEqual([]);
});

test('failed manual refresh preserves valid dashboard data and reports failure', async ({ page }) => {
  await mockStatusRequests(page, { failAfterInitial: true });
  await page.reload();
  await expect(page.locator('#backend-pipelines-list')).not.toHaveText('Loading pipelines...');

  const pipelineTextBefore = await page.locator('#backend-pipelines-list').textContent();
  await page.locator('#refresh-btn').click();

  await expect(page.locator('#refresh-status')).toHaveText(
    'Refresh failed. Showing the last available published status.'
  );
  expect(await page.locator('#backend-pipelines-list').textContent()).toBe(pipelineTextBefore);
  expect(await page.locator('#backend-pipelines-list').textContent()).not.toContain('Error loading data');
});

test('dashboard has no horizontal overflow at release viewport widths', async ({ page }) => {
  for (const width of [320, 375, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(page.locator('#backend-pipelines-list')).not.toHaveText('Loading pipelines...');
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
});

test('theme toggle persists the selected theme', async ({ page }) => {
  await page.reload();
  await page.locator('#theme-toggle').click();
  expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
  await page.reload();
  expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
});

test('invalid published status is rejected without replacing valid dashboard data', async ({ page }) => {
  await mockStatusRequests(page, { invalidAfterInitial: true });
  await page.reload();
  await expect(page.locator('#backend-pipelines-list')).not.toHaveText('Loading pipelines...');

  const pipelineTextBefore = await page.locator('#backend-pipelines-list').textContent();
  await page.locator('#refresh-btn').click();

  await expect(page.locator('#refresh-status')).toHaveText(
    'Refresh failed. Showing the last available published status.'
  );
  expect(await page.locator('#backend-pipelines-list').textContent()).toBe(pipelineTextBefore);
});

test('timed out manual refresh preserves valid dashboard data and reports timeout', async ({ page }) => {
  await mockStatusRequests(page, { delayAfterInitial: true, delayMs: 11000 });
  await page.reload();
  await expect(page.locator('#backend-pipelines-list')).not.toHaveText('Loading pipelines...');

  const pipelineTextBefore = await page.locator('#backend-pipelines-list').textContent();
  await page.locator('#refresh-btn').click();

  await expect(page.locator('#refresh-status')).toHaveText(
    'Refresh timed out. Showing the last available published status.',
    { timeout: 15000 }
  );
  expect(await page.locator('#backend-pipelines-list').textContent()).toBe(pipelineTextBefore);
});
