import { EvidenceTimeoutError, waitFor } from '../core/wait';
import { fingerprint } from './fixture';
import type { Adapter, Context, Inspection, Plan, Ref } from './types';

/** Live boundaries and controls observed in Chrome on 2026-09-14. */
export const LIVE_BOUNDARY = '.interactive-activity-container.participation';
const activityStatus = '.activity-title-bar .title-bar-chevron[role="img"]';
const questionStatus = '.question-chevron[role="img"]';
const questionSelector = '.question-set-question.multiple-choice-question';
const radioSelector = '.question-choices[role="radiogroup"] input[type="radio"]';
const controls = '.animation-player .animation-controls';

export function participationRoots(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(LIVE_BOUNDARY)).filter(
    (element) => !element.parentElement?.closest(LIVE_BOUNDARY),
  );
}

function status(root: ParentNode, selector: string) {
  const markers = root.querySelectorAll(selector);
  return markers.length === 1 ? markers[0]!.getAttribute('aria-label') : null;
}
function enabled(element: HTMLElement | null | undefined): element is HTMLElement {
  return (
    !!element &&
    element.isConnected &&
    !element.closest('[hidden], [inert]') &&
    !element.hasAttribute('disabled') &&
    element.getAttribute('aria-disabled') !== 'true' &&
    getComputedStyle(element).display !== 'none' &&
    getComputedStyle(element).visibility !== 'hidden'
  );
}
function questions(root: ParentNode) {
  return Array.from(root.querySelectorAll<HTMLElement>(questionSelector));
}
function playerButton(root: ParentNode, label: string) {
  const matches = Array.from(root.querySelectorAll<HTMLButtonElement>(`${controls} button`)).filter(
    (button) => button.getAttribute('aria-label') === label,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
function speedInput(root: ParentNode) {
  const matches = Array.from(
    root.querySelectorAll<HTMLInputElement>(`${controls} input[type="checkbox"]`),
  ).filter((input) => {
    const id = input.getAttribute('aria-labelledby');
    const labels = Array.from(root.querySelectorAll('label')).filter((label) => label.id === id);
    return labels.length === 1 && labels[0]!.textContent?.trim() === '2x speed';
  });
  return matches.length === 1 ? matches[0] : undefined;
}
function animationState(root: ParentNode) {
  return {
    start: !!playerButton(root, 'Start'),
    play: !!playerButton(root, 'Play'),
    pause: !!playerButton(root, 'Pause'),
    step: root.querySelector(`${controls} button.step-highlight`)?.textContent?.trim(),
    speed: speedInput(root)?.checked,
  };
}
export function liveKind(root: HTMLElement): Ref['kind'] {
  if (
    !root.matches(`${LIVE_BOUNDARY}[content_resource_id]`) ||
    root.closest('.challenge, .assessment')
  )
    return 'unknown';
  if (!/^(Activity completed|Activity not completed)$/.test(status(root, activityStatus) ?? ''))
    return 'unknown';
  if (root.querySelectorAll('.animation-player').length === 1) {
    const state = animationState(root);
    if (Number(state.start) + Number(state.play) + Number(state.pause) === 1) return 'animation';
  }
  if (
    root.classList.contains('multiple-choice-content-resource') &&
    questions(root).length > 0 &&
    questions(root).every((question) => {
      const radios = Array.from(question.querySelectorAll<HTMLInputElement>(radioSelector));
      return (
        radios.length > 0 &&
        radios.length <= 12 &&
        radios[0]!.name !== '' &&
        radios.every((radio) => radio.name === radios[0]!.name) &&
        question.querySelectorAll('.question-choices[role="radiogroup"]').length === 1 &&
        question.querySelectorAll(`${questionStatus}`).length === 1
      );
    })
  )
    return 'single_choice';
  return 'unknown';
}
export function liveRoot(ref: Ref) {
  const matches = participationRoots().filter(
    (root) =>
      root.matches(LIVE_BOUNDARY) && `live-${root.getAttribute('content_resource_id')}` === ref.id,
  );
  if (matches.length !== 1 || liveKind(matches[0]!) !== ref.kind)
    throw new Error('The live activity boundary or controls changed. Rescan before continuing.');
  return matches[0]!;
}
function inspect(ref: Ref): Inspection {
  const root = liveRoot(ref);
  const complete = status(root, activityStatus) === 'Activity completed';
  const evidence = JSON.stringify({
    complete,
    player: ref.kind === 'animation' ? animationState(root) : undefined,
    questions:
      ref.kind === 'single_choice'
        ? questions(root).map((question) => [
            status(question, questionStatus),
            fingerprint(question.querySelector('.zb-explanation')?.outerHTML ?? ''),
          ])
        : undefined,
  });
  // DOM plus native form properties: checked is not necessarily reflected as an attribute.
  const signature = fingerprint(
    root.outerHTML +
      JSON.stringify(
        Array.from(root.querySelectorAll<HTMLInputElement>('input')).map((input) => input.checked),
      ),
  );
  return { ref, root, complete, evidence, signature };
}
function planFor(
  before: Inspection,
  target: string,
  description: string,
  operation: Plan['operation'] = 'click',
): Plan {
  return { ref: before.ref, signature: before.signature, operation, target, description };
}
function planAnimation(before: Inspection): Plan {
  const { root } = before;
  const speed = speedInput(root);
  if (enabled(speed) && !speed.checked && !playerButton(root, 'Pause'))
    return planFor(before, 'speed', 'Enable 2x animation playback');
  if (enabled(playerButton(root, 'Start')))
    return planFor(before, 'Start', 'Start animation and wait for the step to finish');
  if (enabled(playerButton(root, 'Play')))
    return planFor(before, 'Play', 'Play the next animation step and verify progress');
  if (playerButton(root, 'Pause'))
    return planFor(before, 'playback', 'Wait for the current animation step to finish', 'wait');
  throw new Error('Animation controls are not ready. Inspect the player before resuming.');
}

export function liveAdapter(kind: 'animation' | 'single_choice', timeout = 8000): Adapter {
  const attempts = new Map<string, Set<number>>();
  const completionWaitExpired = new Set<string>();
  function planChoice(before: Inspection): Plan {
    const all = questions(before.root);
    let incomplete = false;
    for (const [index, question] of all.entries()) {
      if (status(question, questionStatus) === 'Question completed') continue;
      incomplete = true;
      const options = Array.from(question.querySelectorAll<HTMLInputElement>(radioSelector));
      const key = `${before.ref.id}:${index}:${options[0]!.name}`;
      const tried = attempts.get(key) ?? new Set<number>();
      const choice = options.findIndex((input, i) => enabled(input) && !tried.has(i));
      if (choice >= 0)
        return planFor(before, `${index}:${choice}`, 'Try the next participation choice once');
      if (options.some((_, i) => !tried.has(i)))
        throw new Error('The remaining choices are disabled or unavailable.');
    }
    if (!incomplete && !completionWaitExpired.has(before.ref.id))
      return planFor(before, 'completion', 'Wait for the activity completion indicator', 'wait');
    return planFor(
      before,
      'exhausted',
      'Available choices tried once; completion not verified. Automatically skipped.',
      'skip',
    );
  }
  return {
    kind,
    detect: (root) => liveKind(root) === kind,
    inspect,
    plan: (before) =>
      before.complete ? null : kind === 'animation' ? planAnimation(before) : planChoice(before),
    execute: (plan, context) => {
      context.assertCurrent();
      context.signal.throwIfAborted();
      const before = inspect(plan.ref);
      if (before.signature !== plan.signature)
        throw new Error('The activity changed. The stale action was rejected.');
      if (plan.operation === 'wait' || plan.operation === 'skip') return;
      if (plan.operation !== 'click') throw new Error('Unsupported live action.');
      let target: HTMLElement | undefined;
      if (kind === 'animation') {
        target =
          plan.target === 'speed'
            ? speedInput(before.root)
            : playerButton(before.root, plan.target);
      } else {
        const [q, choice] = plan.target.split(':').map(Number);
        const question = questions(before.root)[q!];
        const options = question
          ? Array.from(question.querySelectorAll<HTMLInputElement>(radioSelector))
          : [];
        target = options[choice!];
        if (target && question && status(question, questionStatus) !== 'Question completed') {
          const key = `${plan.ref.id}:${q}:${options[0]!.name}`;
          const tried = attempts.get(key) ?? new Set<number>();
          if (tried.has(choice!)) throw new Error('This choice was already attempted.');
          tried.add(choice!);
          attempts.set(key, tried);
        } else throw new Error('The planned question is no longer available.');
      }
      if (!enabled(target)) throw new Error('The planned control is no longer available.');
      context.assertCurrent();
      target.click();
    },
    verify: (before, context: Context) =>
      waitFor(
        () => {
          context.assertCurrent();
          const after = inspect(before.ref);
          if (after.complete) return after;
          if (after.evidence === before.evidence) return undefined;
          // Pause appears immediately after Play. It is not evidence that the step finished.
          if (kind === 'animation' && playerButton(after.root, 'Pause')) return undefined;
          return after;
        },
        context.signal,
        kind === 'animation' ? Math.max(timeout, 120000) : timeout,
      ).catch((error) => {
        if (kind !== 'single_choice' || !(error instanceof EvidenceTimeoutError)) throw error;
        context.assertCurrent();
        completionWaitExpired.add(before.ref.id);
        return inspect(before.ref);
      }),
  };
}
