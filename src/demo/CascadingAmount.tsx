import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

/** Enough slots for any amount this screen shows; index maps to character. */
const POOL = 16;
const STAGGER_MS = 35;
const DURATION_MS = 280;

type Props = {
  /** Currency glyph, rendered quieter and smaller than the digits. */
  symbol: string;
  /** Already-formatted amount, e.g. "1 234,50". */
  value: string;
};

/**
 * The amount, animated per character: when the value changes, every
 * character that actually changed drops in from below with a staggered
 * left-to-right cascade. Unchanged characters stay put, so typing "1" onto
 * "12" animates one digit, not the whole number.
 *
 * Each character is its own Animated.Text (a view, not a text run) because
 * transforms do not apply to nested <Text>. Built on RN's Animated with
 * useNativeDriver — opacity and transform only — so the cascade runs off the
 * JS thread.
 */
export function CascadingAmount({ symbol, value }: Props) {
  // State, not a ref: values are read during render, and reading refs there
  // is exactly what the hooks lint (rightly) forbids.
  const [anims] = useState(() => Array.from({ length: POOL }, () => new Animated.Value(1)));
  const previous = useRef(value);

  useEffect(() => {
    const before = previous.current;
    if (before === value) return;
    previous.current = value;

    const steps = [];
    for (let i = 0; i < value.length && i < POOL; i++) {
      if (before[i] === value[i]) continue;
      anims[i].setValue(0);
      steps.push(
        Animated.timing(anims[i], {
          toValue: 1,
          duration: DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      );
    }
    Animated.stagger(STAGGER_MS, steps).start();
  }, [value, anims]);

  return (
    <View style={styles.row}>
      <Text style={styles.symbol}>{symbol}</Text>
      {value.split('').map((character, index) => {
        const progress = anims[Math.min(index, POOL - 1)];
        return (
          <Animated.Text
            key={index}
            style={[
              styles.digit,
              {
                opacity: progress,
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [22, 0],
                    }),
                  },
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.86, 1],
                    }),
                  },
                ],
              },
            ]}>
            {character}
          </Animated.Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  symbol: {
    color: '#8E8E93',
    fontSize: 56,
    fontWeight: '700',
  },
  digit: {
    color: '#FFFFFF',
    fontSize: 76,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
