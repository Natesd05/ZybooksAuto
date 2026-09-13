# Build prompt

Paste the following into your coding agent while this project folder is open. Keep `RESEARCH.md` and `PLAN.md` available as context.

---

Build a reliable replacement for the Chrome extension ZyBooks Auto. The working product name is ZyFlow. This is a Chrome extension, not a standalone website. Read `RESEARCH.md` and `PLAN.md` first, inspect the repository and any applicable instructions, then implement the plan in working increments.

The existing extension has no execution feedback, no pause/stop control, fragile short-answer handling, no drag-and-drop support, and unreliable next-section navigation. The source audit confirms it clicks every radio input, accumulates timers, and reports an empty completion scan as successful. Do not carry those behaviors into the new architecture.

The deliverable is a packaged extension with a polished persistent side panel, reliable automation for explicitly supported participation activity families, transparent progress, and verified navigation. Implement the requested capabilities rather than stopping at a visual prototype. Distinguish mock-tested functionality from live-validated compatibility.

## Stack and constraints

Use TypeScript, WXT with React, native CSS/modules, Zod, Vitest/jsdom, and Playwright Test with bundled Chromium. Use Node 24 LTS and npm with a committed lockfile, resolving mutually compatible dependency versions at setup. Use Manifest V3, `chrome.sidePanel`, `chrome.runtime`, scoped tab messaging, `chrome.storage`, `chrome.action`, and `chrome.webNavigation`.

Begin with permissions `sidePanel`, `storage`, and `webNavigation`, exact host access for `https://learn.zybooks.com/*`, and a static content script for that host. Set Chrome 116 as the minimum if using `sidePanel.open()`. Do not add broad host access or permissions without an implemented need. Bundle executable code and assets locally.

No paid API or backend is required for the initial implementation. Keep an `AnswerProvider` interface available for future reasoning support, but do not add a model dependency just to perform DOM interactions. Do not build around private zyBooks endpoints or store user credentials. Use visible page content and the user's existing session.

## Discovery before integration claims

Inspect representative current examples of animations, multiple choice, short answers, term matching, and ordered code blocks when accessible. Identify their activity boundaries, IDs, controls, completion indicators, loading behavior, and routing. Determine whether blocks use keyboard/click alternatives, HTML drag/drop, pointer events, frames, or another mechanism.

Document observed selectors and behavior in `docs/compatibility.md`, with dates and evidence. Build sanitized fixtures and synthetic questions; keep account data and textbook content out of public test artifacts. If live examples are unavailable, implement the core, UI, and fixture-driven adapters, clearly mark live integration unverified, and list the exact examples still needed. Never invent current site selectors or claim live validation from mocks.

## Architecture

The content script owns DOM observation and a single serial activity runner for its document. The service worker owns routing, tab ownership, checkpoints, navigation handoff, and badges. The side panel renders snapshots and sends commands; closing it must not destroy the runner.

Implement a typed finite-state reducer with idle, scanning, running, waiting, paused, navigating, needs-attention, stopped, error, and finished states. Give activities separate queued/already-complete/running/waiting/complete/skipped/unsupported/failed states. Finished runs can contain skipped work and must say so.

Use runtime-validated messages with protocol version, request ID, run ID, tab/document identity, and event sequence. Make Start idempotent. Reject stale messages and action plans. Handle worker restarts and panel reconnects without duplicate runners. Broker session storage through the worker. Keep preferences in local storage and active checkpoints in session storage; after browser restart, rescan and require a new Start.

Every action must observe, validate, act once, wait for fresh evidence, and checkpoint. Use activity-local selectors, stable IDs, bounded condition waits, `MutationObserver`, `AbortController`, and generation checks before mutations. Pause/Stop must cancel pending work and clean up observers/timers. Do not replay an uncertain submission before inspecting its result. Missing evidence and empty scans must never count as successful completion.

## UI

Create a polished side panel with connected book/section, run scope, activity-type filters, Start/Pause/Resume/Stop, current action, last progress time, verified counts, an activity ledger, error explanations, Retry/Skip, and Show on page. Give every click immediate visual feedback and distinguish “request sent” from “runner started.”

Expose heartbeat separately from useful progress. Display completed-this-run, already-complete, queued, unsupported, skipped, and failed counts without claiming they equal an LMS grade. Provide keyboard access, visible focus, accessible status announcements, reduced motion, and light/dark styling. Keep diagnostics expandable. Export bounded redacted diagnostics without question text, answers, or credentials by default.

## Activity adapters

Define a registry and a common detect/inspect/plan/execute/verify contract.

- Animations: handle each player's observed state, available speed option, and next-step readiness; verify its completion marker.
- MCQ: classify participation questions, scope to one question, wait for fresh correctness feedback, and stop on success. Bound attempts and do not click unrelated controls.
- Short answers: map revealed answers to their own fields; support input and textarea variants through validated event paths. Preserve code whitespace, handle multiple fields and alternate answers explicitly, and never copy raw HTML or pair global arrays by index. Submit once and verify the outcome.
- Matching: map stable source and target IDs, use visible solution information or bounded feedback-driven matching, and verify each accepted placement. Prototype the actual extension event path; Playwright mouse actions alone are not proof of compatibility.
- Ordered blocks: separately represent order, indentation, duplicate text with unique IDs, and distractors. Use a visible revealed arrangement or supplied structured solution where available. Validate the arrangement and actual UI acceptance. Do not brute-force arbitrary permutations or advertise universal support.
- Unknown widgets, challenges, labs, assessments, and unimplemented families: identify them and show an explicit unsupported/out-of-scope state.

If an interaction cannot be implemented reliably with the available widget behavior, preserve the manual handoff and explain the exact limitation. Do not silently remove requested block support from the roadmap.

## Navigation

Default to the current section, with a user-selected bounded range for automatic continuation. Before navigating, settle the selected activity queue, resolve skips, validate the visible next-section link, and persist an expected destination token. Cancel the old generation and click once.

Handle both History API routes and full reloads. Confirm the expected book/section identity and new DOM readiness before resuming. Match handoff tokens on reconnect, prevent repeated visits, enforce the end boundary, and pause on login redirects or manual navigation. An empty selector result must not trigger Next. Preserve existing LMS context and avoid claiming independently verified grade submission.

## Delivery and validation

Follow the phases in `PLAN.md`: discovery, foundation/UI, core adapters, navigation, blocks, release hardening. Keep the project runnable after each phase. Write meaningful regression tests for duplicate Start, cancellation, stale messages, missing selectors, delayed feedback, rerenders, blank-but-completed questions, answer-field mapping, and navigation handoff.

Test the built extension in a persistent Chromium profile using dedicated fixtures. Exercise the extension's actual adapter event path, worker restart, panel close/reopen, tab changes, final section, offline feedback, and unsupported activities. Ensure localhost test matches never enter the production manifest. Perform live Chrome smoke checks when examples are available and record their limits.

Deliver source, build scripts, tests, README setup/load-unpacked instructions, architecture notes, a dated compatibility matrix, known limitations, and a release ZIP. Run the relevant type checks, lint, tests, and production build. Report what works, what was tested, what remains unverified, and the exact next dependency for any incomplete family. Do not publish to the store as part of the local implementation task.
