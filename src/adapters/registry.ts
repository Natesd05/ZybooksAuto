import { Kind, type ActivityKind } from '../protocol/schema';
import { fixtureAdapter, rootFor } from './fixture';
import type { Ref } from './types';
export class Registry {
  readonly adapters;
  private candidates = new Map<string, HTMLElement>();
  constructor(
    readonly fixtureMode: boolean,
    readonly timeout = 8000,
  ) {
    this.adapters = new Map(
      ['animation', 'single_choice', 'short_answer', 'matching', 'ordered_blocks'].map((kind) => [
        kind as ActivityKind,
        fixtureAdapter(kind as Exclude<ActivityKind, 'unknown'>, timeout),
      ]),
    );
  }
  scan(): Ref[] {
    if (!this.fixtureMode) {
      // Historical audit establishes this as a candidate only, never an executable contract.
      this.candidates.clear();
      return Array.from(document.querySelectorAll<HTMLElement>('.participation'))
        .slice(0, 500)
        .map((root, i) => {
          const id = `unverified-${i + 1}`;
          this.candidates.set(id, root);
          return { id, kind: 'unknown' };
        });
    }
    const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-zf-activity]'));
    const ids = roots.map((el) => el.dataset.zfActivity);
    if (ids.some((id) => !id || id.length > 160) || new Set(ids).size !== ids.length)
      throw new Error('Activity IDs are missing or ambiguous.');
    return roots.map((root) => {
      const result = Kind.safeParse(root.dataset.kind);
      const kind =
        result.success && root.dataset.category === 'participation' ? result.data : 'unknown';
      return { id: root.dataset.zfActivity!, kind };
    });
  }
  locate(ref: Ref): HTMLElement {
    if (this.fixtureMode) return rootFor(ref);
    const candidate = this.candidates.get(ref.id);
    if (!candidate?.isConnected)
      throw new Error('The page changed. Resume to rescan before showing this activity.');
    return candidate;
  }
  ready() {
    return (
      this.fixtureMode && document.querySelector('[data-zf-section][data-ready="true"]') !== null
    );
  }
}
