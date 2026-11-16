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

test('internal status reporter workflows are hidden while application pipelines remain', async ({ page }) => {
  // No Status Reporter row is rendered anywhere on the dashboard.
  await expect(page.locator('.pipeline-row', { hasText: 'Status Reporter' })).toHaveCount(0);
  for (const repoKey of ['backend', 'frontend', 'system-status']) {
    await expect(page.locator(`#${repoKey}-pipelines-list`)).not.toContainText('Status Reporter');
  }

  // Application pipelines are still visible and their health is unchanged.
  await expect(page.locator('#backend-pipelines-list')).toContainText('Athmetry Backend Validation');
  await expect(page.locator('#frontend-pipelines-list')).toContainText('Athmetry Frontend CI');
  await expect(page.locator('#backend-overall-pill')).toContainText('Success');
  await expect(page.locator('#frontend-overall-pill')).toContainText('Success');

  // Counts and rows reflect the filtered workflow list.
  const expectedCounts = {
    backend: STATUS_FIXTURE.repositories
      .find((repo) => repo.name === 'athmetry-backend')
      .workflows.filter((wf) => wf.name !== 'Athmetry Backend Status Reporter').length,
    frontend: STATUS_FIXTURE.repositories
      .find((repo) => repo.name === 'athmetry-frontend')
      .workflows.filter((wf) => wf.name !== 'Athmetry Frontend Status Reporter').length,
    'system-status': STATUS_FIXTURE.repositories
      .find((repo) => repo.name === 'athmetry-system-status')
      .workflows.filter((wf) => wf.name !== 'Deploy to GitHub Pages').length,
  };

  for (const [repoKey, expectedCount] of Object.entries(expectedCounts)) {
    await expect(page.locator(`#${repoKey}-pipelines-list .pipeline-row`)).toHaveCount(expectedCount);
    await expect(page.locator(`#${repoKey}-pipelines-count`)).toHaveText(String(expectedCount));
  }
});

const SCROLL_LOCK_VIEWPORTS = [
  { label: 'mobile', width: 375, height: 640 },
  { label: 'desktop', width: 1280, height: 700 },
];

for (const viewport of SCROLL_LOCK_VIEWPORTS) {
  test(`manual refresh locks background scrolling until the overlay closes (${viewport.label})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockStatusRequests(page, { delayAfterInitial: true, delayMs: 2500 });
    await page.reload();
    await expect(page.locator('#backend-pipelines-list')).not.toHaveText('Loading pipelines...');
    await expect(page.locator('#loading-overlay')).toHaveClass(/hidden/);

    // Sanity check: the page is taller than the viewport, so scrolling is possible.
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)
    ).toBe(true);

    await page.locator('#refresh-btn').click();
    await expect(page.locator('#loading-overlay')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/loading-open/);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).toBe('none');

    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

    await expect(page.locator('#refresh-status')).toHaveText('Published status loaded.', { timeout: 15000 });
    await expect(page.locator('#loading-overlay')).toHaveClass(/hidden/, { timeout: 10000 });
    await expect(page.locator('body')).not.toHaveClass(/loading-open/);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
    expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).not.toBe('none');

    // Scrolling works again after the refresh completes.
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(scrollBefore);
  });

  test(`failed manual refresh releases the scroll lock (${viewport.label})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockStatusRequests(page, { failAfterInitial: true });
    await page.reload();
    await expect(page.locator('#backend-pipelines-list')).not.toHaveText('Loading pipelines...');

    await page.locator('#refresh-btn').click();
    await expect(page.locator('body')).toHaveClass(/loading-open/);
    await expect(page.locator('#refresh-status')).toHaveText(
      'Refresh failed. Showing the last available published status.'
    );
    await expect(page.locator('#loading-overlay')).toHaveClass(/hidden/, { timeout: 10000 });
    await expect(page.locator('body')).not.toHaveClass(/loading-open/);
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
    expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).not.toBe('none');
  });
}

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

  // Compare pipeline identities, not relative timestamps, which legitimately
  // change while the request is in flight.
  const pipelineNamesBefore = await page.locator('#backend-pipelines-list .pipeline-name').allTextContents();
  await page.locator('#refresh-btn').click();

  await expect(page.locator('#refresh-status')).toHaveText(
    'Refresh failed. Showing the last available published status.'
  );
  expect(await page.locator('#backend-pipelines-list .pipeline-name').allTextContents()).toEqual(pipelineNamesBefore);
  await expect(page.locator('#backend-pipelines-list')).not.toContainText('Error loading data');
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

  const pipelineNamesBefore = await page.locator('#backend-pipelines-list .pipeline-name').allTextContents();
  await page.locator('#refresh-btn').click();

  await expect(page.locator('#refresh-status')).toHaveText(
    'Refresh failed. Showing the last available published status.'
  );
  expect(await page.locator('#backend-pipelines-list .pipeline-name').allTextContents()).toEqual(pipelineNamesBefore);
});

test('timed out manual refresh preserves valid dashboard data and reports timeout', async ({ page }) => {
  await mockStatusRequests(page, { delayAfterInitial: true, delayMs: 11000 });
  await page.reload();
  await expect(page.locator('#backend-pipelines-list')).not.toHaveText('Loading pipelines...');

  const pipelineNamesBefore = await page.locator('#backend-pipelines-list .pipeline-name').allTextContents();
  await page.locator('#refresh-btn').click();

  await expect(page.locator('#refresh-status')).toHaveText(
    'Refresh timed out. Showing the last available published status.',
    { timeout: 15000 }
  );
  expect(await page.locator('#backend-pipelines-list .pipeline-name').allTextContents()).toEqual(pipelineNamesBefore);
});
