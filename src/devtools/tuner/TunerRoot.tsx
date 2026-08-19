import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

import { fetchCommands, postHit, postMode, postTree, postWrite, postWriteConst } from './devServer';
import { sanitizeStyle } from './hitTest';
import { useTunerVersion } from './runtime';
import { motionForLoc, motionKey, replayMotion } from './motion';
import {
  type StampedFiber,
  collectStampedFibers,
  collectTree,
  filterTunerNodes,
  findAllFibersByLoc,
  findFiberByLoc,
} from './treeWalker';
import { clearAll, getOverride, replaceOverride, setOverride, undo } from './store';
import type { SaveState, TunerFrame, TunerHit, TunerMode } from './types';
import { Overlay } from './ui/Overlay';

/** How long after a successful write we assume Fast Refresh has landed. */
const FAST_REFRESH_GRACE_MS = 1400;

function describeFailures(failed: { key: string; reason: string }[]): string {
  return failed.map((f) => `${f.key}: ${f.reason}`).join(' · ');
}

/**
 * Wraps the app root with the design tuner (docs/tuner/TODO.md, tasks 0.4, 2.1–2.4).
 *
 * The wrapper View is the hit-test origin. It is the outermost view, so its
 * coordinate space is the screen's — which is what makes the overlay's
 * `locationX/locationY` directly usable as inspector coordinates (task 1.3
 * established those coordinates are relative to `inspectedView`, not the screen).
 *
 * In production `withTuner` returns the app untouched, and the babel plugin
 * that stamps `__tunerLoc` does not run either, so nothing here ships.
 */
export function withTuner<P extends object>(App: ComponentType<P>): ComponentType<P> {
  if (!__DEV__) return App;

  return function TunerRoot(props: P) {
    // Hit-testing targets the app subtree ONLY. Testing against a root that
    // also contains the overlay always resolves to the overlay's own
    // full-screen capture layer, which sits on top of everything.
    const appRef = useRef<View>(null);
    /** Repeated taps at ~the same point walk outward through the stack. */
    const cycleRef = useRef<{ x: number; y: number; index: number } | null>(null);
    const [mode, setMode] = useState<TunerMode>('off');
    const [hit, setHit] = useState<TunerHit | null>(null);
    const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });
    const [dashboardLive, setDashboardLive] = useState(false);

    // Subscribe this component to override changes so the panel (which reads
    // the store during render) repaints on every mutation. Stamped app
    // components get the same hook injected by the babel plugin.
    const overrideVersion = useTunerVersion();

    // Keep the highlight honest: overrides that change layout (margin,
    // padding, size) move the element out from under the frame captured at
    // selection time. Re-measure the selected instance after each store
    // change, once layout has had a frame to settle.
    useEffect(() => {
      const loc = hit?.loc;
      if (!loc) return;
      const timer = setTimeout(() => {
        const measure = findFiberByLoc(loc)?.stateNode?.measureInWindow;
        if (typeof measure !== 'function') return;
        measure((x, y, width, height) => {
          setHit((current) => {
            if (!current || current.loc !== loc) return current;
            const f = current.frame;
            const same =
              Math.abs(f.left - x) < 0.5 &&
              Math.abs(f.top - y) < 0.5 &&
              Math.abs(f.width - width) < 0.5 &&
              Math.abs(f.height - height) < 0.5;
            return same ? current : { ...current, frame: { left: x, top: y, width, height } };
          });
        });
      }, 50);
      return () => clearTimeout(timer);
    }, [hit?.loc, overrideVersion]);

    const designOpen = mode !== 'off';

    const exit = useCallback(() => {
      setMode('off');
      setHit(null);
      postHit(null, null, null);
    }, []);

    /**
     * One JSX element can render many instances (a `.map()`), and they all
     * share the loc — an edit hits all of them. Measure every instance so
     * the overlay can outline the whole set instead of one glyph.
     */
    const measureInstances = useCallback((loc: string) => {
      const fibers = findAllFibersByLoc(loc);
      if (fibers.length < 2) return;
      const frames: TunerFrame[] = [];
      let settled = 0;
      const finish = () => {
        settled += 1;
        if (settled < fibers.length) return;
        setHit((current) => {
          if (!current || current.loc !== loc) return current;
          // Report the real instance count so the dashboard can say
          // "N instances" too — and so this is observable from outside.
          postHit(loc, current.name, current.style, current.motion, frames.length);
          return { ...current, frames };
        });
      };
      for (const fiber of fibers) {
        const measure = fiber.stateNode?.measureInWindow;
        if (typeof measure !== 'function') {
          finish();
          continue;
        }
        measure((x, y, width, height) => {
          frames.push({ left: x, top: y, width, height });
          finish();
        });
      }
    }, []);

    /**
     * Select an element by loc on the dashboard's behalf (8.6) — a click on a
     * named row is unambiguous, so it selects exactly that element with no
     * candidate-stack cycling.
     */
    const selectFromDashboard = useCallback((loc: string) => {
      const fiber = findFiberByLoc(loc);
      const measure = fiber?.stateNode?.measureInWindow;
      if (!fiber || typeof measure !== 'function') return; // navigated away
      measure((x, y, width, height) => {
        let style: Record<string, unknown> | null = null;
        try {
          style = sanitizeStyle(StyleSheet.flatten(fiber.memoizedProps?.style as never));
        } catch {
          style = null;
        }
        const name = typeof fiber.type === 'string' ? fiber.type : null;
        const motion = motionForLoc(loc);
        setHit({ frame: { left: x, top: y, width, height }, loc, name, hierarchy: [], style, motion });
        setMode('editing');
        setSaveState({ status: 'idle' });
        postHit(loc, name, style, motion); // echo so the dashboard inspector seeds
        measureInstances(loc);
      });
    }, [measureInstances]);


    /**
     * Geometric hit-test over the measured tree, returning EVERY stamped
     * element containing the point, innermost (smallest) first.
     *
     * This replaces native hit-testing for selection because native
     * hit-testing skips `pointerEvents="none"` views — gradient backdrops and
     * decorative layers were simply unreachable by tap. Geometry does not
     * care about touch, so everything drawn is selectable.
     */
    const candidatesAt = useCallback(
      (x: number, y: number, done: (candidates: { frame: TunerFrame; entry: StampedFiber }[]) => void) => {
        const stamped = collectStampedFibers();
        if (stamped.length === 0) {
          done([]);
          return;
        }
        const found: { area: number; frame: TunerFrame; entry: StampedFiber }[] = [];
        let settled = 0;
        const finish = () => {
          settled += 1;
          if (settled < stamped.length) return;
          found.sort((a, b) => a.area - b.area);
          done(found.map(({ frame, entry }) => ({ frame, entry })));
        };
        for (const entry of stamped) {
          const measure = entry.fiber.stateNode?.measureInWindow;
          if (typeof measure !== 'function') {
            finish();
            continue;
          }
          measure((mx, my, width, height) => {
            const area = width * height;
            if (area > 0 && x >= mx && x <= mx + width && y >= my && y <= my + height) {
              found.push({ area, frame: { left: mx, top: my, width, height }, entry });
            }
            finish();
          });
        }
      },
      [],
    );

    /** Commit one candidate as the selection. */
    const commitCandidate = useCallback(
      (frame: TunerFrame, entry: StampedFiber, depth: { index: number; total: number }) => {
        let style: Record<string, unknown> | null = null;
        try {
          style = sanitizeStyle(StyleSheet.flatten(entry.fiber.memoizedProps?.style as never));
        } catch {
          style = null;
        }
        const motion = motionForLoc(entry.loc);
        setHit({ frame, loc: entry.loc, name: entry.name, hierarchy: [], style, motion, depth });
        setMode('editing');
        setSaveState({ status: 'idle' });
        postHit(entry.loc, entry.name, style, motion);
        measureInstances(entry.loc);
      },
      [measureInstances],
    );

    const select = useCallback(
      (x: number, y: number) => {
        // Tapping the same spot again steps OUTWARD: innermost element first,
        // then its containers — how you reach a background sitting under
        // everything else.
        const previous = cycleRef.current;
        const sameSpot =
          previous && Math.abs(previous.x - x) < 12 && Math.abs(previous.y - y) < 12;
        const wanted = sameSpot ? previous.index + 1 : 0;

        candidatesAt(x, y, (candidates) => {
          if (candidates.length === 0) {
            cycleRef.current = null;
            setHit(null);
            setMode('selecting');
            postHit(null, null, null);
            return;
          }
          const index = wanted % candidates.length;
          cycleRef.current = { x, y, index };
          const { frame, entry } = candidates[index];
          commitCandidate(frame, entry, { index, total: candidates.length });
        });
      },
      [candidatesAt, commitCandidate],
    );

    /**
     * Entering design mode preselects the BACKMOST element at the screen
     * centre — usually the screen background, which is otherwise the hardest
     * thing to reach by tap.
     */
    const preselectBackground = useCallback(() => {
      const window = Dimensions.get('window');
      candidatesAt(window.width / 2, window.height / 2, (candidates) => {
        if (candidates.length === 0) return;
        const index = candidates.length - 1;
        cycleRef.current = null;
        const { frame, entry } = candidates[index];
        commitCandidate(frame, entry, { index, total: candidates.length });
      });
    }, [candidatesAt, commitCandidate]);

    /**
     * Save → write source → hand off to Fast Refresh (6.1 / 6.2).
     *
     * The override is NOT cleared on response: the saved values and the
     * override are identical, so keeping it merged during the refresh window
     * means zero flicker no matter how long the rebuild takes. After a grace
     * period the applied keys are dropped and the selection re-hit-tested so
     * the panel reads post-save source values.
     */
    const save = useCallback(async (loc: string) => {
      const changes = getOverride(loc);
      const motion = motionForLoc(loc);
      const motionChanges = motion ? getOverride(motionKey(motion.id)) : undefined;
      if (!changes && !motionChanges) return;
      setSaveState({ status: 'saving' });
      try {
        // Motion constants live outside any element, so they take the
        // const writer; one Save button persists everything pending.
        if (motion && motionChanges) {
          const motionResult = await postWriteConst(motion.id, motion.name, { ...motionChanges });
          if (motionResult.ok) replaceOverride(motionKey(motion.id), null);
          else {
            setSaveState({ status: 'error', message: `motion: ${motionResult.error}` });
            return;
          }
        }
        if (!changes) {
          setSaveState({ status: 'saved' });
          setTimeout(
            () => setSaveState((state) => (state.status === 'saved' ? { status: 'idle' } : state)),
            FAST_REFRESH_GRACE_MS,
          );
          return;
        }
        const result = await postWrite(loc, { ...changes });
        if (!result.ok) {
          setSaveState({ status: 'error', message: `write failed: ${result.error}` });
          return;
        }
        const failed = result.failed ?? [];
        setSaveState(
          failed.length > 0
            ? { status: 'error', message: `not saved — ${describeFailures(failed)}` }
            : { status: 'saved' },
        );
        setTimeout(() => {
          const current = getOverride(loc);
          if (current) {
            const remaining = { ...current };
            for (const key of result.applied) delete remaining[key];
            replaceOverride(loc, Object.keys(remaining).length > 0 ? remaining : null);
          }
          // The frame is re-measured by the highlight effect once clearing
          // the override bumps the store version — no re-hit-test needed.
          setSaveState((state) => (state.status === 'saved' ? { status: 'idle' } : state));
        }, FAST_REFRESH_GRACE_MS);
      } catch {
        setSaveState({ status: 'error', message: 'dev server unreachable' });
      }
    }, []);

    // The command LONG-POLL runs for the whole dev session, not just while
    // design mode is open — the dashboard is the trigger now (the dev-menu
    // item was removed), so the app must be listening for the `mode` command
    // before design mode exists. Held requests make idle cost one connection
    // re-armed every ~10s.
    useEffect(() => {
      let active = true;
      (async () => {
        while (active) {
          const { commands, dashboardLive: live } = await fetchCommands(true);
          if (!active) break;
          setDashboardLive(live);
          for (const command of commands) {
            if (command.type === 'mode') {
              setMode(command.on ? 'selecting' : 'off');
              setHit(null);
              setSaveState({ status: 'idle' });
              cycleRef.current = null;
              if (command.on) setTimeout(preselectBackground, 120);
              else postHit(null, null, null);
            } else if (command.type === 'select') selectFromDashboard(command.loc);
            else if (command.type === 'override') setOverride(command.loc, command.patch);
            else if (command.type === 'save') save(command.loc);
            else if (command.type === 'replay') replayMotion(command.id);
            else if (command.type === 'undo') undo();
          }
          // Unreachable server returns [] immediately — don't hot-loop on it.
          if (commands.length === 0) await new Promise((r) => setTimeout(r, 250));
        }
      })();
      return () => {
        active = false;
      };
    }, [selectFromDashboard, save, preselectBackground]);

    // Tree push while design mode is open (8.3), plus mode reporting so the
    // dashboard's Enter/Exit button reflects reality. Keyed on open/closed,
    // NOT `mode`: selecting↔editing flips on every tap.
    useEffect(() => {
      postMode(designOpen);
      if (!designOpen) return;
      const push = () => postTree(filterTunerNodes(collectTree()));
      push();
      const interval = setInterval(push, 2000);
      return () => {
        clearInterval(interval);
        // Exiting design mode DISCARDS unsaved overrides: outside design
        // mode the app must show source truth, nothing else. Lingering
        // overrides looked exactly like a save that never happened (user
        // report). clearAll records one undo group, so re-entering design
        // mode + Undo recovers discarded work.
        clearAll();
        postTree(null); // design mode closed — clear the dashboard
        postHit(null, null, null);
      };
    }, [designOpen]);

    // Both wrappers sit at the screen origin and fill it, so the overlay's
    // locationX/locationY are already in the app wrapper's coordinate space.
    return (
      <View style={styles.root} collapsable={false}>
        <View ref={appRef} style={styles.root} collapsable={false}>
          <App {...props} />
        </View>
        <Overlay
          mode={mode}
          hit={hit}
          saveState={saveState}
          dashboardLive={dashboardLive}
          onExit={exit}
          onSelect={select}
          onResetAll={clearAll}
          onSave={save}
        />
      </View>
    );
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
