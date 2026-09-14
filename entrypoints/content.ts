import { defineContentScript } from 'wxt/utils/define-content-script';
import { Runner } from '../src/core/runner';
import { Registry } from '../src/adapters/registry';
import { Command, envelope, type Snapshot } from '../src/protocol/schema';
import { inspectStructure } from '../src/diagnostics';
import { routeKey } from '../src/navigation/routes';
export default defineContentScript({
  matches:
    import.meta.env.MODE === 'fixture'
      ? ['https://learn.zybooks.com/*', 'http://localhost/*']
      : ['https://learn.zybooks.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    let runner: Runner | undefined;
    let connecting: Promise<void> | undefined;
    let currentRoute = location.href;
    let disposed = false;
    let commands: Promise<unknown> = Promise.resolve();
    const save = async (snapshot: Snapshot) => {
      const response = await chrome.runtime.sendMessage({
        ...envelope(),
        type: 'checkpoint',
        snapshot,
      });
      if (!response?.ok) throw new Error('Checkpoint was rejected. Reconnect before continuing.');
    };
    async function connect() {
      if (connecting) return connecting;
      connecting = (async () => {
        const response = await chrome.runtime.sendMessage({
          ...envelope(),
          type: 'hello',
          documentId: crypto.randomUUID(),
          route: location.href,
        });
        if (!response?.ok || disposed) return;
        runner?.dispose();
        runner = new Runner(
          response.identity,
          new Registry(import.meta.env.MODE === 'fixture'),
          save,
          response.previous,
        );
        await runner.heartbeat();
        if (response.resume && response.handoffToken === response.previous?.handoff?.token) {
          await runner.command({
            ...envelope(),
            type: 'command',
            command: 'resume',
            runId: runner.snapshot.runId,
            identity: runner.snapshot.identity,
          });
        }
      })().finally(() => {
        connecting = undefined;
      });
      return connecting;
    }
    const listener = (
      raw: unknown,
      sender: chrome.runtime.MessageSender,
      respond: (response: unknown) => void,
    ) => {
      if (sender.id !== chrome.runtime.id || sender.tab) return false;
      const rawType = (raw as { type?: string } | null)?.type;
      if (rawType === 'route-changed') {
        void checkRoute();
        respond({ ok: true });
        return false;
      }
      if (rawType === 'get-snapshot') {
        void (async () => {
          if (!runner) await connect();
          respond({ ok: !!runner, snapshot: runner?.snapshot });
        })();
        return true;
      }
      if (rawType === 'inspect') {
        respond({ ok: true, report: inspectStructure() });
        return false;
      }
      const command = Command.safeParse(raw);
      if (!command.success || !runner) {
        respond({ ok: false, error: 'Runner is not connected.' });
        return false;
      }
      commands = commands
        .catch(() => {})
        .then(() => runner!.command(command.data))
        .then(
          () => respond({ ok: true }),
          (error) =>
            respond({
              ok: false,
              error: error instanceof Error ? error.message : 'Command failed.',
            }),
        );
      return true;
    };
    async function checkRoute() {
      if (routeKey(location.href) === routeKey(currentRoute)) return;
      currentRoute = location.href;
      runner?.dispose();
      runner = undefined;
      await connect().catch(() => {});
    }
    chrome.runtime.onMessage.addListener(listener);
    const hidden = () => {
      if (
        document.hidden &&
        runner?.snapshot.settings.pauseHidden &&
        ['running', 'waiting', 'scanning'].includes(runner.snapshot.state)
      )
        void runner
          .pauseForNavigation('Paused because the connected tab is hidden.')
          .catch(() => {});
    };
    document.addEventListener('visibilitychange', hidden);
    const timer = setInterval(() => {
      void checkRoute();
      if (
        runner?.snapshot.state === 'navigating' &&
        runner.snapshot.handoff &&
        Date.now() - runner.snapshot.handoff.created > 15000
      )
        void runner
          .pauseForNavigation('Navigation timed out. Confirm the destination before resuming.')
          .catch(() => {});
      if (runner)
        void runner.heartbeat().catch(() => {
          runner?.dispose();
          runner = undefined;
        });
      else void connect().catch(() => {});
    }, 3000);
    void connect().catch(() => {});
    ctx.onInvalidated(() => {
      disposed = true;
      runner?.dispose();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', hidden);
      chrome.runtime.onMessage.removeListener(listener);
    });
  },
});
