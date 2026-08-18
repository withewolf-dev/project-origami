import { type ComponentType, useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

import { fetchCommands, postHit, postMode, postTree, postWrite } from './devServer';
import { hitTestAtPoint } from './hitTest';
import { useTunerVersion } from './runtime';
import { collectTree, filterTunerNodes, findFiberByLoc } from './treeWalker';
import { clearAll, getOverride, replaceOverride, setOverride, undo } from './store';
import type { SaveState, TunerHit, TunerMode } from './types';
import { Overlay } from './ui/Overlay';

/** How long after a successful write we assume Fast Refresh has landed. */
const FAST_REFRESH_GRACE_MS = 1400;

function describeFailures(failed: { key: string; reason: string }[]): string {
  return failed.map((f) => `${f.key}: ${f.reason}`).join(' · ');
}

/**
 * Selection policy: a hit covering most of the display is the screen-sized
 * container (tapping empty space resolves to the ScrollView) — nobody means
 * to select that, so it reads as "dismiss". Named here so EVERY hit-test
 * call site applies the same rule; the frame/window comparison is valid
 * because the tuner root fills the window.
 */
function asSelectable(hit: TunerHit | null): TunerHit | null {
  if (!hit) return null;
  const window = Dimensions.get('window');
  const huge = hit.frame.width * hit.frame.height > window.width * window.height * 0.7;
  return huge ? null : hit;
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
    const lastTapRef = useRef<{ x: number; y: number } | null>(null);
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
     * Select an element by loc on the dashboard's behalf (8.6). Unlike a tap,
     * a click on a NAMED row is unambiguous, so the tap-away dismiss policy
     * (asSelectable) deliberately does not apply — this is how the screen
     * container becomes selectable again, from the one surface where
     * selecting it is clearly intentional.
     */
    const selectFromDashboard = useCallback((loc: string) => {
      const fiber = findFiberByLoc(loc);
      const measure = fiber?.stateNode?.measureInWindow;
      if (!fiber || typeof measure !== 'function') return; // navigated away
      measure((x, y, width, height) => {
        let style: Record<string, unknown> | null = null;
        try {
          const flat = StyleSheet.flatten(fiber.memoizedProps?.style as never);
          style = flat && typeof flat === 'object' ? (flat as Record<string, unknown>) : null;
        } catch {
          style = null;
        }
        const name = typeof fiber.type === 'string' ? fiber.type : null;
        setHit({ frame: { left: x, top: y, width, height }, loc, name, hierarchy: [], style });
        setMode('editing');
        setSaveState({ status: 'idle' });
        postHit(loc, name, style); // echo so the dashboard inspector seeds
      });
    }, []);


    const select = useCallback((x: number, y: number) => {
      lastTapRef.current = { x, y };
      const result = asSelectable(hitTestAtPoint(appRef.current, x, y));
      setHit(result);
      setMode(result ? 'editing' : 'selecting');
      setSaveState({ status: 'idle' });
      postHit(result?.loc ?? null, result?.name ?? null, result?.style ?? null); // 8.5
    }, []);

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
      if (!changes) return;
      setSaveState({ status: 'saving' });
      try {
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
          const point = lastTapRef.current;
          if (point) {
            const refreshed = asSelectable(hitTestAtPoint(appRef.current, point.x, point.y));
            if (refreshed) setHit(refreshed);
          }
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
              if (!command.on) postHit(null, null, null);
            } else if (command.type === 'select') selectFromDashboard(command.loc);
            else if (command.type === 'override') setOverride(command.loc, command.patch);
            else if (command.type === 'save') save(command.loc);
            else if (command.type === 'undo') undo();
          }
          // Unreachable server returns [] immediately — don't hot-loop on it.
          if (commands.length === 0) await new Promise((r) => setTimeout(r, 250));
        }
      })();
      return () => {
        active = false;
      };
    }, [selectFromDashboard, save]);

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
