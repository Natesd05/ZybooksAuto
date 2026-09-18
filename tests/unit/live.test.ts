import { afterEach, describe, expect, it } from 'vitest';
import { Registry } from '../../src/adapters/registry';
import { inspectStructure } from '../../src/diagnostics';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('live activity boundaries', () => {
  it('counts activity containers once instead of counting their nested participation badges', () => {
    document.body.innerHTML = Array.from(
      { length: 5 },
      (_, index) => `
      <div class="interactive-activity-container participation" content_resource_id="${index}">
        <div class="activity-title-bar"><span class="participation">Participation activity</span></div>
        <div class="activity-payload"><span class="interactive-activity-container participation">Question status</span></div>
      </div>`,
    ).join('');
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<aside class="participation">Participation summary</aside>',
    );
    expect(new Registry(false).scan()).toHaveLength(5);
    expect(inspectStructure().participationCandidates).toBe(5);
  });
});

import { liveActivity } from '../fixtures/live';
import { liveAdapter } from '../../src/adapters/live';
import { Runner } from '../../src/core/runner';
import { defaults, envelope } from '../../src/protocol/schema';
import { vi } from 'vitest';

const identity = {
  tabId: 1,
  documentId: 'live-test',
  route: 'http://localhost:4173/zybook/demo/chapter/1/section/1',
};
function context() {
  const controller = new AbortController();
  return {
    controller,
    signal: controller.signal,
    generation: 1,
    assertCurrent() {
      controller.signal.throwIfAborted();
    },
  };
}

describe('inspected live adapters', () => {
  it('recognizes stable resource IDs and completed activities without selecting blank radios', async () => {
    document.body.innerHTML =
      liveActivity('1', 'animation', true) + liveActivity('2', 'single_choice', true);
    const registry = new Registry(false);
    expect(registry.scan()).toEqual([
      { id: 'live-1', kind: 'animation' },
      { id: 'live-2', kind: 'single_choice' },
    ]);
    const clicks = vi.fn();
    document.body.addEventListener('click', clicks, { once: true });
    const runner = new Runner(identity, registry, async () => {});
    await runner.command({
      ...envelope(),
      type: 'command',
      command: 'start',
      runId: runner.snapshot.runId,
      identity,
      settings: { ...defaults, pauseHidden: false },
    });
    await vi.waitFor(() => expect(runner.snapshot.state).toBe('finished'));
    expect(runner.snapshot.compatible).toBe(true);
    expect(runner.snapshot.items.map((item) => item.state)).toEqual([
      'already_complete',
      'already_complete',
    ]);
    expect(clicks).not.toHaveBeenCalled();
    document.body.removeEventListener('click', clicks);
    runner.dispose();
  });

  it('rejects duplicate resource IDs and does not expose fixture adapters in production', () => {
    document.body.innerHTML = liveActivity('1', 'animation') + liveActivity('1', 'animation');
    expect(() => new Registry(false).scan()).toThrow('ambiguous');
    document.body.innerHTML =
      '<article class="interactive-activity-container participation" data-zf-activity="fake" data-kind="animation"><button>Start</button></article>';
    expect(new Registry(false).scan()[0]?.kind).toBe('unknown');
  });

  it('requires the activity marker rather than a nested completed question', () => {
    document.body.innerHTML = liveActivity('1', 'single_choice');
    document.querySelector('.question-chevron')!.setAttribute('aria-label', 'Question completed');
    const adapter = liveAdapter('single_choice');
    const before = adapter.inspect(new Registry(false).scan()[0]!);
    expect(before.complete).toBe(false);
    expect(adapter.plan(before)?.operation).toBe('wait');
  });

  it('rejects a stale plan after native checked properties change', () => {
    document.body.innerHTML = liveActivity('1', 'single_choice');
    const adapter = liveAdapter('single_choice');
    const before = adapter.inspect(new Registry(false).scan()[0]!);
    const plan = adapter.plan(before)!;
    document.querySelector('input')!.checked = true;
    expect(() => adapter.execute(plan, context())).toThrow('stale');
  });

  it('waits through playing state and cancels without advancing', async () => {
    document.body.innerHTML = liveActivity('1', 'animation');
    document.querySelector('input')!.checked = true;
    const adapter = liveAdapter('animation');
    const before = adapter.inspect(new Registry(false).scan()[0]!);
    const button = document.querySelector('button')!;
    button.addEventListener('click', () => button.setAttribute('aria-label', 'Pause'));
    const ctx = context();
    adapter.execute(adapter.plan(before)!, ctx);
    let settled = false;
    const result = adapter.verify(before, ctx).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(settled).toBe(false);
    ctx.controller.abort();
    await expect(result).rejects.toThrow('Cancelled');
    expect(button.getAttribute('aria-label')).toBe('Pause');
  });

  it('continues after a feedback timeout without claiming completion or repeating a choice', async () => {
    document.body.innerHTML = liveActivity('1', 'single_choice');
    const adapter = liveAdapter('single_choice', 30);
    const before = adapter.inspect(new Registry(false).scan()[0]!);
    adapter.execute(adapter.plan(before)!, context());
    expect((await adapter.verify(before, context())).complete).toBe(false);
    const next = adapter.plan(adapter.inspect(before.ref))!;
    expect(next.target).toBe('0:1');
  });

  it('tries every choice once, advances through exhausted questions, and continues to the next activity', async () => {
    document.body.innerHTML =
      liveActivity('1', 'single_choice') + liveActivity('2', 'single_choice');
    const roots = document.querySelectorAll<HTMLElement>('.interactive-activity-container');
    const copy = roots[0]!
      .querySelector('.multiple-choice-question')!
      .cloneNode(true) as HTMLElement;
    copy.querySelectorAll('input').forEach((input) => {
      input.name = 'second-question';
    });
    roots[0]!.querySelector('.activity-payload')!.append(copy);
    roots[0]!.querySelector('input')!.checked = true;
    const clicked: number[] = [];
    const inputs = Array.from(document.querySelectorAll('input'));
    inputs.forEach((input, index) =>
      input.addEventListener('click', () => {
        clicked.push(index);
        if (index === 4)
          roots[1]!
            .querySelector('.title-bar-chevron')!
            .setAttribute('aria-label', 'Activity completed');
      }),
    );
    const runner = new Runner(identity, new Registry(false, 20), async () => {});
    try {
      await runner.command({
        ...envelope(),
        type: 'command',
        command: 'start',
        runId: runner.snapshot.runId,
        identity,
        settings: { ...defaults, pauseHidden: false },
      });
      await vi.waitFor(() => expect(runner.snapshot.state).toBe('finished'));
      expect(clicked).toEqual([0, 1, 2, 3, 4]);
      expect(runner.snapshot.items.map((item) => item.state)).toEqual(['skipped', 'complete']);
      expect(runner.snapshot.items[0]!.actions).toBe(4);
      expect(runner.snapshot.action).toBe('Finished with 1 skipped');
    } finally {
      runner.dispose();
    }
  });

  it('still cancels a choice feedback wait when stopped', async () => {
    document.body.innerHTML = liveActivity('1', 'single_choice');
    const adapter = liveAdapter('single_choice', 30);
    const before = adapter.inspect(new Registry(false).scan()[0]!);
    const ctx = context();
    adapter.execute(adapter.plan(before)!, ctx);
    const verifying = adapter.verify(before, ctx);
    ctx.controller.abort();
    await expect(verifying).rejects.toThrow('Cancelled');
  });
});
