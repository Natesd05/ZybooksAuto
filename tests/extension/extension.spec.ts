import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import type { Snapshot } from '../../src/protocol/schema';
const BUILD_VERSION = JSON.parse(await readFile('package.json', 'utf8')).version;
const STALE_RUNNER_MESSAGE =
  'The zyBooks page is using an older runner. Refresh the zyBooks tab, then Connect and Resume.';
let context: BrowserContext;
let panel: Page;
let page: Page;
let profile: string;
let extensionId: string;
test.beforeEach(async () => {
  profile = await mkdtemp(path.join(os.tmpdir(), 'zyflow-test-'));
  let extension = path.resolve(
    test.info().title.startsWith('production package')
      ? '.output/chrome-mv3'
      : '.output/chrome-mv3-fixture',
  );
  if (
    test.info().title.includes('missing page script') ||
    test.info().title.includes('outdated page runner')
  ) {
    const copy = path.join(profile, 'extension');
    await cp(extension, copy, { recursive: true });
    const manifestPath = path.join(copy, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    // Reproduce a tab with host permission but no automatically installed page listener.
    if (test.info().title.includes('missing page script')) delete manifest.content_scripts;
    else {
      const script = await readFile(path.join(copy, 'content-scripts/content.js'), 'utf8');
      const old = script.replace(`version:\`${BUILD_VERSION}\``, 'version:`0.0.0`');
      expect(old).not.toBe(script);
      await writeFile(path.join(copy, 'legacy-content.js'), old);
      manifest.content_scripts[0].js = ['legacy-content.js'];
    }
    await writeFile(manifestPath, JSON.stringify(manifest));
    extension = copy;
  }
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1100, height: 900 },
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
  page = await context.newPage();
});
test.afterEach(async () => {
  const info = test.info();
  if (info.status !== info.expectedStatus && panel && !panel.isClosed())
    console.log(
      'Panel status:',
      await panel
        .getByRole('status')
        .textContent()
        .catch(() => 'closed'),
    );
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});
async function setup(scenario = 'all', section = 1) {
  await page.goto(
    `http://localhost:4173/zybook/demo/chapter/1/section/${section}?case=${scenario}`,
  );
  const worker = context.serviceWorkers()[0]!;
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          ((await chrome.storage.session.get('checkpoint')).checkpoint as Snapshot | undefined)
            ?.identity.tabId,
      ),
    )
    .toBeTruthy();
  panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(
    panel.getByRole('heading', { name: `Section 1.${section}`, exact: true }),
  ).toBeVisible();
  // Opening the panel as an extension tab changes visibility; real side panels do not.
  await panel.getByLabel('Pause when the connected tab is hidden').uncheck();
}
async function snapshot(): Promise<Snapshot> {
  return panel.evaluate(
    async () => (await chrome.storage.session.get('checkpoint')).checkpoint as Snapshot,
  );
}
async function rawCommand(command: string, extra = {}) {
  return panel.evaluate(
    async ({ command, extra }) => {
      const snapshot = (await chrome.storage.session.get('checkpoint')).checkpoint as Snapshot;
      return chrome.runtime.sendMessage({
        protocolVersion: 1,
        requestId: crypto.randomUUID(),
        type: 'command',
        command,
        runId: snapshot.runId,
        identity: snapshot.identity,
        settings: { ...snapshot.settings, pauseHidden: false },
        ...extra,
      });
    },
    { command, extra },
  );
}
async function actions() {
  return page.evaluate(() => (window as unknown as { fixtureActions: string[] }).fixtureActions);
}
async function finished() {
  await expect(panel.getByTestId('run-state')).toHaveText('finished', { timeout: 15000 });
}
for (const runnerVersion of [undefined, '0.1.1']) {
  test(`outdated runner ${runnerVersion ?? 'unversioned'} blocks execution until Connect repairs it`, async () => {
    await setup();
    await panel.evaluate(async (runnerVersion) => {
      const checkpoint = (await chrome.storage.session.get('checkpoint')).checkpoint as Snapshot;
      // Keep current-runner heartbeats from replacing this simulated legacy checkpoint.
      await chrome.storage.session.set({
        checkpoint: { ...checkpoint, runnerVersion, seq: checkpoint.seq + 1000 },
      });
    }, runnerVersion);
    await expect(panel.getByRole('alert')).toHaveText(STALE_RUNNER_MESSAGE);
    await expect(panel.getByRole('button', { name: 'Start run' })).toBeDisabled();
    for (const command of ['start', 'resume', 'retry', 'skip']) {
      expect(await rawCommand(command)).toMatchObject({ ok: false, error: STALE_RUNNER_MESSAGE });
    }
    expect(await actions()).toEqual([]);
    const documentStart = await page.evaluate(() => performance.timeOrigin);
    await panel.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect.poll(async () => (await snapshot()).runnerVersion).toBe(BUILD_VERSION);
    await expect(panel.getByRole('button', { name: 'Start run' })).toBeEnabled();
    await expect(panel.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStart);
  });
}
test('Connect checks the page instead of reporting a saved checkpoint as connected', async () => {
  await setup();
  await page.goto('about:blank');
  await panel.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText(
    'connected tab is unavailable or has left zyBooks',
  );
  await expect(panel.getByRole('button', { name: 'Start run' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Refresh connected page' })).toBeVisible();
  expect((await snapshot()).identity.tabId).toBeTruthy();
});

for (const running of [false, true]) {
  test(`Connect replaces an outdated page runner ${running ? 'during a pending action' : 'while idle'} without reloading`, async () => {
    await page.goto('http://localhost:4173/zybook/demo/chapter/1/section/1?case=offline');
    const worker = context.serviceWorkers()[0]!;
    const stored = () =>
      worker.evaluate(
        async () => (await chrome.storage.session.get('checkpoint')).checkpoint as Snapshot,
      );
    await expect.poll(async () => (await stored())?.runnerVersion).toBe('0.0.0');
    if (running) {
      await worker.evaluate(async () => {
        const state = (await chrome.storage.session.get('checkpoint')).checkpoint as Snapshot;
        await chrome.tabs.sendMessage(
          state.identity.tabId,
          {
            protocolVersion: 1,
            requestId: crypto.randomUUID(),
            type: 'command',
            command: 'start',
            runId: state.runId,
            identity: state.identity,
            settings: { ...state.settings, pauseHidden: false },
          },
          { documentId: state.identity.documentId },
        );
      });
      await expect.poll(async () => (await stored()).state).toBe('waiting');
    }
    const previous = await stored();
    const clicks = await actions();
    const documentStart = await page.evaluate(() => performance.timeOrigin);
    panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect.poll(async () => (await stored()).runnerVersion).toBe(BUILD_VERSION);
    await expect(panel.getByRole('alert')).toHaveCount(0);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStart);
    const repaired = await stored();
    expect(repaired.runId).toBe(previous.runId);
    expect(repaired.state).toBe(running ? 'paused' : 'idle');
    expect(repaired.uncertain).toEqual(previous.uncertain);
    expect(repaired.items).toEqual(previous.items);
    expect(await actions()).toEqual(clicks);
    // A later heartbeat must come from the new context, not resurrect the old version.
    await expect.poll(async () => (await stored()).seq).toBeGreaterThan(repaired.seq);
    expect((await stored()).runnerVersion).toBe(BUILD_VERSION);
    expect(await actions()).toEqual(clicks);
  });
}

test('production package Connect repairs a missing page script without starting activities', async () => {
  await page.route('https://learn.zybooks.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><button onclick="document.body.dataset.clicked=1">Start</button>',
    }),
  );
  await page.goto('https://learn.zybooks.com/zybook/demo/chapter/1/section/1');
  const worker = context.serviceWorkers()[0]!;
  expect(
    await worker.evaluate(async () => (await chrome.storage.session.get('checkpoint')).checkpoint),
  ).toBeUndefined();
  panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled();
  await page.bringToFront();
  await panel.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Section 1.1', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Start run' })).toBeEnabled();
  const first = await snapshot();
  expect(first.runnerVersion).toBe(BUILD_VERSION);
  expect(first.state).toBe('idle');
  await panel.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled();
  expect((await snapshot()).runId).toBe(first.runId);
  expect(await page.locator('body').getAttribute('data-clicked')).toBeNull();
});
test('built extension executes all five families through its own event path', async () => {
  await setup();
  await panel.getByRole('button', { name: 'Start run' }).click();
  await finished();
  const state = await snapshot();
  expect(state.items).toHaveLength(5);
  expect(state.items.every((item) => item.state === 'complete')).toBe(true);
  const sent = await actions();
  expect(sent.filter((action) => action.startsWith('q1:'))).toEqual(['q1:a', 'q1:b']);
  expect(sent.filter((action) => action === 'submit:s1')).toHaveLength(1);
  expect(sent).toContain('drop:a:one:false');
  expect(sent).toContain('drop:b:two:false');
  expect(await page.locator('[data-block="second"]').getAttribute('data-indent')).toBe('1');
  await panel.setViewportSize({ width: 390, height: 1000 });
  await panel.screenshot({ path: 'test-results/panel-light.png', fullPage: true });
  await panel.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await panel.screenshot({ path: 'test-results/panel-dark.png', fullPage: true });
});
test('duplicate Start, close/reopen panel, and stale commands do not duplicate a run', async () => {
  await setup('slow');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('waiting');
  await Promise.all([rawCommand('start'), rawCommand('start')]);
  const state = await snapshot();
  await panel.close();
  panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await finished();
  expect(await actions()).toEqual(['q1:a', 'q1:b']);
  expect((await snapshot()).runId).toBe(state.runId);
  const response = await rawCommand('stop', { runId: 'stale-run' });
  expect(response.ok).toBe(false);
});
test('pause and Stop cancel pending work; Resume waits for the dispatched result', async () => {
  await setup('slow');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('waiting');
  await panel.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('paused');
  await page.waitForFunction(
    () => document.querySelector('[data-zf-activity]')?.getAttribute('data-revision') === '1',
  );
  expect(await actions()).toEqual(['q1:a']);
  await panel.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect.poll(actions).toEqual(['q1:a', 'q1:b']);
  await panel.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('stopped');
  await page.waitForFunction(
    () => document.querySelector('[data-zf-activity]')?.getAttribute('data-complete') === 'true',
  );
  expect(await actions()).toEqual(['q1:a', 'q1:b']);
});
for (const scenario of ['empty', 'missing', 'unknown', 'offline'])
  test(`${scenario} never produces false success`, async () => {
    await setup(scenario);
    await panel.getByRole('button', { name: 'Start run' }).click();
    await expect(panel.getByTestId('run-state')).toHaveText('needs attention', { timeout: 12000 });
    expect((await snapshot()).items.some((item) => item.state === 'complete')).toBe(false);
    if (scenario === 'offline') {
      expect(await actions()).toEqual(['q1:a']);
      await panel.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(panel.getByTestId('run-state')).toHaveText('waiting');
      await expect(panel.getByTestId('run-state')).toHaveText('needs attention', {
        timeout: 12000,
      });
      expect(await actions()).toEqual(['q1:a']);
    }
    if (scenario === 'unknown') {
      await panel.getByRole('button', { name: 'Skip', exact: true }).click();
      await finished();
      expect(await actions()).toEqual([]);
      await expect(panel.getByTestId('current-action')).toContainText('1 skipped');
    }
  });
test('completed blank fields are skipped and delayed rerenders are reacquired', async () => {
  await setup('complete');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await finished();
  expect((await snapshot()).items[0]?.state).toBe('already_complete');
  expect(await actions()).toEqual([]);
});
test('rerendered question roots do not cause duplicate submissions', async () => {
  await setup('rerender');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await finished();
  expect(await actions()).toEqual(['q1:a', 'q1:b']);
});
for (const scenario of ['navigation', 'spa'])
  test(`${scenario} handoff confirms readiness and the exact end boundary`, async () => {
    await setup(scenario);
    await panel.getByLabel('Run scope', { exact: true }).selectOption('range');
    await panel.getByPlaceholder('2.4').fill('1.2');
    await panel.getByRole('button', { name: 'Start run' }).click();
    await expect(page).toHaveURL(/section\/2/);
    await finished();
    const state = await snapshot();
    expect(state.section).toBe('1.2');
    expect(state.visited).toHaveLength(2);
    expect(state.items.filter((item) => item.state === 'complete')).toHaveLength(2);
  });
test('final section finishes without a next link', async () => {
  await setup('all', 3);
  await panel.getByRole('button', { name: 'Start run' }).click();
  await finished();
  expect((await snapshot()).section).toBe('1.3');
});
test('manual navigation pauses and another tab cannot take ownership', async () => {
  await setup('slow');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('waiting');
  const original = (await snapshot()).identity.tabId;
  const other = await context.newPage();
  await other.goto('http://localhost:4173/zybook/demo/chapter/1/section/3');
  expect((await snapshot()).identity.tabId).toBe(original);
  await page.goto('http://localhost:4173/zybook/demo/chapter/1/section/2?case=manual');
  await expect(panel.getByTestId('run-state')).toHaveText('paused');
  expect(await actions()).toEqual([]);
});
test('worker termination recovers session checkpoints without replaying actions', async () => {
  await setup('slow');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('waiting');
  const previous = await snapshot();
  const cdp = await context.newCDPSession(panel);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  await cdp.detach();
  await finished();
  expect((await snapshot()).runId).toBe(previous.runId);
  expect(await actions()).toEqual(['q1:a', 'q1:b']);
});

test('default hidden-tab policy pauses before further work', async () => {
  await setup('slow');
  await panel.bringToFront();
  await expect
    .poll(() =>
      panel.evaluate(async () => {
        const checkpoint = (await chrome.storage.session.get('checkpoint')).checkpoint as Snapshot;
        return (await chrome.tabs.get(checkpoint.identity.tabId)).active;
      }),
    )
    .toBe(false);
  const reply = await rawCommand('start', {
    settings: { ...(await snapshot()).settings, pauseHidden: true },
  });
  expect(reply.ok).toBe(true);
  await expect(panel.getByTestId('run-state')).toHaveText('paused');
  expect(await actions()).toEqual([]);
  await page.bringToFront();
  await rawCommand('resume', { settings: { ...(await snapshot()).settings, pauseHidden: true } });
  await expect(panel.getByTestId('run-state')).toHaveText('waiting');
  await panel.bringToFront();
  await expect(panel.getByTestId('run-state')).toHaveText('paused');
  expect(await actions()).toEqual(['q1:a']);
});

test('a reloaded in-flight document requires evidence instead of resubmission', async () => {
  await setup('offline');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('waiting');
  await page.reload();
  await expect(panel.getByTestId('run-state')).toHaveText('paused');
  await panel.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('needs attention', { timeout: 12000 });
  expect(await actions()).toEqual([]);
});

test('closing the owning tab clears ownership', async () => {
  await setup('slow');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('waiting');
  await page.close();
  await expect
    .poll(() =>
      panel.evaluate(async () => (await chrome.storage.session.get('checkpoint')).checkpoint),
    )
    .toBeUndefined();
});

test('login navigation pauses the run and cannot submit to the login page', async () => {
  await setup('slow');
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('waiting');
  await page.goto('http://localhost:4173/signin?case=empty');
  await expect(panel.getByTestId('run-state')).toHaveText('paused');
  expect(await actions()).toEqual([]);
});

test('production package loads but cannot execute synthetic selectors', async () => {
  await page.route('https://learn.zybooks.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><main data-zf-section="1.1" data-ready="true"><article class="interactive-activity-container participation" data-zf-activity="fake" data-kind="animation" data-category="participation"><button data-control="start" onclick="document.body.dataset.clicked=1">Start</button></article></main>',
    }),
  );
  await page.goto('https://learn.zybooks.com/zybook/demo/chapter/1/section/1');
  const worker = context.serviceWorkers()[0]!;
  await expect
    .poll(() =>
      worker.evaluate(async () => !!(await chrome.storage.session.get('checkpoint')).checkpoint),
    )
    .toBe(true);
  panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('heading', { name: 'Section 1.1', exact: true })).toBeVisible();
  await panel.getByLabel('Pause when the connected tab is hidden').uncheck();
  await panel.getByRole('button', { name: 'Start run' }).click();
  await expect(panel.getByTestId('run-state')).toHaveText('needs attention');
  const state = await snapshot();
  expect(state.compatible).toBe(false);
  expect(state.items[0]?.state).toBe('unsupported');
  expect(await page.locator('body').getAttribute('data-clicked')).toBeNull();
});

test('production package recognizes live boundaries and runs through real extension events', async () => {
  const { liveActivity, liveBehavior } = await import('../fixtures/live');
  const body =
    '<!doctype html><main>' +
    liveActivity('1', 'animation') +
    liveActivity('2', 'single_choice') +
    liveActivity('3', 'single_choice', true) +
    liveActivity('4', 'animation', true) +
    liveActivity('5', 'single_choice', true) +
    '</main><script>' +
    liveBehavior +
    '</script>';
  await page.route('https://learn.zybooks.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body }),
  );
  await page.goto('https://learn.zybooks.com/zybook/demo/chapter/1/section/1');
  const worker = context.serviceWorkers()[0]!;
  await expect
    .poll(() =>
      worker.evaluate(async () => !!(await chrome.storage.session.get('checkpoint')).checkpoint),
    )
    .toBe(true);
  panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole('heading', { name: 'Section 1.1', exact: true })).toBeVisible();
  await panel.getByLabel('Pause when the connected tab is hidden').uncheck();
  await panel.getByRole('button', { name: 'Start run' }).click();
  await finished();
  const state = await snapshot();
  expect(state.compatible).toBe(true);
  expect(state.items).toHaveLength(5);
  expect(state.items.map((item) => item.state)).toEqual([
    'complete',
    'complete',
    'already_complete',
    'already_complete',
    'already_complete',
  ]);
  expect(
    await page.evaluate(() => (window as unknown as { liveActions: string[] }).liveActions),
  ).toEqual(['Start:false', 'Play:false', 'choice:0:false', 'choice:1:false']);
});

test('production package moves past exhausted choices and continues the activity queue', async () => {
  const { liveActivity } = await import('../fixtures/live');
  await page.route('https://learn.zybooks.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body:
        '<!doctype html>' +
        liveActivity('1', 'single_choice') +
        liveActivity('2', 'single_choice') +
        `<script>
      window.choiceClicks = [];
      document.querySelectorAll('input').forEach((input, index) => input.addEventListener('click', () => {
        window.choiceClicks.push(index);
        const root = input.closest('.interactive-activity-container');
        root.querySelector('.zb-explanation').textContent = 'Feedback for choice ' + index;
        if (index === 2) root.querySelector('.title-bar-chevron').setAttribute('aria-label', 'Activity completed');
      }));
    </script>`,
    }),
  );
  await page.goto('https://learn.zybooks.com/zybook/demo/chapter/1/section/1');
  await expect
    .poll(() =>
      context
        .serviceWorkers()[0]!
        .evaluate(async () => !!(await chrome.storage.session.get('checkpoint')).checkpoint),
    )
    .toBe(true);
  panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.getByLabel('Pause when the connected tab is hidden').uncheck();
  await panel.getByRole('button', { name: 'Start run' }).click();
  await finished();
  expect((await snapshot()).items.map((item) => item.state)).toEqual(['skipped', 'complete']);
  expect(
    await page.evaluate(() => (window as unknown as { choiceClicks: number[] }).choiceClicks),
  ).toEqual([0, 1, 2]);
  await expect(panel.getByTestId('current-action')).toHaveText('Finished with 1 skipped');
});
