import { defineBackground } from 'wxt/utils/define-background';
import {
  Message,
  activeStates,
  envelope,
  sameIdentity,
  type Snapshot,
} from '../src/protocol/schema';
import { getCheckpoint, getPreferences, saveCheckpoint } from '../src/storage/checkpoints';
import { matchesHandoff, routeKey, routeIdentity } from '../src/navigation/routes';
import { diagnostic } from '../src/diagnostics';

export default defineBackground(() => {
  let queue: Promise<unknown> = Promise.resolve();
  const fixtureMode = import.meta.env.MODE === 'fixture';
  const allowed = (url: string) => {
    try {
      const u = new URL(url);
      return (
        u.origin === 'https://learn.zybooks.com' ||
        (fixtureMode && u.hostname === 'localhost' && u.protocol === 'http:')
      );
    } catch {
      return false;
    }
  };
  const panelSender = (sender: chrome.runtime.MessageSender) =>
    sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('sidepanel.html');
  async function publish(snapshot: Snapshot) {
    await saveCheckpoint(snapshot);
    const label = {
      running: '▶',
      waiting: '…',
      scanning: '…',
      paused: 'Ⅱ',
      navigating: '→',
      needs_attention: '!',
      error: '!',
      stopped: '',
      finished: '✓',
      idle: '',
    }[snapshot.state];
    await chrome.action.setBadgeText({ text: label });
    await chrome.action.setBadgeBackgroundColor({
      color: ['needs_attention', 'error'].includes(snapshot.state) ? '#a44b17' : '#176b5b',
    });
    const stored = await chrome.storage.local.get('diagnostics');
    const events = Array.isArray(stored.diagnostics) ? stored.diagnostics.slice(-99) : [];
    await chrome.storage.local.set({ diagnostics: [...events, diagnostic(snapshot)] });
  }
  async function revokedRuns(): Promise<string[]> {
    const value = (await chrome.storage.session.get('revokedRuns')).revokedRuns;
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string').slice(-50)
      : [];
  }
  function stopDisconnected(expected: Snapshot) {
    const stopping = queue
      .catch(() => {})
      .then(async () => {
        const current = await getCheckpoint();
        if (
          !current ||
          current.runId !== expected.runId ||
          !sameIdentity(current.identity, expected.identity)
        )
          throw new Error('The run changed. Reconnect before stopping it.');
        // Revoke the old run before publishing Stop. A late sender cannot resurrect it.
        await chrome.storage.session.set({
          revokedRuns: [
            ...(await revokedRuns()).filter((id) => id !== current.runId).slice(-49),
            current.runId,
          ],
        });
        await publish({
          ...current,
          state: 'stopped',
          heartbeatAt: 0,
          seq: current.seq + 1,
          handoff: undefined,
          action:
            'Stopped. The previous section is disconnected. You can connect to another section.',
        });
        return { ok: true };
      });
    queue = stopping;
    return stopping;
  }
  async function handle(raw: unknown, sender: chrome.runtime.MessageSender) {
    const parsed = Message.safeParse(raw);
    if (!parsed.success || sender.id !== chrome.runtime.id)
      throw new Error('Invalid extension protocol.');
    const message = parsed.data;
    if (
      message.type === 'panel' ||
      message.type === 'preferences' ||
      message.type === 'command' ||
      message.type === 'inspect' ||
      message.type === 'focus'
    ) {
      if (!panelSender(sender)) throw new Error('Only the extension panel may issue commands.');
      if (message.type === 'preferences') {
        await chrome.storage.local.set({ preferences: message.settings });
        return { ok: true };
      }
      if (message.type === 'panel') {
        await queue.catch(() => {});
        let checkpoint = await getCheckpoint();
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (
          checkpoint &&
          !activeStates.includes(checkpoint.state) &&
          tab?.id !== checkpoint.identity.tabId &&
          tab?.url &&
          allowed(tab.url)
        ) {
          await chrome.storage.session.set({ selectedTab: tab.id });
          await chrome.storage.session.remove('checkpoint');
          checkpoint = null;
        }
        if (!checkpoint && tab?.id && tab.url && allowed(tab.url)) {
          const response = await chrome.tabs
            .sendMessage(tab.id, { type: 'get-snapshot' }, { frameId: 0 })
            .catch(() => null);
          checkpoint = response?.snapshot ?? null;
        }
        return {
          ok: true,
          snapshot: checkpoint,
          activeTabId: tab?.id ?? null,
          preferences: await getPreferences(),
        };
      }
      const checkpoint = await getCheckpoint();
      if (!checkpoint || !sameIdentity(checkpoint.identity, message.identity))
        throw new Error('The connected document changed. Reconnect first.');
      if (message.type === 'command' && checkpoint.runId !== message.runId)
        throw new Error('The run changed. Reconnect first.');
      const tab = await chrome.tabs.get(message.identity.tabId).catch(() => null);
      if (message.type === 'focus') {
        if (!tab) throw new Error('The connected tab was closed. Connect to a new section.');
        await chrome.tabs.update(message.identity.tabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
        return { ok: true };
      }
      if (message.type === 'command' && message.command === 'stop') {
        const frame = tab
          ? await chrome.webNavigation
              .getFrame({ tabId: message.identity.tabId, frameId: 0 })
              .catch(() => null)
          : null;
        if (
          !frame ||
          frame.documentId !== message.identity.documentId ||
          routeKey(frame.url) !== routeKey(message.identity.route) ||
          tab?.discarded
        )
          return stopDisconnected(checkpoint);
        try {
          return await chrome.tabs.sendMessage(message.identity.tabId, message, {
            documentId: message.identity.documentId,
          });
        } catch {
          return stopDisconnected(checkpoint);
        }
      }
      if (!tab?.url || !allowed(tab.url) || routeKey(tab.url) !== routeKey(message.identity.route))
        throw new Error('The connected tab left this section.');
      if (
        message.type === 'command' &&
        ['start', 'resume', 'retry', 'skip'].includes(message.command) &&
        (message.settings?.pauseHidden ?? checkpoint.settings.pauseHidden) &&
        !tab.active
      ) {
        return chrome.tabs.sendMessage(
          message.identity.tabId,
          { ...message, inactive: true },
          { documentId: message.identity.documentId },
        );
      }
      return chrome.tabs.sendMessage(message.identity.tabId, message, {
        documentId: message.identity.documentId,
      });
    }
    if (
      !sender.tab?.id ||
      sender.frameId !== 0 ||
      !sender.url ||
      !allowed(sender.url) ||
      !sender.documentId
    )
      throw new Error('Invalid content-script sender.');
    const tab = await chrome.tabs.get(sender.tab.id);
    if (!tab.url || !allowed(tab.url)) throw new Error('The tab left the allowed host.');
    const frame = await chrome.webNavigation.getFrame({ tabId: sender.tab.id, frameId: 0 });
    if (!frame || frame.documentId !== sender.documentId)
      throw new Error('The sender document is no longer current.');
    const identity = { tabId: sender.tab.id, documentId: sender.documentId, route: tab.url };
    const previous = await getCheckpoint();
    if (message.type === 'hello') {
      // Browser-provided document identity is authoritative, never the content payload.
      if (routeKey(message.route) !== routeKey(identity.route))
        throw new Error('Stale route handshake.');
      const selected = (await chrome.storage.session.get('selectedTab')).selectedTab;
      if (
        (selected && selected !== identity.tabId) ||
        (previous && previous.identity.tabId !== identity.tabId)
      )
        return { ok: false, error: 'Another tab owns the current run.' };
      if (previous && (await revokedRuns()).includes(previous.runId)) {
        const route = routeIdentity(identity.route);
        const replacement: Snapshot = {
          ...previous,
          identity,
          runId: crypto.randomUUID(),
          seq: previous.seq + 1,
          state: 'stopped',
          handoff: undefined,
          book: route?.book ?? previous.book,
          section: route?.section ?? previous.section,
          action: 'Stopped. Choose your settings and start a new run.',
        };
        await publish(replacement);
        return { ok: true, identity, previous: replacement, resume: false };
      }
      const handoff = previous?.handoff;
      const resume = !!(
        previous &&
        previous.identity.tabId === identity.tabId &&
        handoff &&
        matchesHandoff(handoff, identity.route)
      );
      if (previous && sameIdentity(previous.identity, identity))
        return { ok: true, identity, previous, resume: false };
      const prior =
        previous &&
        activeStates.includes(previous.state) &&
        previous.identity.tabId === identity.tabId
          ? {
              ...previous,
              identity,
              seq: previous.seq + 1,
              state: 'paused' as const,
              book: resume
                ? handoff!.book
                : (routeIdentity(identity.route)?.book ?? 'No recognized book'),
              section: resume ? handoff!.section : (routeIdentity(identity.route)?.section ?? '—'),
              settings: resume
                ? previous.settings
                : { ...previous.settings, scope: 'section' as const },
              visited: resume ? [...previous.visited, routeKey(identity.route)] : previous.visited,
              action: resume
                ? 'Navigation destination matched. Waiting for section readiness.'
                : 'Document changed. Rescan and resume explicitly.',
            }
          : undefined;
      if (prior) await publish(prior);
      return {
        ok: true,
        identity,
        previous: prior,
        resume,
        handoffToken: resume ? handoff!.token : undefined,
      };
    }
    const incoming = message.snapshot;
    if ((await revokedRuns()).includes(incoming.runId))
      throw new Error('This run was stopped. Start a new run explicitly.');
    if (!sameIdentity(identity, incoming.identity))
      throw new Error('Checkpoint sender identity mismatch.');
    if (previous) {
      if (previous.identity.tabId !== identity.tabId)
        throw new Error('Another tab owns the current run.');
      if (sameIdentity(previous.identity, incoming.identity)) {
        if (incoming.runId !== previous.runId || incoming.seq <= previous.seq)
          throw new Error('Stale checkpoint rejected.');
      } else if (
        previous.identity.tabId === identity.tabId &&
        activeStates.includes(previous.state)
      )
        throw new Error('Document must complete a fresh handshake.');
    }
    const selected = (await chrome.storage.session.get('selectedTab')).selectedTab;
    if (selected && selected !== identity.tabId)
      throw new Error('Connect to this tab before checkpointing.');
    await publish(incoming);
    return { ok: true };
  }
  chrome.runtime.onMessage.addListener((raw, sender, respond) => {
    // Listener registration is synchronous; serialize ownership changes, not content execution.
    const type = (raw as { type?: string } | null)?.type;
    const reply = (work: Promise<unknown>) =>
      work.then(respond, (error) =>
        respond({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Request rejected or disconnected. Reconnect and inspect the current tab.',
        }),
      );
    if (type === 'command' || type === 'panel' || type === 'inspect' || type === 'focus')
      void reply(handle(raw, sender));
    else queue = reply(queue.catch(() => {}).then(() => handle(raw, sender)));
    return true;
  });
  chrome.tabs.onActivated.addListener((info) => {
    void (async () => {
      const previous = await getCheckpoint();
      if (
        !previous ||
        previous.identity.tabId === info.tabId ||
        !previous.settings.pauseHidden ||
        !['running', 'waiting', 'scanning'].includes(previous.state)
      )
        return;
      await chrome.tabs.sendMessage(
        previous.identity.tabId,
        {
          ...envelope(),
          type: 'command',
          command: 'pause',
          runId: previous.runId,
          identity: previous.identity,
        },
        { documentId: previous.identity.documentId },
      );
    })().catch(() => {});
  });
  chrome.action.onClicked.addListener((tab) => {
    if (tab.windowId !== undefined) void chrome.sidePanel.open({ windowId: tab.windowId });
  });
  const navigation = (event: chrome.webNavigation.WebNavigationBaseCallbackDetails) => {
    if (event.frameId !== 0) return;
    void chrome.tabs
      .sendMessage(event.tabId, { type: 'route-changed', url: event.url }, { frameId: 0 })
      .catch(() => {});
    queue = queue
      .catch(() => {})
      .then(async () => {
        const previous = await getCheckpoint();
        if (
          !previous ||
          previous.identity.tabId !== event.tabId ||
          !activeStates.includes(previous.state)
        )
          return;
        if (previous.handoff && allowed(event.url) && matchesHandoff(previous.handoff, event.url))
          return;
        if (routeKey(event.url) === routeKey(previous.identity.route)) return;
        await publish({
          ...previous,
          state: 'paused',
          action: 'Navigation changed. Reconnect and start from the current section.',
          seq: previous.seq + 1,
          handoff: undefined,
        });
      });
  };
  chrome.webNavigation.onCommitted.addListener(navigation);
  chrome.webNavigation.onHistoryStateUpdated.addListener(navigation);
  chrome.tabs.onRemoved.addListener((tabId) => {
    queue = queue
      .catch(() => {})
      .then(async () => {
        const previous = await getCheckpoint();
        if (previous?.identity.tabId === tabId) {
          await chrome.storage.session.remove(['checkpoint', 'selectedTab']);
          await chrome.action.setBadgeText({ text: '' });
        }
      });
  });
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.discarded) {
      queue = queue
        .catch(() => {})
        .then(async () => {
          const previous = await getCheckpoint();
          if (previous?.identity.tabId === tabId)
            await publish({
              ...previous,
              state: 'paused',
              action: 'Tab discarded. Reconnect before resuming.',
              seq: previous.seq + 1,
            });
        });
    }
  });
});
