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

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Merge `patch` into the override for `loc`. Returns nothing; notifies subscribers. */
export function setOverride(loc: string, patch: Record<string, unknown>): void {
  const current = overrides.get(loc);
  overrides.set(loc, Object.freeze({ ...current, ...patch }));
  emit();
}

/** Replace the override for `loc` wholesale (used when reverting to a known state). */
export function replaceOverride(loc: string, next: Record<string, unknown> | null): void {
  if (next == null) {
    overrides.delete(loc);
  } else {
    overrides.set(loc, Object.freeze({ ...next }));
  }
  emit();
}

export function clearOverride(loc: string): void {
  if (overrides.delete(loc)) emit();
}

export function clearAll(): void {
  if (overrides.size === 0) return;
  overrides.clear();
  emit();
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
