import { Chart, Host, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, padding } from '@expo/ui/swift-ui/modifiers';
import { PlatformColor } from 'react-native';

import { formatThoughtSpeed } from '../model/todaySummary';
import {
  currentStreak,
  isSparse,
  latestMedian,
  SEEDED_HISTORY,
  type DayEntry,
} from '../model/progressHistory';

type Props = {
  history?: DayEntry[];
};

/**
 * Progress — the line going down.
 *
 * Structure decided in docs/design/think-in-english/progress-pass2-structure.md:
 * two titled sections (trend, streak), gaps uncommented, no derived stats,
 * read-only. Seeded history until shot 07 supplies real records.
 */
export function ProgressScreen({ history = SEEDED_HISTORY }: Props) {
  const streak = currentStreak(history);
  const median = latestMedian(history);

  return (
    <Host style={{ flex: 1 }}>
      {/* No flexbox past this point — SwiftUI owns layout inside Host. */}
      <VStack
        spacing={8}
        alignment="leading"
        modifiers={[padding({ horizontal: 24, top: 8, bottom: 40 })]}>
        {/* Same numbers Today shows — this screen elaborates, never competes. */}
        {median !== undefined && (
          <Text modifiers={[font({ textStyle: 'body' })]}>
            {`${formatThoughtSpeed(median)} · ${streak === 1 ? '1 day in a row' : `${streak} days in a row`}`}
          </Text>
        )}

        <SectionHeader title="Thought-speed" />
        {isSparse(history) ? (
          <Text modifiers={[font({ textStyle: 'body' })]}>
            Trends appear after a few more sessions.
          </Text>
        ) : (
          <VStack spacing={4} alignment="leading">
            <Chart
              type="bar"
              data={history.map((day, i) => ({
                // Index keeps duplicate weekday labels distinct; gaps render
                // as zero-height bars — a visible absence, uncommented.
                x: `${i}`,
                y: day.medianMs ?? 0,
                // One accent for one series — per-category rainbow is noise.
                color: PlatformColor('systemBlue'),
              }))}
              showGrid={false}
              animate={false}
              style={{ height: 180 }}
            />
            {/* Direction is not inferable from a bar chart. State it. */}
            <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('secondary')]}>
              Last 14 days. Lower is faster.
            </Text>
          </VStack>
        )}

        <SectionHeader title="Streak" />
        <VStack spacing={8} alignment="leading">
          {/* Filled/hollow is shape, never color-only; the count is text. */}
          <HStack spacing={6}>
            {history.map((day, i) => (
              <Image
                key={i}
                systemName={day.medianMs !== undefined ? 'circle.fill' : 'circle'}
                size={12}
                modifiers={[
                  foregroundStyle(day.medianMs !== undefined ? 'tint' : 'quaternary'),
                ]}
              />
            ))}
          </HStack>
          <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('secondary')]}>
            {streak === 1 ? '1 day in a row' : `${streak} days in a row`}
          </Text>
        </VStack>

        <Spacer />
      </VStack>
    </Host>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text
      modifiers={[
        font({ textStyle: 'headline' }),
        padding({ top: 16 }),
        frame({ maxWidth: Infinity, alignment: 'leading' }),
      ]}>
      {title}
    </Text>
  );
}
