import {
  type FiberLike,
  collectTree,
  countTreeNodes,
  filterTunerNodes,
  walkFiberTree,
} from './treeWalker';

/** Fiber-shaped test helper: children become child/sibling links. */
function fiber(
  type: unknown,
  props: Record<string, unknown> | null,
  children: FiberLike[] = [],
): FiberLike {
  for (let i = 0; i < children.length - 1; i++) children[i].sibling = children[i + 1];
  return { type, memoizedProps: props, child: children[0] ?? null, sibling: null };
}

const stamped = (name: string, loc: string, children: FiberLike[] = []) =>
  fiber(name, { __tunerLoc: loc }, children);

describe('walkFiberTree (8.2)', () => {
  it('returns [] for an empty root', () => {
    expect(walkFiberTree(null)).toEqual([]);
  });

  it('collects a stamped host element with its name and loc', () => {
    const tree = walkFiberTree(stamped('RCTView', 'src/A.tsx:1:0'));
    expect(tree).toEqual([{ loc: 'src/A.tsx:1:0', name: 'RCTView', children: [] }]);
  });

  it('nests stamped children under stamped parents', () => {
    const tree = walkFiberTree(
      stamped('RCTView', 'src/A.tsx:1:0', [stamped('RCTText', 'src/A.tsx:2:2')]),
    );
    expect(tree).toEqual([
      {
        loc: 'src/A.tsx:1:0',
        name: 'RCTView',
        children: [{ loc: 'src/A.tsx:2:2', name: 'RCTText', children: [] }],
      },
    ]);
  });

  it('hoists stamped descendants through unstamped wrappers', () => {
    const Screen = function Screen() {};
    const tree = walkFiberTree(
      fiber(Screen, null, [
        fiber('RCTView', null, [stamped('RCTText', 'src/A.tsx:5:4')]),
      ]),
    );
    expect(tree).toEqual([{ loc: 'src/A.tsx:5:4', name: 'RCTText', children: [] }]);
  });

  it('preserves sibling order', () => {
    const tree = walkFiberTree(
      fiber(function App() {}, null, [
        stamped('RCTView', 'src/A.tsx:1:0'),
        stamped('RCTView', 'src/A.tsx:9:0'),
      ]),
    );
    expect(tree.map((node) => node.loc)).toEqual(['src/A.tsx:1:0', 'src/A.tsx:9:0']);
  });

  it('ignores non-string __tunerLoc values', () => {
    const tree = walkFiberTree(fiber('RCTView', { __tunerLoc: 42 }));
    expect(tree).toEqual([]);
  });

  it('countTreeNodes counts nested nodes', () => {
    const tree = walkFiberTree(
      stamped('RCTView', 'a:1:0', [stamped('RCTText', 'a:2:0'), stamped('RCTText', 'a:3:0')]),
    );
    expect(countTreeNodes(tree)).toBe(3);
  });
});

describe('filterTunerNodes (8.3)', () => {
  const node = (loc: string, children: ReturnType<typeof Object>[] = []) => ({
    loc,
    name: 'RCTView',
    children,
  });

  it('hoists app content through the tuner wrapper instead of pruning it', () => {
    const filtered = filterTunerNodes([
      node('src/devtools/tuner/TunerRoot.tsx:144:6', [
        node('src/screens/TodayScreen.tsx:10:4'),
        node('src/devtools/tuner/ui/Panel.tsx:120:6', [
          node('src/devtools/tuner/ui/controls/ScrubRow.tsx:60:4'),
        ]),
      ]),
    ]);
    expect(filtered).toEqual([node('src/screens/TodayScreen.tsx:10:4')]);
  });

  it('keeps the Playground — it is the test bed, not tuner chrome', () => {
    const filtered = filterTunerNodes([
      node('src/devtools/tuner/TunerRoot.tsx:144:6', [
        node('src/devtools/tuner/Playground.tsx:21:4', [
          node('src/devtools/tuner/Playground.tsx:22:6'),
        ]),
      ]),
    ]);
    expect(filtered).toEqual([
      node('src/devtools/tuner/Playground.tsx:21:4', [
        node('src/devtools/tuner/Playground.tsx:22:6'),
      ]),
    ]);
  });

  it('leaves non-tuner trees untouched', () => {
    const tree = [node('src/screens/RecapScreen.tsx:5:2', [node('src/screens/RecapScreen.tsx:6:4')])];
    expect(filterTunerNodes(tree)).toEqual(tree);
  });
});

describe('collectTree (8.2)', () => {
  const HOOK = '__REACT_DEVTOOLS_GLOBAL_HOOK__';
  const globals = globalThis as Record<string, unknown>;
  let original: unknown;

  beforeEach(() => {
    original = globals[HOOK];
  });
  afterEach(() => {
    globals[HOOK] = original;
  });

  it('returns [] when the hook is missing', () => {
    globals[HOOK] = undefined;
    expect(collectTree()).toEqual([]);
  });

  it('walks every root of every renderer', () => {
    globals[HOOK] = {
      renderers: new Map([[1, {}]]),
      getFiberRoots: () =>
        new Set([
          { current: stamped('RCTView', 'src/A.tsx:1:0') },
          { current: stamped('RCTView', 'src/B.tsx:1:0') },
        ]),
    };
    expect(collectTree().map((node) => node.loc)).toEqual(['src/A.tsx:1:0', 'src/B.tsx:1:0']);
  });
});
