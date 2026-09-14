import { describe, expect, it, vi } from 'vitest';
import { Message, defaults, envelope } from '../../src/protocol/schema';
import { Runner } from '../../src/core/runner';
import { Registry } from '../../src/adapters/registry';
import { nextHandoff, matchesHandoff, routeKey } from '../../src/navigation/routes';
import { diagnostic } from '../../src/diagnostics';
import { transition } from '../../src/core/state';
import { waitFor } from '../../src/core/wait';
function snapshot() {
  return new Runner(
    { tabId: 1, documentId: 'doc', route: 'http://localhost:4173/zybook/demo/chapter/1/section/1' },
    new Registry(true),
    async () => {},
  ).snapshot;
}
describe('protocol, navigation and diagnostics', () => {
  it('rejects incompatible versions and malformed command payloads', () => {
    expect(Message.safeParse({ ...envelope(), protocolVersion: 2, type: 'panel' }).success).toBe(
      false,
    );
    expect(
      Message.safeParse({ ...envelope(), type: 'command', command: 'eval', code: 'alert(1)' })
        .success,
    ).toBe(false);
  });
  it('enforces reducer transitions', () => {
    expect(() => transition(snapshot(), 'finished', '')).toThrow('Invalid transition');
  });
  it('requires terminal nonempty work before navigation and validates the visible link', () => {
    const state = snapshot();
    state.settings = { ...defaults, scope: 'range', endSection: '1.2' };
    state.visited = [routeKey(state.identity.route)];
    document.body.innerHTML = '<a href="/zybook/demo/chapter/1/section/2?lms=context">Next</a>';
    const link = document.querySelector('a')!;
    vi.spyOn(link, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    expect(() => nextHandoff(state, link)).toThrow('queue');
    state.items = [{ id: 'q', kind: 'animation', state: 'complete', actions: 1, section: '1.1' }];
    const handoff = nextHandoff(state, link)!;
    expect(handoff.destination).toContain('?lms=context');
    expect(matchesHandoff(handoff, link.href)).toBe(true);
    expect(matchesHandoff({ ...handoff, created: Date.now() - 61000 }, link.href)).toBe(false);
    link.href = 'https://example.org/zybook/demo/chapter/1/section/2';
    expect(() => nextHandoff(state, link)).toThrow('outside');
  });
  it('finishes exactly at the selected boundary without requiring a next link', () => {
    const state = snapshot();
    state.settings = { ...defaults, scope: 'range', endSection: '1.1' };
    expect(nextHandoff(state, null)).toBeNull();
  });
  it('rejects loops, hidden links, and section limit overflow', () => {
    const state = snapshot();
    state.settings = { ...defaults, scope: 'range', endSection: '1.3', maxSections: 1 };
    state.items = [{ id: 'q', kind: 'animation', state: 'skipped', actions: 0, section: '1.1' }];
    state.visited = [state.identity.route];
    expect(() => nextHandoff(state, null)).toThrow('limit');
    state.settings.maxSections = 3;
    expect(() => nextHandoff(state, null)).toThrow('missing');
    document.body.innerHTML = '<a href="/zybook/demo/chapter/1/section/2">Next</a>';
    const link = document.querySelector('a')!;
    vi.spyOn(link, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    state.visited.push(routeKey(link.href));
    expect(() => nextHandoff(state, link)).toThrow('visited');
  });
  it('exports bounded allowlisted diagnostics without content or identifying URL parameters', () => {
    const state = snapshot();
    state.action = 'secret question and answer';
    state.book = 'private book';
    state.identity.route += '?token=secret';
    state.items = [
      {
        id: 'private-id',
        kind: 'short_answer',
        state: 'failed',
        actions: 1,
        section: 'private-section',
        reason: 'password',
      },
    ];
    const output = JSON.stringify(diagnostic(state));
    expect(output).not.toMatch(/secret|private|password/);
  });
  it('cleans observers and timers on aborted waits', async () => {
    const controller = new AbortController();
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const result = waitFor(() => false, controller.signal, 1000);
    controller.abort();
    await expect(result).rejects.toThrow('Cancelled');
    expect(disconnect).toHaveBeenCalled();
  });
});
