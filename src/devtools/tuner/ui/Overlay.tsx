import { StyleSheet, View } from 'react-native';

import type { SaveState, TunerHit, TunerMode } from '../types';
import { Panel } from './Panel';
import { ACCENT } from './theme';

type Props = {
  mode: TunerMode;
  hit: TunerHit | null;
  saveState: SaveState;
  /** A dashboard tab is open — the panel yields to it (8.9). */
  dashboardLive: boolean;
  onExit: () => void;
  onSelect: (x: number, y: number) => void;
  onResetAll: () => void;
  onSave: (loc: string) => void;
};

/**
 * The in-app design-mode overlay (docs/tuner/TODO.md, tasks 2.1–2.4).
 *
 * Off = nothing rendered at all: the strongest possible form of the 2.1
 * "app behaves as if the tuner were absent" guarantee. The dev menu is the
 * single entry point (the corner long-press trigger was dropped — unused,
 * and an invisible touch target is a mystery bug waiting to happen).
 *
 * Layering matters and is load-bearing: the container is `box-none` so it
 * never intercepts anything itself, and the full-screen capture layer that
 * claims the responder (2.3) renders BEFORE the panel — the panel, a later
 * sibling and therefore on top, keeps its own touches and can never select
 * itself.
 */
export function Overlay({
  mode,
  hit,
  saveState,
  dashboardLive,
  onExit,
  onSelect,
  onResetAll,
  onSave,
}: Props) {
  if (mode === 'off') return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
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

      <View pointerEvents="none" style={styles.modeBorder} />

      <Panel
        hit={hit}
        saveState={saveState}
        collapsed={dashboardLive}
        onExit={onExit}
        onResetAll={onResetAll}
        onSave={onSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Border only, no fill: a fill composites over the element's own colour
  // (a yellow badge read olive while selected) — fatal in a tool whose job
  // is judging colour.
  highlight: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: ACCENT,
  },
  // Design-mode indicator: a thin inset frame with a large radius so it
  // follows the display's rounded corners instead of slicing across them,
  // slightly translucent so it reads as chrome, not content.
  modeBorder: {
    position: 'absolute',
    left: 3,
    right: 3,
    top: 3,
    bottom: 3,
    borderWidth: 1.5,
    borderRadius: 52,
    borderColor: 'rgba(0, 224, 184, 0.7)',
  },
});
