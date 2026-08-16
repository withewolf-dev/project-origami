import {
  Button,
  ContentUnavailableView,
  Host,
  Spacer,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
} from '@expo/ui/swift-ui/modifiers';

import { formatThoughtSpeed, describeTrend, type TodaySummary } from '../model/todaySummary';

type Props = {
  /** Yesterday's result and current streak. Undefined until the first session exists. */
  summary?: TodaySummary;
  onStartSession: () => void;
};

/**
 * Today — the launch screen.
 *
 * Structure decided in docs/design/think-in-english/today-pass2-structure.md:
 * the eye must land on Start session first, the number second, the streak last.
 * The number is large but low-contrast — big, not loud.
 */
export function TodayScreen({ summary, onStartSession }: Props) {
  return (
    <Host style={{ flex: 1 }}>
      {/* No flexbox past this point — SwiftUI owns layout inside Host. */}
      <VStack spacing={12} modifiers={[padding({ horizontal: 24, top: 8, bottom: 40 })]}>
        {summary ? <Result summary={summary} /> : <FirstRun />}

        {/* Deliberate emptiness. At the largest Dynamic Type size this is what
            gives way, so the primary action stays on screen. */}
        <Spacer />

        <Button
          label="Start session"
          onPress={onStartSession}
          modifiers={[
            buttonStyle('borderedProminent'),
            controlSize('large'),
            frame({ maxWidth: Infinity }),
          ]}
        />
      </VStack>
    </Host>
  );
}

function Result({ summary }: { summary: TodaySummary }) {
  return (
    <VStack spacing={4} alignment="leading" modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
      {/* Big, but secondary-coloured: it reads as calm rather than as a score. */}
      <Text
        modifiers={[
          font({ textStyle: 'largeTitle', weight: 'semibold' }),
          monospacedDigit(),
          foregroundStyle('secondary'),
        ]}>
        {formatThoughtSpeed(summary.yesterdayMs)}
      </Text>

      {/* The number alone is meaningless because lower is better and nobody
          infers that. This sentence carries the direction. */}
      <Text modifiers={[font({ textStyle: 'body' })]}>{describeTrend(summary)}</Text>

      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('secondary')]}>
        {summary.streakDays === 1 ? '1 day in a row' : `${summary.streakDays} days in a row`}
      </Text>
    </VStack>
  );
}

/**
 * Day one. Not a zero, not a skeleton shaped like the eventual content —
 * a plain invitation stating what this costs. This is the only onboarding.
 */
function FirstRun() {
  return (
    <ContentUnavailableView
      title="Think in English"
      systemImage="waveform"
      description="Five minutes, out loud. Answer fast enough that there's no time to translate."
    />
  );
}
