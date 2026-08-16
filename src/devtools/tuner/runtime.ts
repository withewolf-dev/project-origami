import { useSyncExternalStore } from 'react';

import { getOverride, getVersion, subscribe } from './store';

/**
 * Subscribes a component to override changes (docs/tuner/TODO.md, 3.3).
 *
 * The plugin injects a call to this at the top of every component that
 * contains stamped JSX — a legal hook position, unlike the JSX expressions
 * themselves. Without it, memoisation boundaries (React Navigation memoises
 * inactive scenes) stop a root-level re-render from ever reaching the element
 * being tuned: the store updates and nothing repaints.
 */
export function useTunerVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

/**
 * The function the babel plugin injects around every host element's `style`
 * (docs/tuner/TODO.md, 3.2).
 *
 * Deliberately NOT a hook. The plugin rewrites JSX wherever it appears —
 * inside `.map()` callbacks, conditionals, early returns — and a hook in any
 * of those positions violates the Rules of Hooks. Re-rendering is driven
 * instead by a version bump at the tuner root (3.3).
 *
 * Returns `style` by identity when no override exists, so the common case
 * allocates nothing and does not defeat memoisation.
 */
export function resolveStyle(loc: string, style: unknown): unknown {
  const override = getOverride(loc);
  if (!override) return style;

  // RN flattens arrays left → right, so appending gives the override
  // precedence over whatever the source declared.
  if (Array.isArray(style)) return [...style, override];
  if (style == null) return override;
  return [style, override];
}
