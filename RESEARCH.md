# ZyBooks Auto: source audit and opportunity

Research date: September 13, 2026.

## Recommendation

Build a fresh Chrome extension with a persistent status panel, an activity-aware execution engine, and verified navigation. The original extension's problems are deeper than styling: it has no run lifecycle, relies on fixed delays, and confuses missing completion evidence with success. Fix that foundation before expanding question support.

Short-answer support is already present in the original package, but its implementation is fragile. Drag-and-drop is explicitly unsupported. The useful product opportunity is reliable execution with understandable feedback, plus tested support for specific activity families.

## Evidence and limits

I downloaded the actual public package for extension ID `bjkbhcempihbcacfghfmcmabfhehoiao` from Google's extension update endpoint and read its manifest, JavaScript, popup HTML/CSS, and README. I did not install it, sign into zyBooks, complete coursework, or test against a live book.

The [Chrome Web Store listing](https://chromewebstore.google.com/detail/zybooks-auto/bjkbhcempihbcacfghfmcmabfhehoiao?hl=en) showed version 1.0, updated March 14, 2023, offered by Prath, with 7,000 users and 4.3/5 from 19 ratings. These are a dated snapshot, not adoption or reliability measurements. The listing declares no collection or use of data; I found no application network calls in the inspected JavaScript.

Package provenance:

- [Google package download](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=131.0.0.0&acceptformat=crx2,crx3&x=id%3Dbjkbhcempihbcacfghfmcmabfhehoiao%26uc)
- Downloaded size: 12,331 bytes; CRX3 container; manifest version 3; extension version 1.0.
- SHA-256: `74dee9e412c59ffb24b242c329de1eedfde6b2013f2882d22d0941899619e6bb`.
- Files: `background.js`, `content.js`, `popup.js`, `popup.html`, `manifest.json`, `README.md`, icon and store metadata.
- Line references below refer to the files inside this exact package. The download endpoint can return a different version later. The hash identifies the inspected bytes; this audit did not independently validate the CRX signature.
- No license file or source-repository link was present in the inspected package. Use the observations as requirements for a fresh implementation; establish reuse rights separately if copying any code or assets.

Four checks executed the original `content.js` in Node with a mock DOM, Chrome messaging, and inert timers. All reproduced the stated defects. [Reproduction harness](research/check-original.mjs); [results](research/check-results.txt). Mock checks prove control flow under the supplied inputs; they do not prove the current website has a particular DOM.

## What the original actually does

| Component | Verified implementation | Practical implication |
| --- | --- | --- |
| Entry point | Popup presents five buttons and sends one-way messages directly to the active tab (`popup.js:8–35`). Content script matches `https://learn.zybooks.com/*`. | No acknowledgement, connection check, progress, completion summary, or visible error response. |
| Appearance | Five stacked dark buttons, 300px wide, with hover styling (`popup.html:6–42`). | There is hover feedback, but no application state or action confirmation. Focus outlines are removed without a replacement. |
| Run all | Launches animations, MCQ, and short answer immediately (`content.js:1–5`). | Independent routines run concurrently; no shared queue, cancellation, or ownership. |
| Animations | Clicks every 2x control and Start button; repeatedly clicks selected play buttons every 1.5 seconds (`content.js:33–52`). | Global selectors, a CSS-class heuristic, no per-animation verification, and no timer cleanup. Blind toggling may reverse an already enabled speed setting. |
| MCQ | Captures every `input[type=radio]` on the page and clicks them in sequence every 300ms (`content.js:55–63`). | Confirms the user's observation. No question grouping, correctness check, completed-item skip, or activity-type boundary. |
| Short answer | Double-clicks reveal buttons on the same 300ms schedule; later pairs all revealed answers and all answer boxes by index, copies `innerHTML` into `value`, dispatches `input`, and double-clicks all Check buttons (`content.js:66–91`). | Support exists, but global indexing, markup-as-answer, missing fields, and equal-delay scheduling can break it. Both reveal clicks happen near the same deadline; the second does not wait for the first to update the UI. |
| Completion | Deep positional DOM traversal; skips suspected draggables; compares `ariaLabel` to an exact completion string (`content.js:14–30`). | Structural changes can break detection. Crucially, an empty result set returns true. |
| Next section | Clicks the first `.nav-text.next`; auto mode checks every second and starts routines again one second later (`content.js:7–11,94–105`). | No verified destination, route lock, end boundary, loading check, or durable continuation. |
| Background | Uses `chrome.browserAction` despite MV3 (`background.js:1`). | API mismatch with MV3's `chrome.action`; likely background initialization failure. Popup-to-content messaging uses a separate path, so this alone does not prove all buttons are broken. See [Chrome action API](https://developer.chrome.com/docs/extensions/reference/api/action). |

The original does target specific controls rather than literally every clickable element. Its MCQ and several other routines nevertheless search the whole document, without restricting actions to individual participation activities.

## Findings ranked by impact

1. **False completion and premature navigation.** An empty page/status scan returns complete. Missing selectors, loading transitions, or an unrelated page can satisfy this condition. Reproduced with mocks.
2. **Duplicate runners and lingering timers.** Every run-all click creates two more intervals; automatic mode adds another. No corresponding cleanup exists. Reproduced with mocks. Repeated runs can accumulate work within a document; a full document unload destroys those timers instead, leaving auto mode without a saved continuation.
3. **No observable execution state.** There is no start acknowledgement, pause, stop, activity ledger, retry reason, or error surface. The absence of a status display is confirmed in the package.
4. **Short-answer mapping and timing bugs.** A mismatch in answer/field counts can dereference a missing box; HTML may be inserted as literal answer text; unrelated Check controls are included. These are source-based failure paths, not reproduced failures from the user's book.
5. **Drag-and-drop omitted from work and completion.** The README identifies it as unsupported; the status routine attempts to bypass draggable activities. A successor should report unsupported work explicitly instead of silently excluding it from a claim of completion.
6. **No robust activity boundaries.** Broad selectors can include controls outside participation activities. Unknown, challenge, and lab activities require explicit classification.
7. **No maintainability infrastructure.** The package contains no tests, typed contracts, diagnostics, compatibility matrix, or selector-version strategy. This says nothing about unpublished developer tooling.

## Other public approaches

There are alternatives beyond the linked store extension, but source availability is not evidence of current compatibility.

| Project | What I inspected | Useful idea | Limitation |
| --- | --- | --- | --- |
| [zacheri04/zybooks-solver](https://github.com/zacheri04/zybooks-solver) | [Public userscript source](https://raw.githubusercontent.com/zacheri04/zybooks-solver/main/zybooks-solver.js), version 1.0.2 header | Handles incorrect MCQ feedback and scopes short-answer lookup closer to each revealed answer. | Still uses delay-based orchestration; I did not verify it on current zyBooks. |
| [ZyBooks auto on Greasy Fork](https://greasyfork.org/en/scripts/488644-zybooks-auto) | [Source](https://greasyfork.org/en/scripts/488644-zybooks-auto/code), version 1.1.2 header; page links AdoreJc/ZyBooks_auto | Includes term-to-definition drag attempts with synthetic events, participation scoping, and completion checks. | Tailored to matching buckets, not general code ordering. Uses a custom data-transfer implementation and perpetual loops; no live validation performed. The project page says its maintainer lost zyBooks access. |

These projects are design references, not dependencies or proof that arbitrary drag interactions work. The Greasy Fork script declares MIT; check the exact upstream license and provenance before reusing anything.

## What zyBooks itself establishes

Participation activities and challenge activities are different product categories. Participation activities expose answers as part of the learning process, whereas challenges require correct answers without giving away the exact solution. That makes a participation-only initial scope technically concrete. [zyBooks activity definitions](https://support.zybooks.com/hc/en-us/articles/360007333794-About-zyBooks)

Completion must be detected from activity indicators, not from whether an answer field is currently filled. zyBooks explains that answers may disappear on revisiting a page while completion indicators remain. [Previous answers and completion](https://support.zybooks.com/hc/en-us/articles/13321789414171-Why-can-t-I-see-my-previous-answers-to-the-activities)

The UI can continue responding when connectivity is weak or lost; the upper-right completion indicator is zyBooks' documented signal that activity was recorded. The extension should expose the evidence it observed and avoid claiming independently verified server persistence. [Credit troubleshooting](https://support.zybooks.com/hc/en-us/articles/360007439994-Why-am-I-not-receiving-credit-for-my-work-Why-can-t-my-instructor-see-my-activity)

Activity count, question count, and assignment points are different measures. MCQ/short-answer sets score by questions; animations and drag activities count differently. LMS submission may also depend on entering through the assignment link. A runner's finished counter is therefore not an LMS grade. [Assignment credit and submission](https://support.zybooks.com/hc/en-us/articles/360007538033-What-are-assignments-how-do-I-get-credit-for-them-and-how-do-I-submit-them)

## Questions the implementation discovery phase must resolve

- Which current selectors, stable IDs, labels, and completion attributes exist in the user's books?
- Does “drag the blocks” mean term matching, code ordering, indentation, distractor selection, or several families?
- Do those widgets accept DOM-dispatched events, offer keyboard/click alternatives, use custom pointer handling, or live inside frames?
- Which short-answer families reveal a usable answer through ordinary UI, and which require user input or a reasoning provider?
- Does navigation use full reloads, History API routing, or both? Which visible links define the requested run boundary?
- Which UI state means loading has finished and completion has been recorded? Are indicators localized?

I did not find a documented public zyBooks developer API for these activity interactions in the sources reviewed. This is not proof that no private or partner API exists. The plan assumes the visible page DOM, existing login session, and ordinary UI interactions; it does not depend on private endpoints.
