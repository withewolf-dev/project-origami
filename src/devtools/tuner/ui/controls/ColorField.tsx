import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
  onChange: (next: string) => void;
  onReset?: () => void;
};

/**
 * Colour control (docs/tuner/TODO.md, 4.3).
 *
 * Swatch grid plus a hex field. No colour wheel in v1 — a picker is a lot of
 * surface for a dev tool, and swatches plus typed hex covers the actual job of
 * trying a colour and committing it.
 */
export function ColorField({ label, value, onChange, onReset }: Props) {
  const [draft, setDraft] = useState(value ?? '');

  // Re-seed when the selection (or the colour) changes, so the field follows
  // the element. This is React's "adjust state during render" pattern — an
  // effect here would be a render-then-repaint round trip and trips
  // react-hooks/set-state-in-effect.
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
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        <Pressable onPress={onReset} disabled={!onReset} hitSlop={8}>
          <Text style={[styles.reset, onReset ? styles.resetActive : null]}>reset</Text>
        </Pressable>
      </View>

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
        placeholderTextColor="rgba(255,255,255,0.3)"
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

const ACCENT = '#00E0B8';

const styles = StyleSheet.create({
  row: {
    gap: 6,
    paddingVertical: 3,
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
  reset: {
    color: 'rgba(255, 255, 255, 0.25)',
    fontSize: 11,
  },
  resetActive: {
    color: ACCENT,
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#FFFFFF',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
