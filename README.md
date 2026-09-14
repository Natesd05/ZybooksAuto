# ZyFlow

A Chrome Manifest V3 extension with a persistent React side panel, one cancellable activity runner, verified page evidence, and explicit manual handoff.

**Status: 0.1.1 engineering preview with live animation and single-choice adapters.** Current zyBooks activity boundaries, completion indicators, animation playback controls, and radio feedback were inspected in Chrome on September 14, 2026. The production runner recognizes previously completed work and executes the supported controls. Short answers, matching, ordered blocks, and automatic live section navigation still require integration; unknown widgets stop for inspection. See [the compatibility matrix](docs/compatibility.md) for evidence and limits. No store publication has been performed.

## Setup

Use Node **24** and npm. Dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run check
npm run zip
```

Load the production build:

1. Open `chrome://extensions` in Chrome 116 or later.
2. Enable Developer mode, select **Load unpacked**, and choose `.output/chrome-mv3`.
3. Reload an existing `https://learn.zybooks.com/` tab.
4. Click ZyFlow’s toolbar icon to open the persistent side panel.
5. Use **Start run** to scan. Animations and single-choice activities use live adapters; unsupported activity boundaries become **needs attention**, with an explanation. **Inspect page** provides a read-only structural report for discovery.

Only Chrome for Testing 153 was exercised automatically. Chrome 116 is the API minimum, not a tested-browser claim. Installing this preview does not establish compatibility with a particular book.

For an existing installation, reload ZyFlow in `chrome://extensions`, reload the zyBooks tab, then Resume or start a new run. The panel should display **Preview 0.1.1**.

## Try the working fixture adapters

```sh
npm run build:test
node scripts/fixture-server.mjs
```

Load `.output/chrome-mv3-fixture` as a separate unpacked extension. Open <http://localhost:4173/zybook/demo/chapter/1/section/1>, then open **ZyFlow • Fixture Lab** from the toolbar. Start runs animations, bounded MCQ attempts, revealed short answers, HTML drag/drop matching, and ordered blocks with indentation and distractors. These are synthetic questions and an explicitly designed fixture contract, not captured textbook content.

Current section is the default scope. A range requires an explicit end section (for example `1.2`) and a maximum section count. Unsupported items stop the queue until explicitly skipped. Valid run settings are preserved when you reopen the panel. Invalid ranges show a specific correction before Start is available. Use **Go to connected tab** to return to a paused run. Closing the panel leaves the runner alive; Pause and Stop cancel future extension actions. Already dispatched page actions may still finish. Hidden tabs pause by default.

The localhost host permission exists **only** in the fixture manifest. Never distribute the fixture build as the production extension.

## Validation and packaging

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:extension
npm run build
npm run check:manifest
npm run zip
npm run package:release
```

`npm run check` runs type checking, lint, unit tests, production build, and permission validation. `test:extension` builds the fixture extension and launches Playwright’s bundled Chromium in fresh disposable persistent profiles. The suite invokes the extension’s own content script and adapters, including synthetic drag events; it does not substitute Playwright drag actions for adapter execution. The side-panel document is opened as an extension tab for automated UI tests. Native toolbar/side-panel opening still needs a manual Chrome smoke check.

The tests cover cancellation, repeated Start, stale messages/plans, bounded feedback, blank completed fields, mapped answers, rerenders, explicit skipping, full/SPA navigation, panel reconnects, and forced worker termination. See [release evidence and limits](docs/release.md) and the [student workflow review](docs/walkthrough.md).

`package:release` copies the checked production ZIP and a SHA-256 checksum into `release/`. Release ZIPs are local build artifacts. There is no deployment, cloud backend, or paid API.

## Project map

- `entrypoints/`: service worker, isolated content script, React side panel.
- `src/core/`: finite-state reducer, serial runner, cancellation and bounded observers.
- `src/adapters/`: common contract, fixture family planners, guarded execution and verification.
- `src/protocol/`: runtime-validated commands, identities, checkpoints and settings.
- `src/navigation/`: route/range validation and destination handoff.
- `src/storage/`: session checkpoints and local preferences.
- `src/diagnostics/`: allowlisted redacted export and structural inspection.
- `tests/fixtures/`: original synthetic activity implementation.
- `docs/`: [architecture](docs/architecture.md), [compatibility](docs/compatibility.md), [release](docs/release.md), [privacy](docs/privacy.md).

The original planning documents and source-audit research are preserved. No third-party extension code or assets were reused.
