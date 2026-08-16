import { useRef, useState } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Decimal places to display. Integers for spacing, 2 for opacity. */
  precision?: number;
  onChange: (next: number) => void;
  onReset?: () => void;
};

/**
 * Numeric slider (docs/tuner/TODO.md, 4.1).
 *
 * Hand-rolled on the responder system rather than pulling in
 * @react-native-community/slider: this is a dev-only tool and a native
 * dependency would mean a rebuild for anyone who installs it.
 *
 * Coordinates: `pageX` (screen-absolute) minus the track's measured window
 * origin. NOT `locationX` — that is relative to whichever view is under the
 * finger, so dragging across the knob flips the coordinate space from the
 * track to the 16px knob and the value stutters back and forth.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  precision = 0,
  onChange,
  onReset,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackRef = useRef<View>(null);
  const trackOriginX = useRef(0);

  const ratio = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;

  const apply = (pageX: number) => {
    if (trackWidth <= 0) return;
    const x = pageX - trackOriginX.current;
    const nextRatio = Math.min(1, Math.max(0, x / trackWidth));
    const raw = min + nextRatio * (max - min);
    const stepped = Math.round(raw / step) * step;
    // Re-round to kill float drift from steps like 0.05.
    const clean = Number(Math.min(max, Math.max(min, stepped)).toFixed(precision + 2));
    if (clean !== value) onChange(clean);
  };

  const onGrant = (event: GestureResponderEvent) => {
    const { pageX } = event.nativeEvent;
    // Measure at grant, not layout: the panel animates/repositions, so a
    // cached layout-time origin can be stale by the time a drag starts.
    trackRef.current?.measureInWindow((x, _y, width) => {
      trackOriginX.current = x;
      if (width > 0) setTrackWidth(width);
      apply(pageX);
    });
  };

  const onMove = (event: GestureResponderEvent) => apply(event.nativeEvent.pageX);

  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Pressable onPress={onReset} disabled={!onReset} hitSlop={8}>
          <Text style={[styles.value, onReset ? styles.valueEditable : null]}>
            {value.toFixed(precision)}
          </Text>
        </Pressable>
      </View>

      <View
        ref={trackRef}
        style={styles.track}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        // The panel's control list scrolls vertically; without this it can
        // steal a horizontal drag mid-gesture and the knob "drops".
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}>
        {/* pointerEvents="none": children must never become the touch target,
            or move events switch coordinate space mid-drag. */}
        <View pointerEvents="none" style={styles.trackBackground} />
        <View pointerEvents="none" style={[styles.fill, { width: `${ratio * 100}%` }]} />
        <View pointerEvents="none" style={[styles.knob, { left: `${ratio * 100}%` }]} />
      </View>
    </View>
  );
}

const ACCENT = '#00E0B8';

const styles = StyleSheet.create({
  row: {
    gap: 2,
    paddingVertical: 2,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
  },
  value: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  valueEditable: {
    color: ACCENT,
  },
  // Generous height so the whole row is a comfortable drag target.
  track: {
    height: 24,
    justifyContent: 'center',
  },
  trackBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  fill: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  knob: {
    position: 'absolute',
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
});
