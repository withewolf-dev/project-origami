/**
 * Fiber tree walker (docs/tuner/TODO.md, 8.2).
 *
 * Produces the Layers tree for the dashboard: every STAMPED element (host
 * elements carrying `__tunerLoc`) in render order, nested. Unstamped fibers —
 * custom components, navigators, providers — are traversed through, so their
 * stamped descendants hoist to the nearest stamped ancestor. No frames and no
 * styles in v1 (POC constraint): frames are measured on demand for the
 * selected element only (8.6).
 *
 * Reads fiber roots from the React DevTools global hook — the same hook
 * hitTest.ts already depends on. Everything here is dev-only.
 */

export type TreeNode = {
  loc: string;
  name: string;
  children: TreeNode[];
};

/** The few fiber fields the walk depends on, duck-typed. */
export type FiberLike = {
  child?: FiberLike | null;
  sibling?: FiberLike | null;
  type?: unknown;
  memoizedProps?: { [key: string]: unknown } | null;
};

function fiberName(fiber: FiberLike): string {
  const type = fiber.type as { displayName?: string; name?: string } | string | null | undefined;
  if (typeof type === 'string') return type;
  return type?.displayName ?? type?.name ?? 'node';
}

/**
 * Collect the stamped nodes under `fiber` (following child + sibling links)
 * into `out`. Pure — exported for tests.
 */
export function walkFiberTree(fiber: FiberLike | null | undefined, out: TreeNode[] = []): TreeNode[] {
  let node = fiber;
  while (node) {
    const loc = node.memoizedProps?.__tunerLoc;
    if (typeof loc === 'string') {
      const children: TreeNode[] = [];
      if (node.child) walkFiberTree(node.child, children);
      out.push({ loc, name: fiberName(node), children });
    } else if (node.child) {
      // Pass-through: unstamped fibers contribute their descendants in place.
      walkFiberTree(node.child, out);
    }
    node = node.sibling;
  }
  return out;
}

export function countTreeNodes(nodes: TreeNode[]): number {
  let count = 0;
  for (const node of nodes) count += 1 + countTreeNodes(node.children);
  return count;
}

const TUNER_UI_PREFIX = 'src/devtools/tuner/';
const PLAYGROUND_PREFIX = 'src/devtools/tuner/Playground.tsx';

/**
 * Drop the tuner's own UI from a tree (8.2 finding: TunerRoot's wrapper is
 * the first stamped node and an open panel adds ~90 more — the dashboard
 * would mostly show the tuner inspecting itself). Dropped nodes HOIST their
 * children, because the TunerRoot wrapper contains the entire app: pruning
 * its subtree would prune everything. The Playground is tuner-owned but is
 * the test bed, so it stays.
 */
export function filterTunerNodes(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const node of nodes) {
    const isTunerUi =
      node.loc.startsWith(TUNER_UI_PREFIX) && !node.loc.startsWith(PLAYGROUND_PREFIX);
    const children = filterTunerNodes(node.children);
    if (isTunerUi) {
      out.push(...children);
    } else {
      out.push({ ...node, children });
    }
  }
  return out;
}

type DevToolsHook = {
  renderers?: Map<number, unknown>;
  getFiberRoots?: (rendererId: number) => Set<{ current?: FiberLike }>;
};

/** Host instances expose measureInWindow on both architectures. */
export type MeasurableFiber = FiberLike & {
  stateNode?: {
    measureInWindow?: (
      callback: (x: number, y: number, width: number, height: number) => void,
    ) => void;
  } | null;
};

function searchFiber(fiber: FiberLike | null | undefined, loc: string): MeasurableFiber | null {
  let node = fiber;
  while (node) {
    if (node.memoizedProps?.__tunerLoc === loc) return node as MeasurableFiber;
    if (node.child) {
      const found = searchFiber(node.child, loc);
      if (found) return found;
    }
    node = node.sibling;
  }
  return null;
}

/** Every fiber carrying `loc` — one JSX element can render N instances. */
function searchAllFibers(
  fiber: FiberLike | null | undefined,
  loc: string,
  out: MeasurableFiber[],
): void {
  let node = fiber;
  while (node) {
    if (node.memoizedProps?.__tunerLoc === loc) out.push(node as MeasurableFiber);
    if (node.child) searchAllFibers(node.child, loc, out);
    node = node.sibling;
  }
}

function eachRoot(visit: (root: FiberLike | undefined) => void): void {
  const hook = (globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ as
    | DevToolsHook
    | undefined;
  if (!hook?.renderers || typeof hook.getFiberRoots !== 'function') return;
  for (const rendererId of hook.renderers.keys()) {
    let roots: Set<{ current?: FiberLike }>;
    try {
      roots = hook.getFiberRoots(rendererId);
    } catch {
      continue;
    }
    for (const root of roots) visit(root.current);
  }
}

/**
 * All live instances of a stamped element. A `.map()` renders one JSX
 * element many times — every instance shares the loc, and a StyleSheet edit
 * genuinely affects all of them, so the tuner selects them as one.
 */
export function findAllFibersByLoc(loc: string): MeasurableFiber[] {
  const found: MeasurableFiber[] = [];
  eachRoot((root) => searchAllFibers(root, loc, found));
  return found;
}

/**
 * The fiber whose stamp equals `loc`, or null (8.6 — dashboard clicks select
 * by loc, and the frame must be measured from the live instance).
 */
export function findFiberByLoc(loc: string): MeasurableFiber | null {
  const hook = (globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ as
    | DevToolsHook
    | undefined;
  if (!hook?.renderers || typeof hook.getFiberRoots !== 'function') return null;

  for (const rendererId of hook.renderers.keys()) {
    let roots: Set<{ current?: FiberLike }>;
    try {
      roots = hook.getFiberRoots(rendererId);
    } catch {
      continue;
    }
    for (const root of roots) {
      const found = searchFiber(root.current, loc);
      if (found) return found;
    }
  }
  return null;
}

/**
 * The current stamped-element tree across all fiber roots, or [] when the
 * hook (or its root registry) is unavailable.
 */
export function collectTree(): TreeNode[] {
  const hook = (globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ as
    | DevToolsHook
    | undefined;
  if (!hook?.renderers || typeof hook.getFiberRoots !== 'function') return [];

  const tree: TreeNode[] = [];
  for (const rendererId of hook.renderers.keys()) {
    let roots: Set<{ current?: FiberLike }>;
    try {
      roots = hook.getFiberRoots(rendererId);
    } catch {
      continue;
    }
    for (const root of roots) {
      walkFiberTree(root.current, tree);
    }
  }
  return tree;
}
