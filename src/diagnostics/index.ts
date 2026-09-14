import type { Snapshot } from '../protocol/schema';
import { participationRoots } from '../adapters/live';
/** Allowlisted export: no URL queries, DOM text, field values, site IDs or raw exceptions. */
export function diagnostic(snapshot: Snapshot | null) {
  if (!snapshot) return { version: 1, status: 'disconnected' };
  return {
    version: 1,
    state: snapshot.state,
    compatible: snapshot.compatible,
    sequence: snapshot.seq,
    progressAt: snapshot.progressAt,
    heartbeatAt: snapshot.heartbeatAt,
    activities: snapshot.items
      .slice(-200)
      .map((item, index) => ({ index, kind: item.kind, state: item.state, actions: item.actions })),
  };
}
export function inspectStructure(root: Document = document) {
  return {
    version: 1,
    date: new Date().toISOString().slice(0, 10),
    frames: root.querySelectorAll('iframe').length,
    participationCandidates: participationRoots(root).length,
    inputs: root.querySelectorAll('input').length,
    textareas: root.querySelectorAll('textarea').length,
    draggable: root.querySelectorAll('[draggable="true"]').length,
    buttons: root.querySelectorAll('button').length,
    openShadowRoots: Array.from(root.querySelectorAll('*')).filter((el) => el.shadowRoot).length,
    note: 'Read-only structural counts. No current widget compatibility is established by this report.',
  };
}
