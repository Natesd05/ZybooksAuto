import {
  accepts,
  activeStates,
  defaults,
  type Command,
  type Identity,
  type Item,
  type RunState,
  type Settings,
  type Snapshot,
} from '../protocol/schema';
import { Registry } from '../adapters/registry';
import type { Context, Inspection } from '../adapters/types';
import { settingsProblem } from './settings';
import { transition } from './state';
import { waitFor } from './wait';
import { nextHandoff, routeIdentity, routeKey } from '../navigation/routes';

export type Save = (snapshot: Snapshot) => Promise<void>;
export class Runner {
  snapshot: Snapshot;
  private controller = new AbortController();
  private generation = 0;
  private task: Promise<void> | null = null;
  private pending: Inspection | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  constructor(
    identity: Identity,
    readonly registry: Registry,
    readonly save: Save,
    prior?: Snapshot,
  ) {
    const route = routeIdentity(identity.route);
    this.snapshot = prior
      ? {
          ...prior,
          identity,
          handoff: undefined,
          state: activeStates.includes(prior.state) ? 'paused' : prior.state,
          seq: prior.seq + 1,
        }
      : {
          protocolVersion: 1,
          runId: crypto.randomUUID(),
          identity,
          seq: 0,
          state: 'idle',
          book: route?.book ?? 'No recognized book',
          section: route?.section ?? '—',
          items: [],
          action: 'Ready to scan',
          progressAt: 0,
          heartbeatAt: Date.now(),
          settings: defaults,
          visited: [],
          compatible: registry.fixtureMode,
        };
  }
  private set(state: RunState, action: string) {
    this.snapshot = transition(this.snapshot, state, action);
  }
  private async checkpoint(progress = false) {
    this.snapshot = {
      ...this.snapshot,
      seq: this.snapshot.seq + 1,
      heartbeatAt: Date.now(),
      progressAt: progress ? Date.now() : this.snapshot.progressAt,
    };
    const copy = structuredClone(this.snapshot);
    this.saveQueue = this.saveQueue.catch(() => {}).then(() => this.save(copy));
    await this.saveQueue;
  }
  private cancel() {
    this.generation++;
    this.controller.abort();
  }
  async heartbeat() {
    await this.checkpoint();
  }
  async command(command: Command) {
    if (!accepts(this.snapshot, command))
      throw new Error('Stale run or document. Reconnect to the current section.');
    if (command.command === 'show') {
      const item = this.snapshot.items.find(
        (i) => i.id === command.itemId && i.section === this.snapshot.section,
      );
      if (!item) throw new Error('This item is not in the current section.');
      this.registry.locate(item).scrollIntoView({ block: 'center', behavior: 'instant' });
      return;
    }
    if (command.command === 'pause' || command.command === 'stop') {
      this.cancel();
      this.snapshot.handoff = undefined;
      this.set(
        command.command === 'pause' ? 'paused' : 'stopped',
        command.command === 'pause'
          ? 'Paused. Dispatched actions may still finish on the page.'
          : 'Stopped. No further actions will be sent.',
      );
      await this.checkpoint();
      return;
    }
    if (
      command.command === 'start' &&
      ['running', 'waiting', 'scanning', 'navigating', 'paused', 'needs_attention'].includes(
        this.snapshot.state,
      )
    )
      return;
    if (
      (command.command === 'resume' || command.command === 'retry' || command.command === 'skip') &&
      !['paused', 'needs_attention'].includes(this.snapshot.state)
    )
      throw new Error('Pause or resolve the current run before changing its queue.');
    if (command.command === 'skip' || command.command === 'retry') {
      const item = this.snapshot.items.find(
        (i) => i.id === command.itemId && i.section === this.snapshot.section,
      );
      if (
        !item ||
        !['unsupported', 'failed', 'needs_attention', 'waiting', 'running', 'queued'].includes(
          item.state,
        )
      )
        throw new Error('This item cannot be retried or skipped.');
      if (command.command === 'skip') {
        item.state = 'skipped';
        item.reason = 'Explicitly skipped by you';
        if (this.pending?.ref.id === item.id) this.pending = null;
        if (this.snapshot.uncertain?.id === item.id) this.snapshot.uncertain = undefined;
      } else {
        if (item.kind === 'unknown') throw new Error('This widget has no verified adapter.');
        item.state = 'queued';
        item.reason = undefined;
      }
    }
    // Cancelled tasks settle before acquiring the next generation. Start remains idempotent even during this wait.
    if (this.task) await this.task;
    if (command.command === 'start') {
      const settings = command.settings ?? this.snapshot.settings;
      this.validateSettings(settings);
      this.snapshot.settings = settings;
      this.snapshot.items = [];
      this.snapshot.visited = [routeKey(this.snapshot.identity.route)];
      // Preserve pending evidence after Stop: a new Start must not blindly repeat an uncertain submission.
    }
    if (this.snapshot.settings.pauseHidden && (document.hidden || command.inactive)) {
      this.set('paused', 'Bring the connected tab to the foreground, then Resume.');
      await this.checkpoint();
      return;
    }
    this.controller = new AbortController();
    const generation = ++this.generation;
    this.set('scanning', 'Scanning activity boundaries and completion evidence');
    this.task = this.run(generation).finally(() => {
      this.task = null;
    });
    void this.task;
  }
  private validateSettings(settings: Settings) {
    const problem = settingsProblem(settings, this.snapshot.section);
    if (problem) throw new Error(problem);
  }

  private context(generation: number): Context {
    return {
      generation,
      signal: this.controller.signal,
      assertCurrent: () => {
        if (
          generation !== this.generation ||
          routeKey(location.href) !== routeKey(this.snapshot.identity.route)
        )
          throw new DOMException('Obsolete document generation', 'AbortError');
        this.controller.signal.throwIfAborted();
      },
    };
  }
  private async run(generation: number) {
    const context = this.context(generation);
    try {
      await this.checkpoint();
      context.assertCurrent();
      if (this.registry.fixtureMode)
        await waitFor(
          () => {
            const root = document.querySelector<HTMLElement>(
              '[data-zf-section][data-ready="true"]',
            );
            return this.registry.ready() && root?.dataset.zfSection === this.snapshot.section;
          },
          context.signal,
          this.registry.timeout,
        );
      const refs = this.registry.scan();
      this.snapshot.compatible = refs.length > 0 && refs.every((ref) => ref.kind !== 'unknown');
      const old = new Map(
        this.snapshot.items
          .filter((i) => i.section === this.snapshot.section)
          .map((i) => [i.id, i]),
      );
      const items: Item[] = refs
        .filter((ref) => ref.kind === 'unknown' || this.snapshot.settings.kinds.includes(ref.kind))
        .map((ref) => {
          const prior = old.get(ref.id);
          if (prior?.state === 'skipped') return prior;
          const complete =
            ref.kind !== 'unknown' && this.registry.adapters.get(ref.kind)?.inspect(ref).complete;
          return {
            ...ref,
            section: this.snapshot.section,
            actions: prior?.actions ?? 0,
            state: complete
              ? prior?.state === 'complete'
                ? 'complete'
                : 'already_complete'
              : ref.kind === 'unknown'
                ? 'unsupported'
                : 'queued',
            reason:
              ref.kind === 'unknown'
                ? 'No verified adapter for this widget. Current zyBooks markup needs read-only inspection.'
                : undefined,
          };
        });
      this.snapshot.items = [
        ...this.snapshot.items.filter((i) => i.section !== this.snapshot.section),
        ...items,
      ];
      if (!items.length) {
        this.set(
          'needs_attention',
          'No selected activities recognized. An empty scan is not completion.',
        );
        await this.checkpoint();
        return;
      }
      this.set('running', 'Activity scan complete');
      await this.checkpoint(true);
      for (const item of items) {
        context.assertCurrent();
        if (['already_complete', 'complete', 'skipped'].includes(item.state)) continue;
        if (item.state === 'unsupported') {
          this.set('needs_attention', item.reason!);
          await this.checkpoint();
          return;
        }
        const adapter = this.registry.adapters.get(item.kind)!;
        let before = adapter.inspect(item);
        // A reloaded document cannot prove what happened to an in-flight action. Require completion evidence or explicit Skip.
        if (
          this.snapshot.uncertain?.id === item.id &&
          this.snapshot.uncertain.section === item.section &&
          !this.pending &&
          !before.complete
        ) {
          this.set(
            'waiting',
            'Reconciling an action from the previous document. Verify completion manually or Skip.',
          );
          item.state = 'waiting';
          await this.checkpoint();
          before = await waitFor(
            () => {
              const current = adapter.inspect(item);
              return current.complete ? current : undefined;
            },
            context.signal,
            this.registry.timeout,
          );
        }
        // Resume observes any already-dispatched action before planning another mutation.
        if (this.pending?.ref.id === item.id) {
          const pending = this.pending;
          if (!before.complete) {
            this.set('waiting', 'Reconciling the last dispatched action');
            item.state = 'waiting';
            await this.checkpoint();
            before = await adapter.verify(pending, context);
          }
          this.pending = null;
          this.snapshot.uncertain = undefined;
        }
        while (!before.complete) {
          context.assertCurrent();
          if (item.actions >= 100)
            throw new Error('Activity action limit reached. Inspect the widget manually.');
          const plan = adapter.plan(before);
          if (!plan) throw new Error('The adapter has no action and no completion evidence.');
          item.state = 'running';
          this.set('running', plan.description);
          await this.checkpoint();
          context.assertCurrent();
          this.pending = before;
          if (plan.operation !== 'wait')
            this.snapshot.uncertain = { id: item.id, section: item.section };
          await this.checkpoint();
          context.assertCurrent();
          adapter.execute(plan, context);
          if (plan.operation !== 'wait') item.actions++;
          item.state = 'waiting';
          this.set('waiting', 'Waiting for fresh activity evidence');
          await this.checkpoint();
          before = await adapter.verify(before, context);
          this.pending = null;
          this.snapshot.uncertain = undefined;
          this.set('running', 'Fresh activity evidence observed');
          await this.checkpoint(true);
        }
        item.state = 'complete';
        item.reason = undefined;
        this.pending = null;
        this.snapshot.uncertain = undefined;
        await this.checkpoint(true);
      }
      context.assertCurrent();
      if (!this.registry.fixtureMode && this.snapshot.settings.scope === 'range')
        throw new Error('Live next-section navigation is unverified. Continue manually.');
      const link = document.querySelector<HTMLAnchorElement>('a[data-zf-next]');
      const handoff = nextHandoff(this.snapshot, link);
      if (handoff) {
        this.snapshot.handoff = handoff;
        this.set('navigating', `Continuing to section ${handoff.section}`);
        await this.checkpoint();
        context.assertCurrent();
        // Persisted token precedes the only click; cancel the activity generation first.
        this.cancel();
        link!.click();
        return;
      }
      const skipped = this.snapshot.items.filter((i) => i.state === 'skipped').length;
      this.set(
        'finished',
        skipped ? `Finished with ${skipped} skipped` : 'Selected activities verified complete',
      );
      await this.checkpoint(true);
    } catch (error) {
      if (generation !== this.generation || context.signal.aborted) return;
      const item = this.snapshot.items.find(
        (i) => ['running', 'waiting'].includes(i.state) && i.section === this.snapshot.section,
      );
      const reason =
        error instanceof Error ? error.message : 'An unexpected adapter error occurred.';
      if (item) {
        item.state = 'needs_attention';
        item.reason = reason;
      }
      this.set('needs_attention', reason);
      await this.checkpoint().catch(() => {
        this.snapshot = {
          ...this.snapshot,
          state: 'error',
          action: 'Checkpoint unavailable. Automation has stopped.',
        };
        this.cancel();
      });
    }
  }
  async pauseForNavigation(reason: string) {
    this.cancel();
    this.set('paused', reason);
    await this.checkpoint();
  }
  dispose() {
    this.cancel();
  }
}
