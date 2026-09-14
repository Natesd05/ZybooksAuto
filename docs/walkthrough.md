# Student workflow review — September 13, 2026

The review followed the extension's visible controls in a fresh isolated Chromium profile: connect, choose settings, start, pause/return, correct input, recover from leaving the page, finish, rerun and export diagnostics. `npm ci` was also rerun successfully from the lockfile.

**Live-site limit:** attempting to inspect the existing Chrome session returned “Computer Use permissions are not granted.” No signed-in zyBooks section was inspected or completed. The browser walkthrough uses original synthetic activities and an intercepted synthetic production-origin page. It does not validate current zyBooks selectors. Native installation and toolbar/side-panel opening remain unverified; the panel document is exercised as an extension tab.

## Issues reproduced and repaired

| Student action                                                     | Reproduced problem                                                                         | Result after repair                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Choose a range without a valid end section or section limit        | Start remained enabled and invalid settings reached the protocol layer                     | Inline actionable validation; Start stays disabled until the input is valid; corrected input completes the bounded range                     |
| Close and reopen before running, or change filters after finishing | End section and maximum count were lost; completed-run settings overrode saved preferences | All valid settings persist; idle/stopped/finished panels restore the latest preferences                                                      |
| Leave zyBooks, then click Stop and connect elsewhere               | Stop was rejected because the original document was gone, stranding ownership              | Worker can stop a disconnected run, revoke late checkpoints, and allow connection to another section; disconnected status is explicit        |
| Start with the connected tab in the background                     | The panel asked the student to return manually without providing a direct control          | “Go to connected tab” activates the pinned tab; Resume then runs the selected work                                                           |
| Click Show on page for a production candidate needing manual work  | The visible button rejected the request                                                    | Read-only scrolling locates the exact candidate scanned earlier; detached nodes require a rescan and cannot silently map to another activity |
| Wait for missing feedback                                          | “Needs attention” was also counted as “Failed”                                             | The ledger separates attention from confirmed failure; explicit Skip finishes with an accurate skipped count                                 |

The first five new walkthrough tests failed before the fixes and passed after them. A second pass verified selected-family execution, safe reruns and diagnostic downloads, then exposed the attention/failure count issue. That issue received its own walkthrough regression.

## Repeated journeys

The seven tests in `tests/extension/student-flow.spec.ts` use panel buttons, inputs, checkboxes and downloads for user actions. They cover:

1. Correct malformed range settings, then finish at the requested section.
2. Reopen settings before a run and after changing preferences on a completed run.
3. Leave the allowed site, stop, connect to another section and finish there.
4. Return to the pinned tab from a paused run and resume.
5. Locate an unsupported production candidate without submitting anything.
6. Run selected activity families, rerun safely with already-complete counts, and download redacted diagnostics.
7. Observe missing feedback, see an attention count, explicitly skip, and finish without false completion.

The existing runner, adapter, navigation and lifecycle regressions remain part of the full suite. Release packaging checks compare ZIP contents with the production build and validate exact host permissions.

## Final verification

Fresh dependency installation, type checking, lint, 35 unit tests, production build and exact-permission checks passed. All 26 browser tests passed, including the seven student journeys. The final [range validation](screenshots/walkthrough-validation.png) and [attention state](screenshots/walkthrough-attention.png) were visually inspected at 390px width.

## Continue the live walkthrough

Enable Computer Use and provide a currently signed-in zyBooks section URL with representative participation activities. Inspect and document each real widget before enabling its production adapter. Any live compatibility claim must identify the actual family and variant tested; synthetic success alone does not establish it.
