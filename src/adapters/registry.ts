import { Kind, type ActivityKind } from '../protocol/schema';
import { fixtureAdapter, rootFor } from './fixture';
import type { Adapter, Ref } from './types';
import { liveAdapter, liveKind, liveRoot, participationRoots } from './live';
export class Registry {
  readonly adapters;
  private candidates = new Map<string, HTMLElement>();
  constructor(
    readonly fixtureMode: boolean,
    readonly timeout = 8000,
  ) {
    this.adapters = new Map<ActivityKind, Adapter>(
      fixtureMode
        ? ['animation', 'single_choice', 'short_answer', 'matching', 'ordered_blocks'].map(
            (kind) => [
              kind as ActivityKind,
              fixtureAdapter(kind as Exclude<ActivityKind, 'unknown'>, timeout),
            ],
          )
        : ['animation', 'single_choice'].map((kind) => [
            kind as ActivityKind,
            liveAdapter(kind as 'animation' | 'single_choice', timeout),
          ]),
    );
  }
  scan(): Ref[] {
    if (!this.fixtureMode) {
      this.candidates.clear();
      const refs = participationRoots()
        .slice(0, 500)
        .map((root, i) => {
          const kind = liveKind(root);
          const resourceId = root.getAttribute('content_resource_id');
          const id =
            kind !== 'unknown' && resourceId && /^\d{1,100}$/.test(resourceId)
              ? `live-${resourceId}`
              : `unverified-${i + 1}`;
          this.candidates.set(id, root);
          return { id, kind: id.startsWith('live-') ? kind : ('unknown' as const) };
        });
      if (new Set(refs.map((ref) => ref.id)).size !== refs.length)
        throw new Error('Live activity IDs are ambiguous. Rescan after the page finishes loading.');
      return refs;
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
    if (ref.kind !== 'unknown') return liveRoot(ref);
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
