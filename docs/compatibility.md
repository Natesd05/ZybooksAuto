# Compatibility and discovery evidence

Recorded **2026-09-13**. Build: **0.1.0 engineering preview**.

No current signed-in zyBooks activity DOM was available during implementation. Browser-surface inventory exposed no inspectable browser tabs, and the repository contains a historical source audit rather than captured live widgets. No account credentials were read, no textbook pages were copied into fixtures, and no live coursework was submitted. This is a concrete integration gap, not a passing live smoke check.

## Support matrix

| Family                              | Implemented fixture behavior                                                                                                                                               | Production live status       | Exact next evidence needed                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Animations                          | Observe player state; select available speed once; advance only when ready; verify completion                                                                              | Unverified; actions disabled | Current player boundary/ID, speed state, start/next readiness and completion marker, including multiple players                                           |
| Single-choice participation         | Scope one question; at most 12 distinct options and 100 total activity actions; await fresh feedback; stop on success                                                      | Unverified; actions disabled | Participation versus challenge classification; question/choice IDs; fresh incorrect/correct feedback and set completion                                   |
| Short answer                        | Question-local field IDs; input/textarea native setters and input/change events; visible reveal; alternate values kept separate; whitespace/entities preserved; one submit | Unverified; actions disabled | One current input, textarea/code, multi-field and alternate-answer example; reveal flow; event acceptance and stored completion marker                    |
| Term matching                       | Visible source/target mapping; stable IDs; actual extension-dispatched HTML drag/drop with DataTransfer; accepted placements                                               | Unverified; actions disabled | Real widget’s IDs, mapping/feedback, and whether it accepts click/keyboard/HTML drag/drop or requires trusted pointer input                               |
| Ordered blocks                      | Explicit visible arrangement; stable IDs despite duplicate text; individual placement/indentation; explicit distractors; final acceptance                                  | Unverified; actions disabled | Actual ordered-block control path, order/indent state, duplicate and distractor cases, visible solution/structured arrangement, accepted final completion |
| Unknown/challenges/labs/assessments | Explicit unsupported state and user-controlled Skip                                                                                                                        | Out of scope                 | A separately reviewed adapter and fixture for each additional family                                                                                      |
| Navigation                          | Visible next link; same book/origin; bounded end; persisted token; full reload and History API handoff; readiness check                                                    | Unverified; actions disabled | Current route identity, visible link, loading boundary, final-section state, login/manual navigation behavior and LMS query preservation                  |

Matching support requires a visible mapping in this preview. Feedback-driven discovery without a mapping remains a future variant. Ordered blocks require a visible structured solution and implemented click controls; no permutation brute force or universal reasoning is provided. `AnswerProvider` is a future data-only interface with no attached service.

## Selector provenance

**Every `data-zf-*` attribute and every `data-control`, `data-field`, `data-answer-for`, `data-source`, `data-target`, `data-block`, and related solution attribute is an ORIGINAL SYNTHETIC FIXTURE CONTRACT. None is claimed to exist on zyBooks.** The fixture registry is gated by the build mode; adding similar attributes on a production page does not enable it.

The read-only production inspector counts `.participation` elements as historical candidates based on the supplied source audit (`RESEARCH.md`, September 13, 2026). It does not infer family/completion from that class and does not click their descendants. Show on page can scroll to the exact candidate retained from the current scan; a detached candidate requires a rescan. Generic `input`, `textarea`, `iframe`, `[draggable="true"]`, `button`, and open-shadow-root counts are structural inventory, not activity support. Missing candidates produce needs attention and never completion.

`/zybook/:book/chapter/:chapter/section/:section` is used as a conservative route parser and fixture route shape; current book route compatibility was not observed. It is insufficient to authorize an action without a verified DOM adapter and loaded-section identity.

## Fixture evidence

The synthetic DOM is in `tests/fixtures/page.mjs` and interaction behavior in `tests/fixtures/site.js`. All fixture questions are original. Top-level frames and ordinary light DOM are used. The fixture marks fresh feedback with `data-revision` plus feedback/acceptance attributes and whole completion with `data-complete="true"`. Content text is hashed only for ephemeral action freshness, not persisted as an answer source.

The Chromium extension test asserts that matching receives `event.isTrusted === false`, proving the extension’s real dispatch path is used. This proves that **the synthetic widget** accepts that path. It does not prove acceptance by a real zyBooks drag widget. Ordered blocks use their own click-to-place/indent fixture controls and independent final verification.

## Procedure for promoting a live family

1. Read-only inspect a current representative activity with its completion and loading states. Record the date and a non-identifying context label.
2. Identify stable boundaries and IDs, frame/shadow boundaries, interaction mechanism, and fresh evidence.
3. Create an original sanitized fixture preserving behavior and structure without textbook text or account data.
4. Add a separate versioned live adapter. Keep fixture selectors separate.
5. Test the actual extension-origin events, cancellation, rerenders and missing evidence.
6. Perform a limited live Chrome smoke check and record precisely which variant passed before enabling that live adapter.

Do not lift the production gate on the strength of the synthetic tests alone.
