import { Pressable, StyleSheet, View } from 'react-native';

import type { SaveState, TunerHit, TunerMode } from '../types';
import { Panel } from './Panel';
import { ACCENT } from './theme';

type Props = {
  mode: TunerMode;
  hit: TunerHit | null;
  saveState: SaveState;
  /** A dashboard tab is open — the panel yields to it (8.9). */
  dashboardLive: boolean;
  onEnter: () => void;
  onExit: () => void;
  onSelect: (x: number, y: number) => void;
  onResetAll: () => void;
  onSave: (loc: string) => void;
};

/**
 * The in-app design-mode overlay (docs/tuner/TODO.md, tasks 2.1–2.4).
 *
 * Layering matters and is load-bearing:
 *  - The container is `box-none` so it never intercepts anything itself.
 *  - In `off`, the ONLY interactive child is the invisible corner trigger, so
 *    the app behaves exactly as it would without the tuner mounted (2.1).
 *  - In `selecting`/`editing`, a full-screen capture layer claims the responder
 *    so taps hit-test instead of reaching the app (2.3). It is rendered BEFORE
 *    the chip, so the chip — a later sibling, therefore on top — keeps its own
 *    touches and the panel can never select itself.
 */
export function Overlay({
  mode,
  hit,
  saveState,
  dashboardLive,
  onEnter,
  onExit,
  onSelect,
  onResetAll,
  onSave,
}: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {mode === 'off' ? (
        <Pressable
          accessibilityLabel="Enter design mode"
          style={styles.cornerTrigger}
          delayLongPress={500}
          onLongPress={onEnter}
        />
      ) : (
        <>
          <View
            style={StyleSheet.absoluteFill}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderRelease={(event) => {
              const { locationX, locationY } = event.nativeEvent;
              onSelect(locationX, locationY);
            }}
          />

          {hit ? (
            <View
              pointerEvents="none"
              style={[
                styles.highlight,
                {
                  left: hit.frame.left,
                  top: hit.frame.top,
                  width: hit.frame.width,
                  height: hit.frame.height,
                },
              ]}
            />
          ) : null}

          <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.modeBorder]} />

          <Panel
            hit={hit}
            saveState={saveState}
            collapsed={dashboardLive}
            onExit={onExit}
            onResetAll={onResetAll}
            onSave={onSave}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Invisible long-press target. Bottom-left, clear of the home indicator.
  cornerTrigger: {
    position: 'absolute',
    left: 0,
    bottom: 44,
    width: 44,
    height: 44,
  },
  // Border only, no fill: a fill composites over the element's own colour
  // (a yellow badge read olive while selected) — fatal in a tool whose job
  // is judging colour.
  highlight: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: ACCENT,
  },
  modeBorder: {
    borderWidth: 2,
    borderColor: ACCENT,
  },
});
