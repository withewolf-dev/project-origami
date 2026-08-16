import {
  type ComponentType,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { DevSettings, StyleSheet, View } from 'react-native';

import { hitTestAtPoint } from './hitTest';
import { clearAll, getVersion, subscribe } from './store';
import type { TunerHit, TunerMode } from './types';
import { Overlay } from './ui/Overlay';

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
    const [mode, setMode] = useState<TunerMode>('off');
    const [hit, setHit] = useState<TunerHit | null>(null);

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
      const result = hitTestAtPoint(appRef.current, x, y);
      setHit(result);
      setMode(result ? 'editing' : 'selecting');
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
          onEnter={enter}
          onExit={exit}
          onSelect={select}
          onResetAll={reset}
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
