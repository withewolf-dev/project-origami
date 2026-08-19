import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { liveMotion, registerMotion, registerMotionReplay } from '../devtools/tuner/motion';

/** Enough slots for any amount this screen shows; index maps to character. */
const POOL = 16;

const MOTION_ID = 'src/demo/CascadingAmount.tsx';

/**
 * The cascade's feel, in one place so the tuner can offer it as a Motion
 * section and write edits back here. Spring physics rather than a duration
 * curve: damping/stiffness/mass are the knobs that actually answer "softer"
 * and "faster".
 */
export const MOTION = {
  // Just past critical damping (2·√(stiffness·mass) ≈ 19) so each glyph glides
  // to rest without overshoot, and a soft stagger so the cascade reads as one
  // wave travelling left to right rather than a simultaneous snap.
  stagger: 45,
  damping: 20,
  stiffness: 90,
  mass: 1,
  rise: 44,
  startScale: 0.78,
};

registerMotion(MOTION_ID, 'MOTION', MOTION, {
  stagger: { min: 0, max: 160, step: 1, label: 'Stagger (ms)' },
  damping: { min: 1, max: 40, step: 0.5, label: 'Damping · lower = bouncier' },
  stiffness: { min: 20, max: 500, step: 5, label: 'Stiffness · higher = faster' },
  mass: { min: 0.2, max: 4, step: 0.05, label: 'Mass · higher = heavier' },
  rise: { min: 0, max: 80, step: 1, label: 'Rise (px)' },
  startScale: { min: 0.2, max: 1, step: 0.02, label: 'Start scale' },
});

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
  const motion = liveMotion(MOTION_ID, MOTION);

  // Replay registration: how this component demos itself. The tuner calls it
  // automatically (debounced) whenever a motion value changes, and from the
  // Replay buttons — every glyph re-cascades so the new feel is visible
  // without touching the keypad.
  useEffect(() => {
    return registerMotionReplay(MOTION_ID, () => {
      const feel = liveMotion(MOTION_ID, MOTION);
      const steps = [];
      const length = Math.min(previous.current.length, POOL);
      for (let i = 0; i < length; i++) {
        anims[i].setValue(0);
        steps.push(
          Animated.spring(anims[i], {
            toValue: 1,
            damping: feel.damping,
            stiffness: feel.stiffness,
            mass: feel.mass,
            useNativeDriver: true,
          }),
        );
      }
      Animated.stagger(feel.stagger, steps).start();
    });
  }, [anims]);

  // `motion` is intentionally NOT a dependency: retuning mid-flight should
  // not replay the cascade — the next value change picks up the new feel.
  useEffect(() => {
    const before = previous.current;
    if (before === value) return;
    previous.current = value;

    const steps = [];
    for (let i = 0; i < value.length && i < POOL; i++) {
      if (before[i] === value[i]) continue;
      anims[i].setValue(0);
      steps.push(
        Animated.spring(anims[i], {
          toValue: 1,
          damping: motion.damping,
          stiffness: motion.stiffness,
          mass: motion.mass,
          useNativeDriver: true,
        }),
      );
    }
    Animated.stagger(motion.stagger, steps).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                      outputRange: [motion.rise, 0],
                    }),
                  },
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [motion.startScale, 1],
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
    // Same size as the digits, so the symbol matches their cap height exactly;
    // it stays quieter through colour alone. Baseline alignment then needs no
    // nudge — equal font sizes already put the tops in line.
    fontSize: 76,
    fontWeight: '700',
    marginRight: 8,
  },
  digit: {
    color: '#FFFFFF',
    fontSize: 76,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
