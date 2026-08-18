import { useRef, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, View } from 'react-native';

import { setOverride } from '../store';
import type { SaveState, TunerFrame, TunerHit, TunerMode } from '../types';
import { Panel } from './Panel';
import { ACCENT } from './theme';

const MIN_SIZE = 8;

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

type ResizeKind = 'r' | 'b' | 'br';

type GripProps = {
  kind: ResizeKind;
  loc: string;
  frame: TunerFrame;
  onPreview: (size: { w: number; h: number }) => void;
};

/**
 * One resize grip (Tier 2, slice 1). Dragging writes explicit width/height
 * overrides live through the normal store path; the parent draws the box
 * from the previewed size so the drag never waits on the ~50ms re-measure.
 */
function Grip({ kind, loc, frame, onPreview }: GripProps) {
  const start = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleGrant = (event: GestureResponderEvent) => {
    start.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
      w: frame.width,
      h: frame.height,
    };
    onPreview({ w: frame.width, h: frame.height });
  };

  const handleMove = (event: GestureResponderEvent) => {
    const begin = start.current;
    const w =
      kind === 'b'
        ? begin.w
        : Math.max(MIN_SIZE, Math.round(begin.w + event.nativeEvent.pageX - begin.x));
    const h =
      kind === 'r'
        ? begin.h
        : Math.max(MIN_SIZE, Math.round(begin.h + event.nativeEvent.pageY - begin.y));
    onPreview({ w, h });
    const patch: Record<string, number> = {};
    if (kind !== 'b') patch.width = w;
    if (kind !== 'r') patch.height = h;
    setOverride(loc, patch);
  };

  const position =
    kind === 'r'
      ? { left: frame.left + frame.width - 6, top: frame.top + frame.height / 2 - 6 }
      : kind === 'b'
        ? { left: frame.left + frame.width / 2 - 6, top: frame.top + frame.height - 6 }
        : { left: frame.left + frame.width - 6, top: frame.top + frame.height - 6 };

  return (
    <View
      hitSlop={12}
      style={[styles.grip, position]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={handleGrant}
      onResponderMove={handleMove}
    />
  );
}

/**
 * The in-app design-mode overlay (docs/tuner/TODO.md, tasks 2.1–2.4 + Tier 2).
 *
 * Off = nothing rendered at all: the strongest possible form of the 2.1
 * "app behaves as if the tuner were absent" guarantee. The dashboard is the
 * single entry point.
 *
 * Layering matters and is load-bearing: the container is `box-none` so it
 * never intercepts anything itself; the full-screen capture layer that
 * claims the responder (2.3) renders FIRST, so later siblings — the resize
 * grips and the panel — sit on top and keep their own touches.
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
  const [dragSize, setDragSize] = useState<{ w: number; h: number } | null>(null);

  const loc = hit?.loc ?? null;

  // Adjust-during-render (not effects — cascading-render lint is right):
  // a new selection voids the preview, and once the re-measured frame has
  // caught up with the previewed size the preview retires, so the box never
  // snaps back to the pre-drag size.
  const [prevLoc, setPrevLoc] = useState(loc);
  if (loc !== prevLoc) {
    setPrevLoc(loc);
    setDragSize(null);
  }
  if (
    dragSize &&
    hit &&
    Math.abs(hit.frame.width - dragSize.w) < 1.5 &&
    Math.abs(hit.frame.height - dragSize.h) < 1.5
  ) {
    setDragSize(null);
  }

  if (mode === 'off') return null;

  const frame: TunerFrame | null = hit
    ? {
        ...hit.frame,
        width: dragSize?.w ?? hit.frame.width,
        height: dragSize?.h ?? hit.frame.height,
      }
    : null;

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

      {frame ? (
        <View
          pointerEvents="none"
          style={[
            styles.highlight,
            {
              left: frame.left,
              top: frame.top,
              width: frame.width,
              height: frame.height,
            },
          ]}
        />
      ) : null}

      {frame && loc ? (
        <>
          <Grip kind="r" loc={loc} frame={frame} onPreview={setDragSize} />
          <Grip kind="b" loc={loc} frame={frame} onPreview={setDragSize} />
          <Grip kind="br" loc={loc} frame={frame} onPreview={setDragSize} />
        </>
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
  // Figma-style grip: white square with an accent ring.
  grip: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
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
