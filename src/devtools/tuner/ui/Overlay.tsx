import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import type { TunerHit, TunerMode } from '../types';
import { Panel } from './Panel';

type Props = {
  mode: TunerMode;
  hit: TunerHit | null;
  /** Store version — unused directly; its change is what re-renders the tree. */
  version: number;
  onEnter: () => void;
  onExit: () => void;
  onSelect: (x: number, y: number) => void;
  onResetAll: () => void;
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
export function Overlay({ mode, hit, onEnter, onExit, onSelect, onResetAll }: Props) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // A container the size of the screen (tapping empty space selects the
  // ScrollView) gets a border-only highlight: filling it tints the whole app
  // teal and nothing underneath is readable.
  const hitIsHuge = hit
    ? hit.frame.width * hit.frame.height > screenWidth * screenHeight * 0.7
    : false;

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
                hitIsHuge ? styles.highlightBorderOnly : null,
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

          <Panel hit={hit} onExit={onExit} onResetAll={onResetAll} />
        </>
      )}
    </View>
  );
}

const ACCENT = '#00E0B8';

const styles = StyleSheet.create({
  // Invisible long-press target. Bottom-left, clear of the home indicator.
  cornerTrigger: {
    position: 'absolute',
    left: 0,
    bottom: 44,
    width: 44,
    height: 44,
  },
  highlight: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: ACCENT,
    backgroundColor: 'rgba(0, 224, 184, 0.18)',
  },
  highlightBorderOnly: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  modeBorder: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: ACCENT,
  },
});
