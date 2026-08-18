import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ACCENT, HAIRLINE, MONO, TEXT_DIM, TEXT_HOT, TEXT_MID } from '../theme';

/** iOS system colours plus neutrals — enough to explore without a picker. */
const SWATCHES = [
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#00C7BE',
  '#0A84FF',
  '#5856D6',
  '#AF52DE',
  '#FFFFFF',
  '#8E8E93',
  '#3C3C43',
  '#000000',
];

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

type Props = {
  label: string;
  /** Current value as rendered — may be a non-hex form like 'red' or rgba(). */
  value: string | null;
  dirty: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: string) => void;
  onReset: () => void;
};

/**
 * A colour row: collapsed it is one line — label, live chip, current value —
 * and tapping it expands the swatch grid and hex field inline. Colour can't
 * be scrubbed, so it earns the panel's only disclosure.
 */
export function ColorRow({ label, value, dirty, expanded, onToggle, onChange, onReset }: Props) {
  const [draft, setDraft] = useState(value ?? '');

  // Re-seed when the selection (or the colour) changes, so the field follows
  // the element. React's "adjust state during render" pattern — an effect
  // here would be a render-then-repaint round trip.
  const [seededFrom, setSeededFrom] = useState(value);
  if (value !== seededFrom) {
    setSeededFrom(value);
    setDraft(value ?? '');
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (HEX.test(trimmed)) onChange(trimmed);
    else setDraft(value ?? '');
  };

  return (
    <View style={styles.block}>
      <Pressable
        accessibilityLabel={`${label} ${value ?? 'not set'}`}
        style={styles.row}
        onPress={onToggle}>
        <Text style={[styles.label, expanded ? styles.labelHot : null]}>{label}</Text>

        <View
          style={[styles.chip, value ? { backgroundColor: value } : styles.chipEmpty]}
        />
        <Text style={[styles.value, dirty ? styles.valueHot : null]} numberOfLines={1}>
          {value ?? '—'}
        </Text>

        <View style={styles.resetSlot}>
          {dirty ? (
            <Pressable accessibilityLabel={`Reset ${label}`} hitSlop={10} onPress={onReset}>
              <Text style={styles.reset}>↺</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.disclosure}>
          <View style={styles.swatches}>
            {SWATCHES.map((color) => {
              const selected = value?.toLowerCase() === color.toLowerCase();
              return (
                <Pressable
                  key={color}
                  accessibilityLabel={`${label} ${color}`}
                  onPress={() => onChange(color)}
                  style={[
                    styles.swatch,
                    { backgroundColor: color },
                    selected ? styles.swatchSelected : null,
                  ]}
                />
              );
            })}
          </View>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onBlur={commit}
            onSubmitEditing={commit}
            placeholder="#RRGGBB"
            placeholderTextColor={TEXT_DIM}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
  },
  row: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    flex: 1,
    color: TEXT_MID,
    fontSize: 12,
  },
  labelHot: {
    color: TEXT_HOT,
  },
  chip: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  chipEmpty: {
    borderStyle: 'dashed',
  },
  value: {
    color: TEXT_HOT,
    fontFamily: MONO,
    fontSize: 12,
    maxWidth: 110,
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
  disclosure: {
    paddingBottom: 10,
    gap: 8,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  swatchSelected: {
    borderWidth: 2,
    borderColor: ACCENT,
  },
  input: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: TEXT_HOT,
    fontFamily: MONO,
    fontSize: 12,
  },
});
