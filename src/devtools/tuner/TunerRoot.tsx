import {
  type ComponentType,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { DevSettings, Dimensions, StyleSheet, View } from 'react-native';

import { postWrite } from './devServer';
import { hitTestAtPoint } from './hitTest';
import { clearAll, getOverride, getVersion, replaceOverride, subscribe } from './store';
import type { SaveState, TunerHit, TunerMode } from './types';
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
    const lastTapRef = useRef<{ x: number; y: number } | null>(null);
    const [mode, setMode] = useState<TunerMode>('off');
    const [hit, setHit] = useState<TunerHit | null>(null);
    const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' });

    // `resolveStyle` is a plain function, not a hook (see docs/tuner/TODO.md
    // Log — the plugin rewrites JSX inside callbacks and conditionals, where a
    // hook would break the Rules of Hooks). So overrides cannot re-render their
    // own component; re-render is driven from here instead. Subscribing to the
    // store re-renders TunerRoot, which recreates the <App/> element and
    // repaints the tree. Known limit: React.memo boundaries block propagation.
    const overrideVersion = useSyncExternalStore(subscribe, getVersion, getVersion);

    const enter = useCallback(() => setMode('selecting'), []);
    const exit = useCallback(() => {
      setMode('off');
      setHit(null);
    }, []);

    const reset = useCallback(() => clearAll(), []);

    // Dev-menu entry (Cmd+D) alongside the corner long-press, so design mode
    // is discoverable without knowing the gesture.
    useEffect(() => {
      DevSettings.addMenuItem('Toggle Design Mode', () => {
        setMode((current) => (current === 'off' ? 'selecting' : 'off'));
        setHit(null);
      });
    }, []);

    const select = useCallback((x: number, y: number) => {
      lastTapRef.current = { x, y };
      const result = hitTestAtPoint(appRef.current, x, y);

      // A tap on empty space resolves to the screen-sized container (the
      // ScrollView). Nobody means to select that by tapping outside the
      // panel — treat it as "dismiss", matching tap-away expectations.
      // Trade-off (logged): screen-level containers are not selectable.
      const window = Dimensions.get('window');
      const huge =
        result && result.frame.width * result.frame.height > window.width * window.height * 0.7;

      setHit(huge ? null : result);
      setMode(result && !huge ? 'editing' : 'selecting');
      setSaveState({ status: 'idle' });
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
        if (!('ok' in result) || !result.ok) {
          setSaveState({
            status: 'error',
            message: 'error' in result ? `write failed: ${result.error}` : 'write failed',
          });
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
            const refreshed = hitTestAtPoint(appRef.current, point.x, point.y);
            if (refreshed) setHit(refreshed);
          }
          setSaveState((state) => (state.status === 'saved' ? { status: 'idle' } : state));
        }, FAST_REFRESH_GRACE_MS);
      } catch {
        setSaveState({ status: 'error', message: 'dev server unreachable' });
      }
    }, []);

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
          version={overrideVersion}
          saveState={saveState}
          onEnter={enter}
          onExit={exit}
          onSelect={select}
          onResetAll={reset}
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
