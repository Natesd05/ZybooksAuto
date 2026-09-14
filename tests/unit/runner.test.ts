import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Runner } from '../../src/core/runner';
import { Registry } from '../../src/adapters/registry';
import { defaults, envelope, type Command, type Snapshot } from '../../src/protocol/schema';
const runners: Runner[] = [];
const identity = {
  tabId: 1,
  documentId: 'doc1',
  route: 'http://localhost:4173/zybook/demo/chapter/1/section/1',
};
const question = `<article data-zf-activity="q" data-kind="single_choice" data-category="participation" data-revision="0"><div data-question="one" data-question-type="single"><button data-control="a" data-choice="a">Wrong</button><button data-control="b" data-choice="b">Correct</button><button data-control="c" data-choice="c">Untouched</button><output data-feedback="none"></output></div></article>`;
function create(html = question, timeout = 100) {
  document.body.innerHTML = `<main data-zf-section="1.1" data-ready="true">${html}</main>`;
  const saved: Snapshot[] = [];
  const runner = new Runner(identity, new Registry(true, timeout), async (snapshot) => {
    saved.push(snapshot);
  });
  runners.push(runner);
  return { runner, saved };
}
function cmd(runner: Runner, command: Command['command'], itemId?: string) {
  return runner.command({
    ...envelope(),
    type: 'command',
    command,
    runId: runner.snapshot.runId,
    identity,
    settings: { ...defaults, pauseHidden: false },
    itemId,
  });
}
function answer(delay = 0) {
  const clicks: string[] = [];
  document.querySelectorAll<HTMLElement>('[data-choice]').forEach((button) =>
    button.addEventListener('click', () => {
      clicks.push(button.dataset.control!);
      button.dataset.tried = 'true';
      setTimeout(() => {
        const root = document.querySelector<HTMLElement>('[data-zf-activity]')!;
        root.dataset.revision = String(Number(root.dataset.revision) + 1);
        if (button.dataset.control === 'b') {
          root.dataset.complete = 'true';
        }
      }, delay);
    }),
  );
  return clicks;
}
const terminal = (runner: Runner) =>
  vi.waitFor(() =>
    expect(['finished', 'needs_attention', 'error']).toContain(runner.snapshot.state),
  );
beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  runners.splice(0).forEach((runner) => runner.dispose());
  document.body.innerHTML = '';
});
describe('serial cancellable runner', () => {
  it('deduplicates simultaneous Start and stops choosing immediately after success', async () => {
    const { runner } = create();
    const clicks = answer(10);
    await Promise.all([cmd(runner, 'start'), cmd(runner, 'start')]);
    await terminal(runner);
    expect(clicks).toEqual(['a', 'b']);
    expect(runner.snapshot.state).toBe('finished');
    expect(runner.snapshot.items[0]?.state).toBe('complete');
  });
  it('pause cancels the wait; resume reconciles the dispatched action without repeating it', async () => {
    const { runner } = create();
    const clicks = answer(45);
    await cmd(runner, 'start');
    await vi.waitFor(() => expect(runner.snapshot.state).toBe('waiting'), { interval: 1 });
    await cmd(runner, 'pause');
    await new Promise((resolve) => setTimeout(resolve, 65));
    expect(clicks).toEqual(['a']);
    expect(runner.snapshot.state).toBe('paused');
    await cmd(runner, 'resume');
    await terminal(runner);
    expect(clicks).toEqual(['a', 'b']);
    expect(runner.snapshot.state).toBe('finished');
  });
  it('Stop prevents later mutations even when page feedback arrives afterward', async () => {
    const { runner } = create();
    const clicks = answer(50);
    await cmd(runner, 'start');
    await vi.waitFor(() => expect(runner.snapshot.state).toBe('waiting'), { interval: 1 });
    await cmd(runner, 'stop');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(clicks).toEqual(['a']);
    expect(runner.snapshot.state).toBe('stopped');
  });
  it('never calls an empty scan complete', async () => {
    const { runner } = create('');
    await cmd(runner, 'start');
    await terminal(runner);
    expect(runner.snapshot.state).toBe('needs_attention');
    expect(runner.snapshot.action).toContain('empty scan');
  });
  it('times out missing fresh feedback and refuses to repeat an uncertain action on Retry', async () => {
    const { runner } = create(question, 35);
    const click = vi.fn();
    document.querySelector('button')!.addEventListener('click', click);
    await cmd(runner, 'start');
    await terminal(runner);
    expect(click).toHaveBeenCalledTimes(1);
    await cmd(runner, 'retry', 'q');
    await terminal(runner);
    expect(click).toHaveBeenCalledTimes(1);
    expect(runner.snapshot.state).toBe('needs_attention');
  });
  it('counts completion markers with blank fields as already complete', async () => {
    const { runner } = create(
      '<article data-zf-activity="q" data-kind="short_answer" data-category="participation" data-complete="true"><textarea></textarea></article>',
    );
    await cmd(runner, 'start');
    await terminal(runner);
    expect(runner.snapshot.items[0]?.state).toBe('already_complete');
    expect(runner.snapshot.items[0]?.actions).toBe(0);
  });
  it('identifies challenges as unsupported and records explicit skipping', async () => {
    const { runner } = create(question.replace('participation', 'challenge'));
    const click = vi.fn();
    document.querySelector('button')!.addEventListener('click', click);
    await cmd(runner, 'start');
    await terminal(runner);
    expect(runner.snapshot.items[0]?.state).toBe('unsupported');
    await cmd(runner, 'skip', 'q');
    await terminal(runner);
    expect(runner.snapshot.state).toBe('finished');
    expect(runner.snapshot.action).toContain('1 skipped');
    expect(click).not.toHaveBeenCalled();
  });
  it('rejects stale document and run commands', async () => {
    const { runner } = create();
    await expect(
      runner.command({ ...envelope(), type: 'command', command: 'start', runId: 'old', identity }),
    ).rejects.toThrow('Stale');
    await expect(
      runner.command({
        ...envelope(),
        type: 'command',
        command: 'start',
        runId: runner.snapshot.runId,
        identity: { ...identity, documentId: 'old' },
      }),
    ).rejects.toThrow('Stale');
  });
  it('does not expose synthetic adapters in a production scan', () => {
    create();
    const registry = new Registry(false);
    expect(registry.scan()).toEqual([]);
    expect(registry.ready()).toBe(false);
  });
  it('retains ordered checkpoints with monotonically increasing sequences', async () => {
    const { runner, saved } = create();
    answer();
    await cmd(runner, 'start');
    await terminal(runner);
    expect(saved.every((s, i) => i === 0 || s.seq > saved[i - 1]!.seq)).toBe(true);
  });
});

it('reloaded documents do not replay a checkpointed uncertain submission', async () => {
  const initial = create();
  await cmd(initial.runner, 'start');
  await vi.waitFor(() => expect(initial.runner.snapshot.state).toBe('waiting'), { interval: 1 });
  const prior = structuredClone(initial.runner.snapshot);
  initial.runner.dispose();
  const replacement = new Runner(identity, new Registry(true, 30), async () => {}, prior);
  runners.push(replacement);
  const click = vi.fn();
  document.querySelector('button')!.addEventListener('click', click);
  await cmd(replacement, 'resume');
  await terminal(replacement);
  expect(click).not.toHaveBeenCalled();
  expect(replacement.snapshot.state).toBe('needs_attention');
});

it('cannot act when checkpoint persistence fails', async () => {
  create();
  const runner = new Runner(identity, new Registry(true, 30), async () => {
    throw new Error('Storage unavailable');
  });
  runners.push(runner);
  const click = vi.fn();
  document.querySelector('button')!.addEventListener('click', click);
  await cmd(runner, 'start');
  await vi.waitFor(() => expect(runner.snapshot.state).toBe('error'));
  expect(click).not.toHaveBeenCalled();
});

it('Pause revokes a persisted navigation handoff', async () => {
  const { runner } = create();
  runner.snapshot.state = 'navigating';
  runner.snapshot.handoff = {
    token: 'next',
    destination: 'http://localhost:4173/zybook/demo/chapter/1/section/2',
    book: 'demo',
    section: '1.2',
    fromDocument: 'doc1',
    created: Date.now(),
  };
  await cmd(runner, 'pause');
  expect(runner.snapshot.handoff).toBeUndefined();
});

it('an inactive Start preserves the selected scope and filters before pausing', async () => {
  const { runner } = create();
  await runner.command({
    ...envelope(),
    type: 'command',
    command: 'start',
    runId: runner.snapshot.runId,
    identity,
    inactive: true,
    settings: {
      ...defaults,
      kinds: ['animation'],
      scope: 'range',
      endSection: '1.2',
      pauseHidden: true,
    },
  });
  expect(runner.snapshot.state).toBe('paused');
  expect(runner.snapshot.settings.kinds).toEqual(['animation']);
  expect(runner.snapshot.settings.endSection).toBe('1.2');
  expect(runner.snapshot.items).toEqual([]);
});

it.each(['stopped', 'finished'] as const)(
  'reconnecting a %s run preserves its terminal state',
  (state) => {
    const { runner } = create();
    const prior = { ...runner.snapshot, state };
    const reconnected = new Runner(identity, new Registry(true), async () => {}, prior);
    runners.push(reconnected);
    expect(reconnected.snapshot.state).toBe(state);
  },
);

it('read-only production locations reject detached candidates instead of using a new index match', () => {
  document.body.innerHTML = '<article class="participation"></article>';
  const registry = new Registry(false);
  const ref = registry.scan()[0]!;
  const old = document.querySelector('article')!;
  expect(registry.locate(ref)).toBe(old);
  old.outerHTML = '<article class="participation"></article>';
  expect(() => registry.locate(ref)).toThrow('page changed');
  expect([...registry.adapters.keys()]).toEqual(['animation', 'single_choice']);
});
