import { describe, expect, it, vi } from 'vitest';
import { fixtureAdapter } from '../../src/adapters/fixture';
import type { Context } from '../../src/adapters/types';
const context = (): Context => ({
  generation: 1,
  signal: new AbortController().signal,
  assertCurrent: () => {},
});
const ref = { id: 'short', kind: 'short_answer' as const };
function short() {
  document.body.innerHTML = `<article data-zf-activity="short" data-kind="short_answer" data-category="participation"><div data-question="one"><textarea data-field="code"></textarea><input data-field="number"><pre data-answer-for="code">  a &lt; b;\n    next();</pre><span data-answer-for="number"><span data-alternative>7</span><span data-alternative>07</span></span><button data-role="submit" data-control="submit">Check</button></div></article>`;
  return fixtureAdapter('short_answer', 100);
}
describe('fixture adapters', () => {
  it('maps reversed multi-field answers by ID, preserves code and selects one alternative', () => {
    const adapter = short();
    const root = document.querySelector('article')!;
    root
      .querySelector('[data-answer-for="number"]')!
      .before(root.querySelector('[data-answer-for="code"]')!);
    const plan = adapter.plan(adapter.inspect(ref))!;
    const submit = vi.fn();
    root.querySelector('button')!.addEventListener('click', submit);
    const input = vi.fn();
    root.addEventListener('input', input);
    adapter.execute(plan, context());
    expect(root.querySelector('textarea')!.value).toBe('  a < b;\n    next();');
    expect(root.querySelector('input')!.value).toBe('7');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(input).toHaveBeenCalledTimes(2);
  });
  it('rejects a stale plan after rerender', () => {
    const adapter = short();
    const plan = adapter.plan(adapter.inspect(ref))!;
    document.querySelector('textarea')!.setAttribute('data-new', 'true');
    expect(() => adapter.execute(plan, context())).toThrow('stale');
  });
  it('reacquires roots when fresh feedback rerenders the activity', async () => {
    const adapter = short();
    const before = adapter.inspect(ref);
    const result = adapter.verify(before, context());
    document.querySelector('article')!.outerHTML =
      '<article data-zf-activity="short" data-complete="true"></article>';
    expect((await result).complete).toBe(true);
  });
  it('rejects cancellation immediately before mutation', () => {
    const adapter = short();
    const plan = adapter.plan(adapter.inspect(ref))!;
    const ctx = context();
    const controller = new AbortController();
    controller.abort();
    expect(() => adapter.execute(plan, { ...ctx, signal: controller.signal })).toThrow();
    expect(document.querySelector('textarea')!.value).toBe('');
  });
  it('fails clearly on missing answer fields, hidden answers, and duplicate mappings', () => {
    let adapter = short();
    document.querySelector('textarea')!.remove();
    document.querySelector('input')!.remove();
    expect(() => adapter.plan(adapter.inspect(ref))).toThrow('field');
    adapter = short();
    document.querySelector<HTMLElement>('[data-answer-for="code"]')!.hidden = true;
    expect(() => adapter.plan(adapter.inspect(ref))).toThrow('visible');
    adapter = short();
    document.querySelector('input')!.setAttribute('data-field', 'code');
    expect(() => adapter.plan(adapter.inspect(ref))).toThrow('duplicated');
  });
  it('never copies raw HTML as an answer', () => {
    const adapter = short();
    document.querySelector('[data-answer-for="code"]')!.innerHTML = '<b>plain &amp; decoded</b>';
    const plan = adapter.plan(adapter.inspect(ref))!;
    expect(plan.values?.code).toBe('plain & decoded');
  });
  it('rejects a previous unverified short-answer submission', () => {
    const adapter = short();
    document.querySelector<HTMLElement>('[data-question]')!.dataset.submitted = 'true';
    expect(() => adapter.plan(adapter.inspect(ref))).toThrow('previous submission');
  });
  it('models duplicate-text code blocks by distinct IDs and explicit indentation', () => {
    document.body.innerHTML =
      '<article data-zf-activity="order"><div data-solution><span data-order-id="a" data-indent="1"></span><span data-order-id="b" data-indent="0"></span></div><div data-block="a" data-position="0" data-indent="0">same</div><div data-block="b" data-position="1" data-indent="0">same</div><button data-control="indent:a">Indent</button></article>';
    const adapter = fixtureAdapter('ordered_blocks');
    const before = adapter.inspect({ id: 'order', kind: 'ordered_blocks' });
    expect(adapter.plan(before)?.target).toBe('indent:a');
    document.querySelector<HTMLElement>('[data-order-id="b"]')!.dataset.orderId = 'a';
    expect(() => adapter.plan(adapter.inspect(before.ref))).toThrow('duplicate');
  });
  it('does not treat arbitrary attribute churn as correctness feedback', async () => {
    const adapter = short();
    const before = adapter.inspect(ref);
    const verify = adapter.verify(before, context());
    document.querySelector('article')!.setAttribute('data-hover', 'true');
    await expect(verify).rejects.toThrow('No fresh');
  });
});

it('scopes repeated field IDs to the question owning the submit control', () => {
  const adapter = short();
  const root = document.querySelector('article')!;
  const completed = document.createElement('div');
  completed.dataset.question = 'previous';
  completed.dataset.complete = 'true';
  completed.innerHTML =
    '<textarea data-field="code">keep me</textarea><input data-field="number" value="keep me">';
  root.prepend(completed);
  adapter.execute(adapter.plan(adapter.inspect(ref))!, context());
  expect(completed.querySelector('textarea')!.value).toBe('keep me');
  expect(root.querySelectorAll('textarea')[1]!.value).toBe('  a < b;\n    next();');
});

it('rejects ambiguous revealed answers and duplicated controls', () => {
  let adapter = short();
  const answer = document.querySelector('[data-answer-for="code"]')!;
  answer.after(answer.cloneNode(true));
  expect(() => adapter.plan(adapter.inspect(ref))).toThrow('unique');
  adapter = short();
  const control = document.querySelector('button')!;
  control.after(control.cloneNode(true));
  expect(() => adapter.inspect(ref)).toThrow('duplicated');
});
