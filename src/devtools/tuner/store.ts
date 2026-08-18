/**
 * Pending style overrides, keyed by source location (docs/tuner/TODO.md, 3.1).
 *
 * Dev-only, plain module state — no React, no deps, so the babel-injected
 * runtime can read it from anywhere without import cycles. Overrides are the
 * *unsaved* layer: they render instantly while you drag a control, and are
 * cleared once the value has been written back to source (Phase 6).
 */

export type StyleOverride = Readonly<Record<string, unknown>>;

const overrides = new Map<string, StyleOverride>();
const listeners = new Set<() => void>();

/** Bumped on every mutation so subscribers can cheaply detect change. */
let version = 0;

/**
 * Undo (10.4): each user action pushes one GROUP of inverse snapshots —
 * "what was the override for this loc before". undo() pops a group and
 * restores it. Grouping matters for clearAll: one action, one undo.
 */
type UndoEntry = { loc: string; prev: StyleOverride | undefined };
const undoStack: UndoEntry[][] = [];
const UNDO_CAP = 100;

function record(locs: string[]): void {
  undoStack.push(locs.map((loc) => ({ loc, prev: overrides.get(loc) })));
  if (undoStack.length > UNDO_CAP) undoStack.shift();
}

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Merge `patch` into the override for `loc`. Returns nothing; notifies subscribers. */
export function setOverride(loc: string, patch: Record<string, unknown>): void {
  record([loc]);
  const current = overrides.get(loc);
  overrides.set(loc, Object.freeze({ ...current, ...patch }));
  emit();
}

/** Replace the override for `loc` wholesale (used when reverting to a known state). */
export function replaceOverride(loc: string, next: Record<string, unknown> | null): void {
  record([loc]);
  if (next == null) {
    overrides.delete(loc);
  } else {
    overrides.set(loc, Object.freeze({ ...next }));
  }
  emit();
}

export function clearOverride(loc: string): void {
  if (!overrides.has(loc)) return;
  record([loc]);
  overrides.delete(loc);
  emit();
}

export function clearAll(): void {
  if (overrides.size === 0) return;
  record(Array.from(overrides.keys()));
  overrides.clear();
  emit();
}

/** Restore the state before the most recent action. No-op on an empty stack. */
export function undo(): void {
  const group = undoStack.pop();
  if (!group) return;
  for (const { loc, prev } of group) {
    if (prev === undefined) overrides.delete(loc);
    else overrides.set(loc, prev);
  }
  emit();
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

/**
 * The override for `loc`, or undefined. Reference-stable between mutations,
 * so callers can use it as a memo key.
 */
export function getOverride(loc: string): StyleOverride | undefined {
  return overrides.get(loc);
}

export function getVersion(): number {
  return version;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
