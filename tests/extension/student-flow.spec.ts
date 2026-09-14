import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
let context: BrowserContext;
let section: Page;
let panel: Page;
let extensionId: string;
let profile: string;
test.beforeEach(async () => {
  profile = await mkdtemp(path.join(os.tmpdir(), 'zyflow-walkthrough-'));
  const extension = path.resolve(
    test.info().title.includes('production') ? '.output/chrome-mv3' : '.output/chrome-mv3-fixture',
  );
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
  section = await context.newPage();
});
test.afterEach(async () => {
  if (test.info().status !== test.info().expectedStatus && panel && !panel.isClosed())
    console.log(
      'Walkthrough status:',
      await panel
        .getByRole('status')
        .textContent()
        .catch(() => 'closed'),
    );
  await context.close();
  await rm(profile, { recursive: true, force: true });
});
async function openPanel() {
  panel = await context.newPage();
  await panel.setViewportSize({ width: 390, height: 900 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
}
async function setup(scenario = 'all') {
  await section.goto(`http://localhost:4173/zybook/demo/chapter/1/section/1?case=${scenario}`);
  await expect
    .poll(() =>
      context
        .serviceWorkers()[0]!
        .evaluate(async () => !!(await chrome.storage.session.get('checkpoint')).checkpoint),
    )
    .toBe(true);
  await openPanel();
  await expect(panel.getByRole('heading', { name: 'Section 1.1', exact: true })).toBeVisible();
  await panel.getByLabel('Pause when the connected tab is hidden').uncheck();
}
async function reopen() {
  await panel.close();
  await openPanel();
  await expect(panel.getByRole('heading', { name: /Section 1\./ })).toBeVisible();
}

test('student can correct an invalid range before sending a Start request', async () => {
  await setup();
  await panel.getByLabel('Run scope', { exact: true }).selectOption('range');
  await expect(panel.getByRole('button', { name: 'Start run' })).toBeDisabled();
  await expect(panel.getByRole('alert')).toContainText('end section');
  await panel.getByPlaceholder('2.4').fill('later');
  await expect(panel.getByRole('alert')).toContainText('chapter.section');
  await panel.screenshot({ path: 'test-results/walkthrough-validation.png', fullPage: true });
  await panel.getByPlaceholder('2.4').fill('1.2');
  await panel.getByLabel('Section limit').fill('0');
  await expect(panel.getByRole('alert')).toContainText('1 and 20');
  await panel.getByLabel('Section limit').fill('3');
  await expect(panel.getByRole('button', { name: 'Start run' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('finished', { timeout: 15000 });
  await expect(section).toHaveURL(/section\/2/);
});

test('student settings survive closing and reopening before and after a run', async () => {
  await setup('navigation');
  await panel.getByLabel('Run scope', { exact: true }).selectOption('range');
  await panel.getByPlaceholder('2.4').fill('1.2');
  await panel.getByLabel('Section limit').fill('3');
  await reopen();
  await expect(panel.getByPlaceholder('2.4')).toHaveValue('1.2');
  await expect(panel.getByLabel('Section limit')).toHaveValue('3');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('finished', { timeout: 15000 });
  await panel.getByLabel('Animations', { exact: true }).uncheck();
  await reopen();
  await expect(panel.getByLabel('Animations', { exact: true })).not.toBeChecked();
});

test('student can stop after leaving the allowed site and connect to a different section', async () => {
  await setup('slow');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('waiting');
  await section.goto('about:blank');
  await expect(panel.getByTestId('run-state')).toHaveText('paused');
  await panel.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('stopped');
  await expect(panel.getByText('Last connected section', { exact: true })).toBeVisible();
  const next = await context.newPage();
  await next.goto('http://localhost:4173/zybook/demo/chapter/1/section/2?case=navigation');
  await next.bringToFront();
  await panel.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Section 1.2', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('finished');
});

test('student can return to the pinned tab from a paused run', async () => {
  await setup('slow');
  await panel.getByLabel('Pause when the connected tab is hidden').check();
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('paused');
  await panel.getByRole('button', { name: 'Go to connected tab' }).click();
  await expect(panel.getByText('You switched tabs.')).not.toBeVisible();
  await panel.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('finished', { timeout: 15000 });
});

test('production student can locate an unsupported candidate without submitting anything', async () => {
  await section.route('https://learn.zybooks.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body style="margin:0"><div style="height:1600px">Synthetic surrounding content</div><article class="participation" style="height:400px"><button onclick="document.body.dataset.submitted=1">Check</button></article></body>',
    }),
  );
  await section.goto('https://learn.zybooks.com/zybook/demo/chapter/1/section/1');
  await expect
    .poll(() =>
      context
        .serviceWorkers()[0]!
        .evaluate(async () => !!(await chrome.storage.session.get('checkpoint')).checkpoint),
    )
    .toBe(true);
  await openPanel();
  await expect(panel.getByRole('heading', { name: 'Section 1.1', exact: true })).toBeVisible();
  await panel.getByLabel('Pause when the connected tab is hidden').uncheck();
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('needs attention');
  await panel.getByRole('button', { name: 'Show on page' }).click();
  await expect.poll(() => section.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  expect(await section.locator('body').getAttribute('data-submitted')).toBeNull();
});

test('student runs selected families, repeats safely, and downloads redacted diagnostics', async () => {
  await setup();
  for (const label of ['Multiple choice', 'Short answers', 'Term matching', 'Ordered blocks'])
    await panel.getByLabel(label, { exact: true }).uncheck();
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('finished');
  await expect(panel.locator('.count-grid > div').filter({ hasText: 'This run' })).toHaveText(
    '1This run',
  );
  await expect(section.locator('[data-zf-activity="choice"]')).not.toHaveAttribute(
    'data-complete',
    'true',
  );
  await panel.getByLabel('Multiple choice', { exact: true }).check();
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('finished');
  await expect(panel.locator('.count-grid > div').filter({ hasText: 'Already done' })).toHaveText(
    '1Already done',
  );
  await expect(panel.locator('.count-grid > div').filter({ hasText: 'This run' })).toHaveText(
    '1This run',
  );
  const actions = await section.evaluate(
    () => (window as unknown as { fixtureActions: string[] }).fixtureActions,
  );
  expect(actions).toEqual(['speed', 'start', 'next', 'q1:a', 'q1:b']);
  await panel.getByText('Diagnostics & compatibility', { exact: true }).click();
  const downloadEvent = panel.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export diagnostics' }).click();
  const download = await downloadEvent;
  const { readFile } = await import('node:fs/promises');
  const data = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(data.state).toBe('finished');
  expect(data.activities).toHaveLength(2);
  expect(JSON.stringify(data)).not.toMatch(/Which number|demo|zybook|q1|code|answer|route/);
});

test('student sees missing feedback as attention, then explicitly skips the item', async () => {
  await setup('offline');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('needs attention', { timeout: 12000 });
  await expect(panel.locator('.count-grid > div').filter({ hasText: 'Failed' })).toHaveText(
    '0Failed',
  );
  await expect(panel.getByText('1 needs attention', { exact: true })).toBeVisible();
  await panel.screenshot({ path: 'test-results/walkthrough-attention.png', fullPage: true });
  await panel.getByRole('button', { name: 'Skip', exact: true }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('finished');
  await expect(panel.getByTestId('current-action')).toHaveText('Finished with 1 skipped');
  await expect(panel.locator('.count-grid > div').filter({ hasText: 'This run' })).toHaveText(
    '0This run',
  );
  expect(
    await section.evaluate(
      () => (window as unknown as { fixtureActions: string[] }).fixtureActions,
    ),
  ).toEqual(['q1:a']);
});
