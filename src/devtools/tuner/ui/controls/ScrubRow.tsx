import { useRef, useState } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { ACCENT, HAIRLINE, MONO, TEXT_DIM, TEXT_HOT, TEXT_MID } from '../theme';

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Decimal places to display. Integers for spacing, 2 for opacity. */
  precision?: number;
  /** True when this key has a pending (unsaved) override. */
  dirty: boolean;
  onChange: (next: number) => void;
  onReset: () => void;
  /** Set when this shorthand has per-side/per-corner children (10.6). */
  onToggleChildren?: () => void;
  childrenExpanded?: boolean;
};

/**
 * A scrub row: the whole row is the control. Drag anywhere on it and the
 * value moves RELATIVE to where it was — a full row-width of travel spans the
 * whole range, and touching the row never jumps the value (the old
 * track+knob slider snapped to the touch point). The hairline along the
 * bottom edge shows where the value sits in its range; it and the value
 * light up while scrubbing, and stay lit while the key is dirty.
 */
export function ScrubRow({
  label,
  value,
  min,
  max,
  step,
  precision = 0,
  dirty,
  onChange,
  onReset,
  onToggleChildren,
  childrenExpanded,
}: Props) {
  const rowWidth = useRef(0);
  const grantX = useRef(0);
  const grantValue = useRef(0);
  const [scrubbing, setScrubbing] = useState(false);

  const ratio = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;

  const move = (event: GestureResponderEvent) => {
    if (rowWidth.current <= 0) return;
    const dx = event.nativeEvent.pageX - grantX.current;
    const raw = grantValue.current + (dx * (max - min)) / rowWidth.current;
    const stepped = Math.round(raw / step) * step;
    // Re-round to kill float drift from steps like 0.05.
    const clean = Number(clamp(stepped, min, max).toFixed(precision + 2));
    if (clean !== value) onChange(clean);
  };

  return (
    <View
      accessibilityLabel={`${label} ${value.toFixed(precision)}`}
      style={styles.row}
      onLayout={(event) => {
        rowWidth.current = event.nativeEvent.layout.width;
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      // The panel's list scrolls vertically; never let it steal a scrub.
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        grantX.current = event.nativeEvent.pageX;
        grantValue.current = value;
        setScrubbing(true);
      }}
      onResponderMove={move}
      onResponderRelease={() => setScrubbing(false)}
      onResponderTerminate={() => setScrubbing(false)}>
      {onToggleChildren ? (
        // A Pressable child claims its own touches, so the chevron never
        // starts a scrub.
        <Pressable accessibilityLabel={`${label} per side`} hitSlop={10} onPress={onToggleChildren}>
          <Text style={styles.chevron}>{childrenExpanded ? '▾' : '▸'}</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.label, scrubbing ? styles.labelHot : null]}>{label}</Text>

      <Text style={[styles.value, dirty || scrubbing ? styles.valueHot : null]}>
        {value.toFixed(precision)}
      </Text>

      {/* Fixed-width slot so the value column never shifts as ↺ appears. */}
      <View style={styles.resetSlot}>
        {dirty && !scrubbing ? (
          <Pressable accessibilityLabel={`Reset ${label}`} hitSlop={10} onPress={onReset}>
            <Text style={styles.reset}>↺</Text>
          </Pressable>
        ) : null}
      </View>

      <View pointerEvents="none" style={styles.rangeBase} />
      <View
        pointerEvents="none"
        style={[
          styles.rangeFill,
          { width: `${ratio * 100}%` },
          scrubbing || dirty ? styles.rangeFillHot : null,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevron: {
    color: TEXT_DIM,
    fontSize: 11,
    marginRight: 6,
  },
  label: {
    flex: 1,
    color: TEXT_MID,
    fontSize: 12,
  },
  labelHot: {
    color: TEXT_HOT,
  },
  value: {
    color: TEXT_HOT,
    fontFamily: MONO,
    fontSize: 13,
  },
  valueHot: {
    color: ACCENT,
  },
  resetSlot: {
    width: 22,
    alignItems: 'flex-end',
  },
  reset: {
    color: TEXT_DIM,
    fontSize: 13,
  },
  rangeBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: HAIRLINE,
  },
  rangeFill: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  rangeFillHot: {
    backgroundColor: ACCENT,
  },
});
