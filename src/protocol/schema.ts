import { z } from 'zod';
export const PROTOCOL_VERSION = 1 as const;
export const Kind = z.enum([
  'animation',
  'single_choice',
  'short_answer',
  'matching',
  'ordered_blocks',
  'unknown',
]);
export type ActivityKind = z.infer<typeof Kind>;
export const RunState = z.enum([
  'idle',
  'scanning',
  'running',
  'waiting',
  'paused',
  'navigating',
  'needs_attention',
  'stopped',
  'error',
  'finished',
]);
export type RunState = z.infer<typeof RunState>;
export const ItemState = z.enum([
  'queued',
  'already_complete',
  'running',
  'waiting',
  'complete',
  'needs_attention',
  'skipped',
  'unsupported',
  'failed',
]);
export type ItemState = z.infer<typeof ItemState>;
const Id = z.string().min(1).max(160);
export const Identity = z.object({
  tabId: z.number().int().nonnegative(),
  documentId: Id,
  route: z.string().max(2048),
});
export type Identity = z.infer<typeof Identity>;
export const Settings = z.object({
  kinds: z.array(Kind).max(6),
  scope: z.enum(['section', 'range']),
  endSection: z
    .string()
    .regex(/^\d+\.\d+$/)
    .or(z.literal('')),
  maxSections: z.number().int().min(1).max(20),
  pauseHidden: z.boolean(),
});
export type Settings = z.infer<typeof Settings>;
export const defaults: Settings = {
  kinds: ['animation', 'single_choice', 'short_answer', 'matching', 'ordered_blocks'],
  scope: 'section',
  endSection: '',
  maxSections: 10,
  pauseHidden: true,
};
export const Item = z.object({
  id: Id,
  kind: Kind,
  state: ItemState,
  reason: z.string().max(300).optional(),
  actions: z.number().int().nonnegative(),
  section: z.string().max(100),
});
export type Item = z.infer<typeof Item>;
export const Handoff = z.object({
  token: Id,
  destination: z.string().max(2048),
  book: Id,
  section: Id,
  fromDocument: Id,
  created: z.number(),
});
export type Handoff = z.infer<typeof Handoff>;
export const Snapshot = z.object({
  protocolVersion: z.literal(1),
  runnerVersion: z.string().max(40).optional(),
  runId: Id,
  identity: Identity,
  seq: z.number().int().nonnegative(),
  state: RunState,
  book: z.string().max(160),
  section: z.string().max(100),
  items: z.array(Item).max(2000),
  action: z.string().max(300),
  progressAt: z.number(),
  heartbeatAt: z.number(),
  settings: Settings,
  uncertain: z.object({ id: Id, section: z.string().max(100) }).optional(),
  visited: z.array(z.string().max(2048)).max(20),
  handoff: Handoff.optional(),
  compatible: z.boolean(),
});
export type Snapshot = z.infer<typeof Snapshot>;
const Envelope = z.object({ protocolVersion: z.literal(1), requestId: Id });
export const Command = Envelope.extend({
  type: z.literal('command'),
  command: z.enum(['start', 'pause', 'resume', 'stop', 'retry', 'skip', 'show']),
  runId: Id,
  identity: Identity,
  itemId: Id.optional(),
  inactive: z.boolean().optional(),
  settings: Settings.optional(),
});
export type Command = z.infer<typeof Command>;
export const Message = z.discriminatedUnion('type', [
  Command,
  Envelope.extend({ type: z.literal('hello'), documentId: Id, route: z.string().max(2048) }),
  Envelope.extend({ type: z.literal('checkpoint'), snapshot: Snapshot }),
  Envelope.extend({ type: z.literal('panel') }),
  Envelope.extend({ type: z.literal('inspect'), identity: Identity }),
  Envelope.extend({ type: z.literal('focus'), identity: Identity }),
  Envelope.extend({ type: z.literal('preferences'), settings: Settings }),
]);
export const envelope = () => ({
  protocolVersion: PROTOCOL_VERSION,
  requestId: crypto.randomUUID(),
});
export function sameIdentity(a: Identity, b: Identity) {
  return a.tabId === b.tabId && a.documentId === b.documentId && a.route === b.route;
}
export function accepts(snapshot: Snapshot, command: Command) {
  return sameIdentity(snapshot.identity, command.identity) && snapshot.runId === command.runId;
}
export const activeStates: RunState[] = [
  'scanning',
  'running',
  'waiting',
  'paused',
  'navigating',
  'needs_attention',
];
