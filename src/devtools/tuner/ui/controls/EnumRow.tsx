import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ACCENT, TEXT_DIM, TEXT_MID } from '../theme';

/** "flex-start" → "start", "space-between" → "between": chips stay short. */
function shortLabel(option: string): string {
  return option.replace('flex-', '').replace('space-', '');
}

type Props = {
  label: string;
  options: readonly string[];
  /** Current value as rendered, or null when unset. */
  value: string | null;
  dirty: boolean;
  onChange: (next: string) => void;
  onReset: () => void;
};

/** Enum control (10.3): a chip group — discrete values are taps, not scrubs. */
export function EnumRow({ label, options, value, dirty, onChange, onReset }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              accessibilityLabel={`${label} ${option}`}
              onPress={() => onChange(option)}
              style={[styles.chip, selected ? styles.chipSelected : null]}>
              <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
                {shortLabel(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.resetSlot}>
        {dirty ? (
          <Pressable accessibilityLabel={`Reset ${label}`} hitSlop={10} onPress={onReset}>
            <Text style={styles.reset}>↺</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    width: 72,
    color: TEXT_MID,
    fontSize: 12,
  },
  chips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    justifyContent: 'flex-end',
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  chipSelected: {
    backgroundColor: ACCENT,
  },
  chipLabel: {
    color: TEXT_MID,
    fontSize: 11,
    fontWeight: '600',
  },
  chipLabelSelected: {
    color: '#00312A',
  },
  resetSlot: {
    width: 22,
    alignItems: 'flex-end',
  },
  reset: {
    color: TEXT_DIM,
    fontSize: 13,
  },
});
