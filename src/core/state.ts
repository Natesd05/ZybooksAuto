import type { RunState, Snapshot, ItemState } from '../protocol/schema';
const transitions: Record<RunState, RunState[]> = {
  idle: ['scanning', 'stopped', 'paused'],
  scanning: ['running', 'needs_attention', 'paused', 'stopped', 'error'],
  running: ['waiting', 'navigating', 'finished', 'needs_attention', 'paused', 'stopped', 'error'],
  waiting: ['running', 'needs_attention', 'paused', 'stopped', 'error'],
  paused: ['scanning', 'running', 'stopped', 'needs_attention'],
  navigating: ['scanning', 'paused', 'needs_attention', 'stopped', 'error'],
  needs_attention: ['scanning', 'running', 'paused', 'stopped'],
  stopped: ['scanning', 'paused'],
  error: ['scanning', 'stopped', 'paused'],
  finished: ['scanning', 'stopped', 'paused'],
};
export function transition(snapshot: Snapshot, state: RunState, action: string): Snapshot {
  if (state !== snapshot.state && !transitions[snapshot.state].includes(state))
    throw new Error(`Invalid transition: ${snapshot.state} → ${state}`);
  return { ...snapshot, state, action, seq: snapshot.seq + 1 };
}
export function counts(snapshot: Snapshot) {
  const result: Record<ItemState, number> = {
    queued: 0,
    already_complete: 0,
    running: 0,
    waiting: 0,
    complete: 0,
    needs_attention: 0,
    skipped: 0,
    unsupported: 0,
    failed: 0,
  };
  snapshot.items.forEach((item) => result[item.state]++);
  return result;
}
