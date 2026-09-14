import { Settings, Snapshot, defaults, type Snapshot as SnapshotType } from '../protocol/schema';
export async function getCheckpoint(): Promise<SnapshotType | null> {
  const stored = await chrome.storage.session.get('checkpoint');
  const result = Snapshot.safeParse(stored.checkpoint);
  return result.success ? result.data : null;
}
export async function saveCheckpoint(snapshot: SnapshotType) {
  await chrome.storage.session.set({ checkpoint: Snapshot.parse(snapshot) });
}
export async function getPreferences() {
  const stored = await chrome.storage.local.get('preferences');
  const result = Settings.safeParse(stored.preferences);
  return result.success ? result.data : defaults;
}
