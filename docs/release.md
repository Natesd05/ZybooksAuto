# ZyFlow 0.1.7 — replace outdated runners on Connect

Release date: **2026-09-17**. Local unpacked build and ZIP; no store publication.

- Connect replaces a missing, outdated, or stale-heartbeat page runner with the current packaged script in the same document.
- An older saved checkpoint also triggers replacement, even when a current script answers the probe.
- The content-script lifecycle cancels the old runner and removes its listener. The replacement keeps the run identity, ledger, and uncertain-action checkpoint; active work remains paused for explicit Resume.
- Concurrent connection requests share one repair attempt. A healthy current runner is reused.
- Browser regressions cover both obsolete saved checkpoints and a genuinely older running script, including replacement while an action is pending.

Validation: 44 unit tests and all 36 browser tests passed. Type checking, lint, production build, manifest checks, and release packaging passed. The automatic upgrade still needs confirmation in the affected live installation.

## Historical 0.1.6 release notes

# ZyFlow 0.1.6 — continue after exhausted multiple-choice questions

Release date: **2026-09-16**. Local unpacked build and ZIP; no store publication.

- Live single-choice questions try each available option at most once per loaded runner, including initially selected options.
- Exhausted questions no longer pause the queue; subsequent questions in the same activity are attempted before moving to the next activity.
- A choice feedback timeout permits the next bounded attempt. Stop, Pause, and document changes still cancel further actions.
- Activities without verified completion are automatically marked skipped after their choices are exhausted. Verified counts remain based on completion indicators.
- All-completed question sets allow a bounded wait for the activity completion marker before being skipped if that marker never arrives.

Validation: 44 unit tests and 34 browser tests passed, including multiple exhausted questions, missing feedback, cancellation, and continuation to the next activity. Type checking, lint, production packaging, and manifest checks passed.

## Historical 0.1.5 release notes

# ZyFlow 0.1.5 — load a missing page runner on Connect

Release date: **2026-09-16**. Local unpacked build and ZIP; no store publication.

- When the page has no extension listener, Connect injects the packaged content script into that exact document and retries the handshake.
- Concurrent connection requests share the same recovery attempt. Existing listeners are queried without reinjection.
- Page handshakes finish publishing their checkpoint before returning the connection response.
- Adds `scripting` permission; production host access remains restricted to `https://learn.zybooks.com/*`.
- A production browser regression removes automatic content-script registration, verifies Connect restores an idle runner, and checks that repeated Connect neither replaces the run nor clicks page controls.

Validation: `npm run check` passed with 42 unit tests, type checking, lint, production build and manifest checks. All 33 browser tests passed, including recovery with no registered page script. Release ZIP and checksum were generated.

Live verification on the affected installation remains outstanding.

## Historical 0.1.4 release notes

# ZyFlow 0.1.4 — verify the connected page

Release date: **2026-09-16**. Local unpacked build and ZIP; no store publication.

- Connect contacts the pinned page even when a saved checkpoint exists; cached state alone no longer establishes a connection.
- Preserve saved runs for Stop and recovery when the page is unavailable, and display the connection error.
- Report outdated runners and missing heartbeats instead of claiming a successful connection.
- Add **Refresh connected page** to recover the affected tab directly. After loading, click Connect again.

Validation: 42 unit tests and 32 browser tests passed. The three connection/recovery browser tests also passed after the final heartbeat check. Type checking, lint, production packaging, and manifest checks passed.

The reported panel showed an older runner with no heartbeat despite claiming it was connected. Live recovery on the user's installation still requires verification.

## Historical 0.1.3 release notes

# ZyFlow 0.1.3 — connection recovery and error reporting

Release date: **2026-09-16**. Local unpacked build and ZIP; no store publication.

- Connect now replaces an abandoned tab selection when no checkpoint owns a run.
- Connection failures retain the actual error, including missing page scripts, rejected handshakes, and inaccessible tabs.
- Connect shows a pending state and times out with recovery instructions instead of waiting indefinitely.
- Content scripts reply with handshake failures instead of leaving the response channel unanswered.

Validation: TypeScript, ESLint, **42 unit tests**, **31 browser tests**, production build, and manifest checks passed. Browser regressions cover disabled Start on an inaccessible page and recovery from an abandoned tab selection.

This update does not establish the cause of the reported live connection failure; the affected browser and panel message are still needed to diagnose it.

## Historical 0.1.2 release notes

# ZyFlow 0.1.2 — activity boundaries and upgrade detection

Release date: **2026-09-15**. Local unpacked build and ZIP; no store publication.

- Count only outermost `.interactive-activity-container.participation` containers. Standalone participation badges are excluded.
- Show the package version in the panel and runner version in diagnostic exports.
- Detect older or unversioned page runners and require a tab refresh before Start, Resume, Retry, or Skip. Pause and Stop remain available.

For an existing installation, reload ZyFlow in `chrome://extensions`, then refresh the zyBooks tab and reconnect. Verify the panel says **Preview 0.1.2**.

Validation: `npm run check` passed, including **42 unit tests**. The **27 existing browser tests** passed, followed by **2 new upgrade regression tests** covering unversioned and 0.1.1 runners, blocked commands, and recovery after refresh. Live support remains limited to the previously inspected animation and single-choice widgets; this update has not been verified against unfinished live coursework.

## Historical 0.1.1 release notes

# ZyFlow 0.1.1 — live integration update

Release date: **2026-09-14**. Local unpacked build and ZIP; no store publication.

- Added separate live animation and single-choice adapters using controls inspected in Chrome.
- Fixed nested participation badges being counted as separate activities (the inspected section has five activities, not 16).
- Recognizes existing activity completion, waits for step readiness or fresh question feedback, and rejects stale actions.
- Keeps unsupported families and live range navigation stopped for inspection.
- Panel identifies the update as **Preview 0.1.1**.

Validation: `npm run check` passed (TypeScript, ESLint, **42 unit tests**, production build and manifest checks). `npm run test:extension` passed **27 browser tests**, including the production bundle running against original fixtures modeled on the inspected live markup. Start/Play and radio synthetic clicks were also accepted on already-completed live widgets during inspection. These observations do not constitute a full installed-extension run on unfinished coursework. The installed 0.1.0 reload could not be verified because Chrome kept changing windows/tabs during automation.

For an existing unpacked installation from this project, reload ZyFlow in `chrome://extensions`, reload the zyBooks tab, and Resume. If installed from an extracted ZIP elsewhere, replace it with this release or load `.output/chrome-mv3`. Verify the panel says **Preview 0.1.1**.

## Historical 0.1.0 release notes

# ZyFlow 0.1.0 — engineering preview

Release date: **2026-09-13**. Distribution: local ZIP and unpacked extension. Not submitted to a store.

This release supplies the extension architecture, side-panel UI, five executable synthetic-fixture adapters, navigation, tests and packaging. **It is not a live-compatible zyBooks release.** Current representative widgets were unavailable; live family adapters remain gated pending the exact discovery evidence in [compatibility.md](compatibility.md).

## Implemented

- Persistent React side panel with section connection, pinned tab, scope/type filters, Start/Pause/Resume/Stop, acknowledgement feedback, activity ledger, verified counts, useful-progress age, separate heartbeat, Retry/Skip and Show on page.
- Light/dark styling, keyboard focus indicators, status announcements, reduced-motion CSS, structural inspection and allowlisted diagnostics export.
- Typed finite-state reducer, one serial cancellable runner, activity-local plans, fresh evidence waits, stale plan/document rejection, bounded actions and persisted uncertain-action protection.
- Worker-brokered session checkpoints, preferences, ownership, badges, document identity and worker recovery.
- Animation, bounded single-choice, revealed short-answer, HTML drag/drop matching and separately modeled ordered-block fixture adapters.
- Bounded visible-link navigation with persisted destination/token, readiness checks, SPA/full reload support and explicit manual-navigation handling.
- Production host/permission guard, bundled icons/assets, source and locked dependencies, CI configuration, reproducible build/ZIP scripts.

## Validation evidence

Commands are reproducible from the README. Local validation environment: macOS arm64, Node **24.13.1**, npm **11.8.0**, Playwright **1.63.0**, bundled Chrome for Testing **153.0.8010.12**.

- TypeScript check and ESLint pass.
- Unit suite covers 35 cases: repeated Start; pause/stop cleanup; uncertain submissions across retry and reload; failed checkpoint persistence; empty scans; completed blank fields; question-local mapping, repeated field IDs, alternatives, whitespace/entities; hidden/ambiguous answers; stale/rerendered roots; duplicate control IDs; ordered IDs/indentation; protocol, reducer, navigation bounds and redaction; navigation-token revocation; scope preservation on an inactive Start; terminal-state reconnection and stale read-only candidate locations.
- Browser suite covers 26 cases: all five real extension adapter event paths; repeated Start and panel reopen; pause/stop/resume; empty/missing/unknown/offline activities; blank completion; rerenders; full/SPA handoff; final section; pinned ownership; forced worker termination; real hidden-tab policy; uncertain document reload; tab closure; login route; production refusal of synthetic selectors; seven student workflow regressions described in [the walkthrough report](walkthrough.md).
- Matching browser assertions include untrusted extension-dispatched `drop` events and accepted placements. No Playwright mouse drag substitutes for the adapter.
- Forced service-worker termination is tested using CDP, then the CDP session is detached. This is a recovery test, not a claim that long-duration natural suspension was observed.
- The panel document is tested as an extension page. Screenshots of the real rendered panel were inspected at 390px width in [light](screenshots/panel-light.png) and [dark](screenshots/panel-dark.png) themes. Native toolbar-to-side-panel opening is a separate manual smoke-check item.
- The hidden-tab case verifies the worker’s browser-authoritative inactive-tab gate. Playwright kept `document.hidden` false even in headed mode, so ZyFlow uses both tab activation state and document visibility; native visibility events still need a manual smoke check.
- Production manifest is checked for Manifest V3, the side-panel entry, minimum Chrome 116, exactly the intended three permissions and exact zyBooks host access, with no localhost matches.

## Known limits and next dependencies

1. **Live activity compatibility:** none is yet verified. Need current read-only examples for each variant and actual completion states. The production package reports unsupported/attention and cannot automate fixture selectors.
2. **Matching:** visible mapping plus accepted HTML drag/drop only in the fixture. Feedback-only matching, custom pointer widgets, trusted-event requirements, frames and shadow roots need separate discovery/prototypes.
3. **Ordered blocks:** visible structured solution and click controls only in the fixture. No universal solving, arbitrary permutation search, model dependency or UI for user-supplied arrangements.
4. **Navigation:** fixture coverage is passing; actual book routing, login redirects, LMS entry context and saving indicators still need live checks. Runs observe page evidence and never claim an independently verified LMS grade.
5. **Browser lifecycle:** forced worker recovery, document reload, hidden tabs and tab closure are covered. Natural long idle suspension, discard/freeze behavior, full browser restart, minimum-version Chrome and native toolbar side-panel interaction need manual smoke validation. Checkpoints rely on Chrome’s documented session-storage lifecycle; they do not enable automatic restart after a browser session ends.
6. **Accessibility:** semantic controls, focus styling, reduced motion and rendered themes were checked; screen-reader interaction and a formal accessibility audit have not been performed.

## Manual smoke checklist before enabling live integration

- Inspect and document a current example per family without copying account/textbook data into public artifacts.
- Verify extension-origin interactions, completion markers, rerenders and pause/stop during live waits.
- Close/reopen the native side panel, change tabs, navigate back, discard/freeze/reload and restart Chrome.
- Leave DevTools closed for natural worker suspension testing.
- Verify keyboard-only controls, screen-reader announcements and real panel sizing.
- Check final section, login redirection, offline/slow saving feedback and LMS-linked navigation context.

## Resolved dependency versions

| Component                  | Exact version    |
| -------------------------- | ---------------- |
| WXT / React module         | 0.21.4 / 1.2.2   |
| React / React DOM          | 19.3.0 / 19.3.0  |
| TypeScript                 | 6.0.3            |
| Zod                        | 4.6.4            |
| Vitest / jsdom             | 5.0.0 / 29.1.1   |
| Playwright Test            | 1.63.0           |
| ESLint / typescript-eslint | 10.10.0 / 8.70.0 |
| Prettier                   | 3.9.6            |

The complete dependency tree and integrity hashes are recorded in `package-lock.json`.
