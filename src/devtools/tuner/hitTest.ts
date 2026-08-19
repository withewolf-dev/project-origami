import { StyleSheet } from 'react-native';

import type { TunerHit } from './types';

/**
 * Pixel → source-location resolution (docs/tuner/TODO.md, tasks 2.3 / 2.4).
 *
 * Reaches the renderer through the React DevTools global hook rather than
 * importing `react-native/src/private/.../getInspectorDataForViewAtPoint`,
 * which is a private path Metro may stop resolving. Verified in task 1.3.
 *
 * Two hard-won constraints from 1.3, both load-bearing:
 *  - `inspectedView` MUST be a real host instance. Passing null throws
 *    `Cannot read property '__internalInstanceHandle' of null`.
 *  - x/y are relative to `inspectedView`, NOT the screen. Callers must pass
 *    the tuner root (which sits at the screen origin) so the two coincide.
 */

type InspectorHierarchyEntry = {
  name?: string | null;
  getInspectorData?: (findNodeHandle: (v: unknown) => unknown) => {
    props?: Record<string, unknown> | null;
  } | null;
};

type InspectorViewData = {
  frame?: { left: number; top: number; width: number; height: number } | null;
  props?: Record<string, unknown> | null;
  hierarchy?: InspectorHierarchyEntry[] | null;
};

type Renderer = {
  rendererConfig?: {
    getInspectorDataForViewAtPoint?: (
      inspectedView: unknown,
      x: number,
      y: number,
      callback: (viewData: InspectorViewData) => boolean,
    ) => void;
  };
};

/**
 * Keep only primitive style values. A flattened style can carry Animated
 * nodes (opacity: AnimatedValue, transform: [...]) which are CIRCULAR —
 * JSON.stringify throws on them, which killed selection of any animated
 * element mid-tap. Primitives are also exactly the set the tuner can edit.
 */
export function sanitizeStyle(
  flat: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!flat || typeof flat !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const kind = typeof value;
    if (kind === 'number' || kind === 'string' || kind === 'boolean') out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function readLoc(props: Record<string, unknown> | null | undefined): string | null {
  const value = props?.__tunerLoc;
  return typeof value === 'string' ? value : null;
}

/**
 * Hit-test a point and resolve it to the nearest stamped source location.
 * Returns null when the point hits nothing (or the renderer is unavailable).
 */
export function hitTestAtPoint(
  inspectedView: unknown,
  x: number,
  y: number,
): TunerHit | null {
  if (inspectedView == null) return null;

  const hook = (globalThis as Record<string, any>).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook?.renderers) return null;

  let hit: TunerHit | null = null;

  for (const renderer of Array.from(hook.renderers.values()) as Renderer[]) {
    if (hit) break;
    const getData = renderer?.rendererConfig?.getInspectorDataForViewAtPoint;
    if (typeof getData !== 'function') continue;

    try {
      getData(inspectedView, x, y, (viewData) => {
        const hierarchy = viewData?.hierarchy;
        if (!hierarchy?.length || !viewData?.frame) return false;

        // Prefer the closest instance's own stamp; otherwise walk the
        // hierarchy inner → outer (it is ordered outer → inner) for the
        // nearest stamped ancestor.
        let loc = readLoc(viewData.props);
        if (!loc) {
          for (let i = hierarchy.length - 1; i >= 0 && !loc; i--) {
            try {
              loc = readLoc(hierarchy[i]?.getInspectorData?.((v) => v)?.props);
            } catch {
              // A level that refuses inspection is not fatal; keep walking.
            }
          }
        }

        // `style` may be an object, an array, or a registered stylesheet id;
        // flatten resolves all three into a plain object.
        let style: Record<string, unknown> | null = null;
        try {
          style = sanitizeStyle(StyleSheet.flatten(viewData.props?.style as never));
        } catch {
          style = null;
        }

        hit = {
          frame: viewData.frame,
          loc,
          name: hierarchy[hierarchy.length - 1]?.name ?? null,
          hierarchy: hierarchy.map((entry) => entry?.name ?? '?'),
          style,
        };
        return true;
      });
    } catch {
      // Renderer refused this point — try the next renderer.
    }
  }

  return hit;
}
