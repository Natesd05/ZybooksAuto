import type { ActivityKind } from '../protocol/schema';
export interface Ref {
  id: string;
  kind: ActivityKind;
}
export interface Inspection {
  ref: Ref;
  signature: string;
  evidence: string;
  complete: boolean;
  root: HTMLElement;
}
export interface Plan {
  ref: Ref;
  signature: string;
  operation: 'click' | 'fill' | 'drop' | 'wait';
  target: string;
  values?: Record<string, string>;
  source?: string;
  description: string;
}
export interface Context {
  signal: AbortSignal;
  generation: number;
  assertCurrent(): void;
}
export interface Adapter {
  kind: ActivityKind;
  detect(root: HTMLElement): boolean;
  inspect(ref: Ref): Inspection;
  plan(before: Inspection): Plan | null;
  execute(plan: Plan, context: Context): void;
  verify(before: Inspection, context: Context): Promise<Inspection>;
}
/** Future reasoning returns validated data, never executable code; no provider ships in v1. */
export interface AnswerProvider {
  fields(
    input: { activityId: string; signature: string; fieldIds: string[] },
    signal: AbortSignal,
  ): Promise<{ signature: string; values: Record<string, string> }>;
  arrangement(
    input: { activityId: string; signature: string; blockIds: string[] },
    signal: AbortSignal,
  ): Promise<{ signature: string; blocks: { id: string; indent: number }[] }>;
}
