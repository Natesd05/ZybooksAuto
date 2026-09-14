import type { ActivityKind } from '../protocol/schema';
import type { Adapter, Context, Inspection, Plan, Ref } from './types';
import { waitFor } from '../core/wait';
const byId = (root: ParentNode, attribute: string, id: string) =>
  Array.from(root.querySelectorAll<HTMLElement>(`[${attribute}]`)).find(
    (el) => el.getAttribute(attribute) === id,
  );
export function fingerprint(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function rootFor(ref: Ref) {
  const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-zf-activity]')).filter(
    (el) => el.dataset.zfActivity === ref.id,
  );
  if (roots.length !== 1) throw new Error('The activity boundary is missing or ambiguous.');
  return roots[0]!;
}
function enabled(el: HTMLElement | undefined | null): el is HTMLElement {
  return (
    !!el &&
    !el.hidden &&
    !el.closest('[hidden]') &&
    !el.hasAttribute('disabled') &&
    el.getAttribute('aria-disabled') !== 'true'
  );
}
function inspect(ref: Ref): Inspection {
  const root = rootFor(ref);
  const controls = Array.from(root.querySelectorAll<HTMLElement>('[data-control]')).map(
    (el) => el.dataset.control,
  );
  if (new Set(controls).size !== controls.length)
    throw new Error('Activity control IDs are duplicated.');
  return {
    ref,
    root,
    signature: fingerprint(root.outerHTML),
    evidence: JSON.stringify([
      root.dataset.revision,
      root.dataset.complete,
      ...Array.from(root.querySelectorAll('[data-feedback], [data-accepted]')).map((el) => [
        el.getAttribute('data-feedback'),
        el.getAttribute('data-accepted'),
      ]),
    ]),
    complete: root.dataset.complete === 'true',
  };
}
function click(before: Inspection, target: string, description: string): Plan {
  if (!enabled(byId(before.root, 'data-control', target)))
    throw new Error('The required control is missing or not ready.');
  return { ref: before.ref, signature: before.signature, operation: 'click', target, description };
}
function planAnimation(before: Inspection): Plan {
  const { root } = before;
  const speed = byId(root, 'data-control', 'speed');
  if (enabled(speed) && speed.getAttribute('aria-pressed') === 'false')
    return click(before, 'speed', 'Enable available playback speed');
  if (root.dataset.player === 'ready') return click(before, 'start', 'Start animation');
  if (root.dataset.player === 'next') return click(before, 'next', 'Advance animation step');
  throw new Error('Animation state is not ready or recognized.');
}
function planChoice(before: Inspection): Plan {
  const question = Array.from(before.root.querySelectorAll<HTMLElement>('[data-question]')).find(
    (el) => el.dataset.complete !== 'true',
  );
  if (!question || question.dataset.questionType !== 'single')
    throw new Error('Only single-choice participation questions are supported.');
  const options = Array.from(question.querySelectorAll<HTMLElement>('[data-control][data-choice]'));
  if (options.length > 12 || !options.length)
    throw new Error('Choice count is missing or exceeds the attempt limit.');
  const option = options.find((el) => enabled(el) && el.dataset.tried !== 'true');
  if (!option) throw new Error('Every permitted choice was tried without verified completion.');
  return click(before, option.dataset.control!, 'Submit one choice and await feedback');
}
function planShort(before: Inspection): Plan {
  const question = Array.from(before.root.querySelectorAll<HTMLElement>('[data-question]')).find(
    (el) => el.dataset.complete !== 'true',
  );
  if (!question) throw new Error('Question completion evidence is missing.');
  const reveal = question.querySelector<HTMLElement>('[data-role="reveal"]');
  if (reveal?.getAttribute('aria-expanded') === 'false')
    return click(before, reveal.dataset.control!, 'Reveal answers for this question');
  const fields = Array.from(
    question.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-field]'),
  );
  if (!fields.length) throw new Error('Answer field not found.');
  const values: Record<string, string> = {};
  for (const field of fields) {
    const id = field.dataset.field!;
    if (!id || Object.hasOwn(values, id))
      throw new Error('Answer field IDs are missing or duplicated.');
    const answers = Array.from(question.querySelectorAll<HTMLElement>('[data-answer-for]')).filter(
      (el) => el.dataset.answerFor === id && enabled(el),
    );
    if (answers.length !== 1)
      throw new Error('A unique visible revealed answer is required for each field.');
    const answer = answers[0]!;
    // Alternatives are separate values; choose the explicitly first visible variant. textContent preserves code whitespace and decodes entities.
    values[id] =
      (answer.querySelector<HTMLElement>('[data-alternative]') ?? answer).textContent ?? '';
  }
  const submit = question.querySelector<HTMLElement>('[data-role="submit"]');
  if (!enabled(submit)) throw new Error('The question submit control is missing.');
  if (question.dataset.submitted === 'true')
    throw new Error('A previous submission has no verified success. Inspect it before retrying.');
  return {
    ref: before.ref,
    signature: before.signature,
    operation: 'fill',
    target: submit.dataset.control!,
    values,
    description: 'Fill mapped fields and submit this question once',
  };
}
function planMatching(before: Inspection): Plan {
  const sources = Array.from(before.root.querySelectorAll<HTMLElement>('[data-source]'));
  const targets = Array.from(before.root.querySelectorAll<HTMLElement>('[data-target]'));
  if (
    new Set(sources.map((el) => el.dataset.source)).size !== sources.length ||
    new Set(targets.map((el) => el.dataset.target)).size !== targets.length
  )
    throw new Error('Matching source or target IDs are duplicated.');
  const source = sources.find((el) => el.dataset.accepted !== 'true');
  if (!source) throw new Error('Whole-activity completion evidence is missing.');
  const mapping = Array.from(before.root.querySelectorAll<HTMLElement>('[data-map-source]')).find(
    (el) => el.dataset.mapSource === source.dataset.source && enabled(el),
  );
  if (!mapping?.dataset.mapTarget)
    throw new Error(
      'A visible source-to-target solution is required. Manual matching is available.',
    );
  const target = byId(before.root, 'data-target', mapping.dataset.mapTarget);
  if (!enabled(target)) throw new Error('The mapped target is missing.');
  if (before.root.dataset.interaction !== 'html-dnd')
    throw new Error('This matching event mechanism is unsupported.');
  return {
    ref: before.ref,
    signature: before.signature,
    operation: 'drop',
    source: source.dataset.source!,
    target: mapping.dataset.mapTarget,
    description: 'Place one mapped term and verify acceptance',
  };
}
function planOrder(before: Inspection): Plan {
  const solution = before.root.querySelector<HTMLElement>('[data-solution]');
  if (!enabled(solution))
    throw new Error(
      'A visible structured arrangement is required. Universal block solving is unavailable.',
    );
  const blocks = Array.from(before.root.querySelectorAll<HTMLElement>('[data-block]'));
  const steps = Array.from(solution.querySelectorAll<HTMLElement>('[data-order-id]'));
  const ids = steps.map((el) => el.dataset.orderId!);
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    new Set(blocks.map((el) => el.dataset.block)).size !== blocks.length ||
    ids.some((id) => !blocks.some((el) => el.dataset.block === id))
  )
    throw new Error('The block arrangement contains missing or duplicate IDs.');
  if (blocks.some((el) => !ids.includes(el.dataset.block!) && el.dataset.distractor !== 'true'))
    throw new Error('An omitted block is not an explicit distractor.');
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!;
    const block = blocks.find((el) => el.dataset.block === step.dataset.orderId)!;
    const indent = Number(step.dataset.indent);
    if (!Number.isInteger(indent) || indent < 0 || indent > 8)
      throw new Error('Invalid block indentation.');
    if (block.dataset.position !== String(index))
      return click(before, `place:${step.dataset.orderId}:${index}`, 'Place a block by stable ID');
    const actual = Number(block.dataset.indent);
    if (!Number.isInteger(actual)) throw new Error('Block indentation state is missing.');
    if (actual !== indent)
      return click(
        before,
        `${actual < indent ? 'indent' : 'outdent'}:${step.dataset.orderId}`,
        'Adjust block indentation',
      );
  }
  if (before.root.dataset.submitted === 'true')
    throw new Error('The previous block arrangement was not accepted. Inspect it manually.');
  return click(before, 'check-order', 'Verify the arranged blocks');
}
function execute(plan: Plan, context: Context) {
  context.assertCurrent();
  context.signal.throwIfAborted();
  const current = inspect(plan.ref);
  if (current.signature !== plan.signature)
    throw new Error('The activity changed. The stale action was rejected.');
  const root = current.root;
  const assert = () => {
    context.assertCurrent();
    context.signal.throwIfAborted();
    if (!root.isConnected || rootFor(plan.ref) !== root)
      throw new Error('Activity rerendered before the action.');
  };
  if (plan.operation === 'drop') {
    const source = byId(root, 'data-source', plan.source!);
    const target = byId(root, 'data-target', plan.target);
    if (!enabled(source) || !enabled(target) || typeof DataTransfer === 'undefined')
      throw new Error('HTML drag/drop is unavailable for this widget.');
    const transfer = new DataTransfer();
    transfer.setData('text/plain', plan.source!);
    for (const [element, type] of [
      [source, 'dragstart'],
      [target, 'dragenter'],
      [target, 'dragover'],
      [target, 'drop'],
      [source, 'dragend'],
    ] as const) {
      assert();
      element.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
    }
    return;
  }
  if (plan.operation === 'fill') {
    for (const [id, value] of Object.entries(plan.values ?? {})) {
      assert();
      const question = byId(root, 'data-control', plan.target)?.closest('[data-question]');
      const field = question ? byId(question, 'data-field', id) : undefined;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement))
        throw new Error('Mapped answer field was replaced.');
      const prototype =
        field instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
      assert();
      field.dispatchEvent(new Event('input', { bubbles: true }));
      assert();
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  assert();
  const control = byId(root, 'data-control', plan.target);
  if (!enabled(control)) throw new Error('The planned control is no longer available.');
  control.click();
}
export function fixtureAdapter(kind: Exclude<ActivityKind, 'unknown'>, timeout = 8000): Adapter {
  const planners = {
    animation: planAnimation,
    single_choice: planChoice,
    short_answer: planShort,
    matching: planMatching,
    ordered_blocks: planOrder,
  };
  return {
    kind,
    detect: (root) => root.dataset.kind === kind && root.dataset.category === 'participation',
    inspect,
    plan: (before) => (before.complete ? null : planners[kind](before)),
    execute,
    verify: (before, context) =>
      waitFor(
        () => {
          context.assertCurrent();
          const after = inspect(before.ref);
          return after.complete || after.evidence !== before.evidence ? after : undefined;
        },
        context.signal,
        timeout,
      ),
  };
}
