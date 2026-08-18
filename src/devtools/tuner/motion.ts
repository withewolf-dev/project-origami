import { getOverride } from './store';
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
export type MotionRanges = Record<string, { min: number; max: number; step: number }>;

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
