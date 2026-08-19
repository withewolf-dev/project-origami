import { getOverride, subscribe } from './store';
import type { MotionInfo } from './types';

/**
 * Tunable motion constants (Tier 1 follow-on: "make it faster / softer").
 *
 * Style keys live on elements; animation parameters live in module-level
 * constants, which no element loc can reach. A file declares its motion once
 * with `registerMotion`, reads live values with `liveMotion`, and the tuner
 * offers a Motion section whenever the selected element belongs to that file.
 * Saving writes the constant's literals back through /__tuner/write-const.
 *
 * Overrides share the ordinary store under a `motion:` key namespace, so
 * undo, discard-on-exit, and live repaint all work unchanged.
 */
export type MotionSpec = Record<string, number>;
export type MotionRanges = Record<
  string,
  { min: number; max: number; step: number; label?: string }
>;

type Entry = { id: string; name: string; spec: MotionSpec; ranges?: MotionRanges };

const registry = new Map<string, Entry>();

/** `id` is the source file — the writer edits `const <name> = { … }` there. */
export function registerMotion(
  id: string,
  name: string,
  spec: MotionSpec,
  ranges?: MotionRanges,
): void {
  registry.set(id, { id, name, spec, ranges });
}

export function motionKey(id: string): string {
  return `motion:${id}`;
}

/** Declared values merged with any pending override. */
export function liveMotion<T extends MotionSpec>(id: string, spec: T): T {
  const override = getOverride(motionKey(id));
  return override ? ({ ...spec, ...override } as T) : spec;
}

/**
 * The Motion section for an element's loc, or null. Ranges default to
 * 0…4× the declared value, so a spec needs no configuration to be tunable.
 */
// ---- replay (the part that makes tuning motion mean anything) ----
// A component registers how to demo itself; scrubbing a motion value
// re-fires that demo automatically (debounced), so the feel is always live.

const replayFns = new Map<string, () => void>();
const replayTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastSnapshots = new Map<string, string>();

export function registerMotionReplay(id: string, fn: () => void): () => void {
  replayFns.set(id, fn);
  return () => {
    if (replayFns.get(id) === fn) replayFns.delete(id);
  };
}

export function replayMotion(id: string): void {
  replayFns.get(id)?.();
}

// Auto-replay: watch the store for motion-key changes. Module-level and
// dev-only (this whole module is), so no component wiring is needed.
subscribe(() => {
  for (const id of replayFns.keys()) {
    const snapshot = JSON.stringify(getOverride(motionKey(id)) ?? null);
    if (snapshot === lastSnapshots.get(id)) continue;
    lastSnapshots.set(id, snapshot);
    clearTimeout(replayTimers.get(id));
    replayTimers.set(id, setTimeout(() => replayMotion(id), 160));
  }
});

export function motionForLoc(loc: string | null): MotionInfo | null {
  if (!loc) return null;
  const file = loc.split(':')[0];
  const entry = registry.get(file);
  if (!entry) return null;
  return {
    id: entry.id,
    name: entry.name,
    spec: entry.spec,
    values: liveMotion(entry.id, entry.spec),
    ranges: entry.ranges,
  };
}
