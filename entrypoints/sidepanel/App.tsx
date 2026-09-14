import { useEffect, useState } from 'react';
import {
  Snapshot as SnapshotSchema,
  Settings as SettingsSchema,
  defaults,
  envelope,
  type ActivityKind,
  type Command,
  type Settings,
  type Snapshot,
} from '../../src/protocol/schema';
import { settingsProblem } from '../../src/core/settings';
import { counts } from '../../src/core/state';
import { diagnostic } from '../../src/diagnostics';
const labels: Record<ActivityKind, string> = {
  animation: 'Animations',
  single_choice: 'Multiple choice',
  short_answer: 'Short answers',
  matching: 'Term matching',
  ordered_blocks: 'Ordered blocks',
  unknown: 'Unrecognized widget',
};
const statusLabel = (status: string) => status.replaceAll('_', ' ');
const symbols: Record<string, string> = {
  complete: '✓',
  already_complete: '✓',
  queued: '○',
  running: '▶',
  waiting: '◷',
  needs_attention: '!',
  failed: '!',
  skipped: '↷',
  unsupported: '—',
};
function exportJson(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [settings, setSettings] = useState<Settings>(defaults);
  const [activeTab, setActiveTab] = useState<number | null>(null);
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('Connecting to your section…');
  const [now, setNow] = useState(Date.now());
  const [report, setReport] = useState<unknown>(null);
  async function connect() {
    try {
      const response = await chrome.runtime.sendMessage({ ...envelope(), type: 'panel' });
      if (!response?.ok)
        throw new Error('Connection unavailable. Reload the extension and section.');
      const parsed = SnapshotSchema.safeParse(response.snapshot);
      setSnapshot(parsed.success ? parsed.data : null);
      setActiveTab(response.activeTabId);
      setSettings(
        parsed.success && !['idle', 'stopped', 'finished', 'error'].includes(parsed.data.state)
          ? parsed.data.settings
          : (response.preferences ?? defaults),
      );
      setNotice(
        parsed.success
          ? response.activeTabId !== parsed.data.identity.tabId &&
            ['scanning', 'running', 'waiting', 'paused', 'needs_attention', 'navigating'].includes(
              parsed.data.state,
            )
            ? 'This run is pinned to another tab. Stop it before connecting to a different section.'
            : 'Connected to the pinned tab.'
          : 'Open a zyBooks section, then connect.',
      );
    } catch {
      setNotice('Cannot connect. Open a zyBooks section and reload it after installing ZyFlow.');
    }
  }
  useEffect(() => {
    void connect();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'session' || !changes.checkpoint) return;
      const parsed = SnapshotSchema.safeParse(changes.checkpoint.newValue);
      setSnapshot((current) =>
        parsed.success &&
        (!current ||
          parsed.data.identity.documentId !== current.identity.documentId ||
          parsed.data.seq > current.seq)
          ? parsed.data
          : changes.checkpoint?.newValue
            ? current
            : null,
      );
    };
    const activate = (info: { tabId: number; windowId: number }) => setActiveTab(info.tabId);
    chrome.storage.onChanged.addListener(listener);
    chrome.tabs.onActivated.addListener(activate);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
      chrome.tabs.onActivated.removeListener(activate);
      clearInterval(timer);
    };
  }, []);
  async function command(command: Command['command'], itemId?: string) {
    if (!snapshot || pending) return;
    if (command === 'start') {
      const problem = settingsProblem(settings, snapshot.section);
      if (problem) {
        setNotice(problem);
        return;
      }
    }
    setPending(command);
    setNotice(`${statusLabel(command)} request sent — waiting for acknowledgement…`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        chrome.runtime.sendMessage({
          ...envelope(),
          type: 'command',
          command,
          runId: snapshot.runId,
          identity: snapshot.identity,
          itemId,
          settings: command === 'start' ? settings : undefined,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error('Acknowledgement timed out. Reconnect to inspect the actual run state.'),
              ),
            10000,
          );
        }),
      ]);
      if (!response?.ok)
        throw new Error(response?.error ?? 'The runner did not acknowledge this request.');
      setNotice(`${statusLabel(command)} acknowledged. The status below reflects the runner.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      clearTimeout(timer);
      setPending('');
    }
  }
  function updateSettings(next: Settings) {
    setSettings(next);
    if (!SettingsSchema.safeParse(next).success) return;
    void chrome.runtime
      .sendMessage({ ...envelope(), type: 'preferences', settings: next })
      .then((response) => {
        if (!response?.ok) throw new Error('Preferences unavailable');
      })
      .catch(() => setNotice('Preferences could not be saved.'));
  }
  async function focusTab() {
    if (!snapshot || pending) return;
    setPending('focus');
    setNotice('Opening the connected tab…');
    try {
      const response = await chrome.runtime.sendMessage({
        ...envelope(),
        type: 'focus',
        identity: snapshot.identity,
      });
      if (!response?.ok) throw new Error(response?.error ?? 'The tab could not be opened.');
      setActiveTab(snapshot.identity.tabId);
      setNotice('Connected tab opened. Resume when you are ready.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The tab could not be opened.');
    } finally {
      setPending('');
    }
  }
  const totals = snapshot ? counts(snapshot) : null;
  const verified = totals ? totals.complete + totals.already_complete : 0;
  const total = snapshot?.items.length ?? 0;
  const live = !!snapshot && now - snapshot.heartbeatAt < 12000;
  const busy =
    !!snapshot && ['scanning', 'running', 'waiting', 'navigating'].includes(snapshot.state);
  const configurable =
    !snapshot || ['idle', 'stopped', 'finished', 'error'].includes(snapshot.state);
  const settingsError = settingsProblem(settings, snapshot?.section);
  const age = (time: number) =>
    !time
      ? 'No progress yet'
      : now - time < 2000
        ? 'Just now'
        : `${Math.max(0, Math.floor((now - time) / 1000))}s ago`;
  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            z<span>f</span>
          </span>
          <div>
            <strong>ZyFlow</strong>
            <span className="eyebrow">A little more clarity.</span>
          </div>
        </div>
        <span className="preview">Preview 0.1.1</span>
      </header>
      <section className="connection" aria-label="Connected section">
        <div>
          <span className={`dot ${live ? 'online' : ''}`} />
          {snapshot
            ? live
              ? 'Connected section'
              : 'Last connected section'
            : 'No section connected'}
        </div>
        <h1>{snapshot ? `Section ${snapshot.section}` : 'Your next step starts here.'}</h1>
        <p className="book">{snapshot?.book ?? 'Open your zyBooks tab to get started.'}</p>
        <div className="connection-bottom">
          <span>
            {snapshot
              ? `Pinned to tab ${snapshot.identity.tabId}`
              : 'Uses your existing browser session'}
          </span>
          <button
            className="text-button"
            onClick={() => {
              setNotice('Connecting…');
              void connect();
            }}
          >
            Connect
          </button>
        </div>
      </section>
      {snapshot && activeTab !== snapshot.identity.tabId && (
        <div className="callout">
          <p>You switched tabs. Controls still apply to the pinned section.</p>
          <button className="text-button" disabled={!!pending} onClick={() => void focusTab()}>
            Go to connected tab
          </button>
        </div>
      )}
      <p className="compatibility">
        <span aria-hidden="true">ⓘ</span>{' '}
        {import.meta.env.MODE === 'fixture'
          ? 'Fixture Lab · synthetic activities, real extension actions.'
          : 'Supports inspected animation and single-choice widgets. Other widget types stop for inspection.'}
      </p>
      <section className="run-card" aria-label="Run progress">
        <div className="section-heading">
          <span className="eyebrow">YOUR RUN</span>
          <span className={`state ${snapshot?.state ?? 'idle'}`} data-testid="run-state">
            {statusLabel(snapshot?.state ?? 'idle')}
          </span>
        </div>
        <div className="progress-number">
          <strong>{verified}</strong>
          <span>
            {' '}
            / {total}
            <small>activities verified</small>
          </span>
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="20" />
            <circle
              className="meter"
              cx="24"
              cy="24"
              r="20"
              strokeDasharray={`${total ? (verified / total) * 126 : 0} 126`}
            />
          </svg>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Verified activities"
          aria-valuemin={0}
          aria-valuemax={Math.max(1, total)}
          aria-valuenow={verified}
        >
          <span style={{ width: `${total ? (verified / total) * 100 : 0}%` }} />
        </div>
        <p className="action" aria-live="polite" data-testid="current-action">
          {snapshot?.action ?? 'Choose your scope, then start a scan.'}
        </p>
        <div className="metrics">
          <span>
            Progress <b>{age(snapshot?.progressAt ?? 0)}</b>
          </span>
          <span>
            Heartbeat <b>{live ? 'Connected' : 'No recent signal'}</b>
          </span>
        </div>
        <div className="controls">
          {configurable && (
            <button
              className="primary"
              disabled={!snapshot || !!pending || !!settingsError}
              aria-describedby={settingsError ? 'settings-error' : undefined}
              onClick={() => void command('start')}
            >
              {pending === 'start' ? 'Start requested…' : '▶ Start run'}
            </button>
          )}
          {busy && (
            <button
              className="primary"
              disabled={!!pending}
              aria-label="Pause"
              onClick={() => void command('pause')}
            >
              Ⅱ Pause
            </button>
          )}
          {snapshot && ['paused', 'needs_attention'].includes(snapshot.state) && (
            <button
              className="primary"
              disabled={!!pending}
              aria-label="Resume"
              onClick={() => void command('resume')}
            >
              ▶ Resume
            </button>
          )}
          <button
            disabled={!snapshot || !!pending || snapshot.state === 'stopped'}
            onClick={() => void command('stop')}
          >
            Stop
          </button>
        </div>
        <p className="request-status" role="status">
          {notice}
        </p>
      </section>
      <details className="scope" open={configurable}>
        <summary>
          Run settings{' '}
          <span>
            {settings.scope === 'section'
              ? 'Current section'
              : `Through ${settings.endSection || '…'}`}
          </span>
        </summary>
        <fieldset disabled={!configurable || !!pending}>
          <legend>Run scope</legend>
          {settingsError && (
            <p id="settings-error" className="form-error" role="alert">
              {settingsError}
            </p>
          )}
          <label className="field">
            Continue through
            <select
              aria-label="Run scope"
              value={settings.scope}
              onChange={(e) =>
                updateSettings({ ...settings, scope: e.target.value as Settings['scope'] })
              }
            >
              <option value="section">Current section only</option>
              <option value="range">A bounded section range</option>
            </select>
          </label>
          {settings.scope === 'range' && (
            <div className="range-fields">
              <label className="field">
                End section
                <input
                  placeholder="2.4"
                  aria-invalid={!!settingsError}
                  aria-describedby={settingsError ? 'settings-error' : undefined}
                  value={settings.endSection}
                  onChange={(e) => updateSettings({ ...settings, endSection: e.target.value })}
                />
              </label>
              <label className="field">
                Section limit
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.maxSections}
                  onChange={(e) =>
                    updateSettings({ ...settings, maxSections: Number(e.target.value) })
                  }
                />
              </label>
            </div>
          )}
          <span className="field-label">Activity families</span>
          <div className="filters">
            {Object.entries(labels)
              .filter(([kind]) => kind !== 'unknown')
              .map(([kind, label]) => (
                <label key={kind}>
                  <input
                    type="checkbox"
                    checked={settings.kinds.includes(kind as ActivityKind)}
                    onChange={(e) =>
                      updateSettings({
                        ...settings,
                        kinds: e.target.checked
                          ? [...settings.kinds, kind as ActivityKind]
                          : settings.kinds.filter((k) => k !== kind),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
          </div>
          <label className="hidden-option">
            <input
              type="checkbox"
              checked={settings.pauseHidden}
              onChange={(e) => updateSettings({ ...settings, pauseHidden: e.target.checked })}
            />
            Pause when the connected tab is hidden
          </label>
        </fieldset>
      </details>
      <section className="ledger">
        <div className="section-heading">
          <h2>Activity ledger</h2>
          <span>{total} found</span>
        </div>
        {totals && (
          <div className="count-grid">
            {(
              [
                ['This run', totals.complete],
                ['Already done', totals.already_complete],
                ['Queued', totals.queued],
                ['Unsupported', totals.unsupported],
                ['Skipped', totals.skipped],
                ['Failed', totals.failed],
              ] as const
            ).map(([label, count]) => (
              <div key={label}>
                <b>{count}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}
        {!!totals?.needs_attention && (
          <p className="attention-count" aria-live="polite">
            {totals.needs_attention} needs attention
          </p>
        )}
        {!total ? (
          <div className="empty">
            <span aria-hidden="true">☷</span>
            <h3>Every step, accounted for.</h3>
            <p>
              Your scan will list each activity, its verified outcome, and anything that needs a
              closer look.
            </p>
          </div>
        ) : (
          <ol>
            {snapshot!.items.map((item, index) => (
              <li key={`${item.section}:${item.id}`}>
                <span className={`item-symbol ${item.state}`} aria-hidden="true">
                  {symbols[item.state]}
                </span>
                <div className="item-detail">
                  <strong>
                    {labels[item.kind]}{' '}
                    <small>
                      {item.section} · {index + 1}
                    </small>
                  </strong>
                  <span className="item-state">{statusLabel(item.state)}</span>
                  {item.reason && <p>{item.reason}</p>}
                  <div className="item-actions">
                    {item.section === snapshot!.section && (
                      <button
                        className="text-button"
                        disabled={!!pending}
                        onClick={() => void command('show', item.id)}
                      >
                        Show on page
                      </button>
                    )}
                    {[
                      'needs_attention',
                      'unsupported',
                      'failed',
                      'waiting',
                      'running',
                      'queued',
                    ].includes(item.state) &&
                      ['paused', 'needs_attention'].includes(snapshot!.state) && (
                        <>
                          <button
                            className="text-button"
                            disabled={!!pending || item.kind === 'unknown'}
                            onClick={() => void command('retry', item.id)}
                          >
                            Retry
                          </button>
                          <button
                            className="text-button"
                            disabled={!!pending}
                            onClick={() => void command('skip', item.id)}
                          >
                            Skip
                          </button>
                        </>
                      )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
      <details className="diagnostics">
        <summary>Diagnostics & compatibility</summary>
        <p>
          Export contains bounded state and counts. Question text, answers, credentials, and URL
          parameters are excluded.
        </p>
        <div className="diagnostic-buttons">
          <button onClick={() => exportJson(diagnostic(snapshot), 'zyflow-diagnostics.json')}>
            Export diagnostics
          </button>
          <button
            disabled={!snapshot}
            onClick={() => {
              setNotice('Inspecting page structure…');
              void chrome.runtime
                .sendMessage({ ...envelope(), type: 'inspect', identity: snapshot!.identity })
                .then((response) => {
                  if (!response?.ok) throw new Error();
                  setReport(response.report);
                  setNotice('Read-only inspection complete.');
                })
                .catch(() => setNotice('Inspection unavailable. Reconnect to the section.'));
            }}
          >
            Inspect page
          </button>
        </div>
        {report !== null && (
          <>
            <pre>{JSON.stringify(report, null, 2)}</pre>
            <button onClick={() => exportJson(report, 'zyflow-structure.json')}>
              Export structural report
            </button>
          </>
        )}
      </details>
      <footer>
        Verified page evidence · LMS grade unknown
        <br />
        <span>Runs locally. No account or API key needed.</span>
      </footer>
    </div>
  );
}
