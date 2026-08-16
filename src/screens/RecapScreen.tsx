import { Button, Host, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';

import { gateLog } from '../gate';
import { formatThoughtSpeed } from '../model/todaySummary';
import { summarizeSession } from '../model/sessionSummary';
import type { SessionRecord } from '../session/mockSession';

type Props = {
  record: SessionRecord;
  onDone: () => void;
};

/**
 * Recap — one number, one moment, one exit.
 *
 * Structure decided in docs/design/think-in-english/recap-pass2-structure.md:
 * the number takes full contrast (it is the news; Today's yesterday-number is
 * secondary), the highlight is factual rather than congratulatory, partials
 * are unmarked, and Done sits exactly where Today's Start session sits.
 */
export function RecapScreen({ record, onDone }: Props) {
  const summary = summarizeSession(record);

  return (
    <Host style={{ flex: 1 }}>
      {/* No flexbox past this point — SwiftUI owns layout inside Host. */}
      <VStack spacing={12} modifiers={[padding({ horizontal: 24, top: 8, bottom: 40 })]}>
        {summary ? (
          <VStack
            spacing={4}
            alignment="leading"
            modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
            <Text
              modifiers={[
                font({ textStyle: 'largeTitle', weight: 'semibold' }),
                monospacedDigit(),
              ]}>
              {formatThoughtSpeed(summary.medianMs)}
            </Text>
            <Text modifiers={[font({ textStyle: 'body' })]}>Median time to first word.</Text>

            {/* The moment: factual, quieter than the number. One, never a list. */}
            <VStack
              spacing={4}
              alignment="leading"
              modifiers={[
                padding({ all: 16 }),
                frame({ maxWidth: Infinity, alignment: 'leading' }),
                background('secondarySystemBackground', shapes.roundedRectangle({ cornerRadius: 12 })),
                padding({ top: 16 }),
              ]}>
              <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('secondary')]}>
                Fastest answer
              </Text>
              <Text modifiers={[font({ textStyle: 'body' })]}>
                {`“${summary.fastest.prompt}”`}
              </Text>
              <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle('secondary')]}>
                {`You started answering in ${formatThoughtSpeed(summary.fastest.timeToFirstWordMs)}.`}
              </Text>
            </VStack>
          </VStack>
        ) : (
          // Zero exchanges. A fact, not a verdict — no advice, no sad state.
          <Text modifiers={[font({ textStyle: 'body' })]}>Nothing measured this time.</Text>
        )}

        {/* Deliberate emptiness — three screens, one rhythm. */}
        <Spacer />

        <Button
          label="Done"
          onPress={() => {
            gateLog('recap-done');
            onDone();
          }}
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
