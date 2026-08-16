import {
  Button,
  Gauge,
  Host,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';

import { gateLog } from '../gate';
import {
  MockSessionDriver,
  type MockPrompt,
  type SessionPhase,
  type SessionRecord,
} from '../session/mockSession';

type Props = {
  onDone: (record: SessionRecord) => void;
};

/** One word per state, always paired with the mark — never color-only. */
const PHASE_LABEL: Record<Exclude<SessionPhase, 'complete'>, string> = {
  speaking: 'Speaking',
  listening: 'Your turn',
  thinking: 'Thinking',
};

const PHASE_SYMBOL = {
  speaking: 'speaker.wave.2.fill',
  listening: 'waveform',
  thinking: 'ellipsis',
} as const;

/**
 * Session — the focused, full-screen mode.
 *
 * Structure decided in docs/design/think-in-english/session-pass2-structure.md:
 * no navigation title (the state indicator is the orientation), the squint test
 * lands on the state region, the lower third stays empty. Mock-voice mode drives
 * it until shots 02/04 supply the real engine behind the same callbacks.
 */
export function SessionScreen({ onDone }: Props) {
  useKeepAwake();

  const [phase, setPhase] = useState<Exclude<SessionPhase, 'complete'>>('speaking');
  const [prompt, setPrompt] = useState<MockPrompt | undefined>();
  const [transcript, setTranscript] = useState('');
  const [countdown, setCountdown] = useState<number | undefined>();
  const driverRef = useRef<MockSessionDriver | null>(null);
  const heardThisExchange = useRef(false);

  useEffect(() => {
    gateLog('session-started');
    const driver = new MockSessionDriver({
      onPhase: (next, p) => {
        if (next === 'complete') return; // onComplete owns the exit
        gateLog(`state:${next}`);
        heardThisExchange.current = false;
        setPhase(next);
        if (p) setPrompt(p);
      },
      onTranscript: (text) => {
        if (text && !heardThisExchange.current) {
          heardThisExchange.current = true;
          gateLog('transcript-updated');
        }
        setTranscript(text);
      },
      onCountdown: setCountdown,
      onComplete: (record) => {
        gateLog(record.completed ? 'session-complete' : 'session-ended-early');
        onDone(record);
      },
    });
    driverRef.current = driver;
    driver.start();
    return () => driver.end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Host style={{ flex: 1 }}>
      {/* No flexbox past this point — SwiftUI owns layout inside Host. */}
      <VStack spacing={16} modifiers={[padding({ horizontal: 24, top: 8, bottom: 40 })]}>
        {/* End: top trailing, one tap, no confirmation — a partial still counts. */}
        <HStack>
          <Spacer />
          <Button
            systemImage="xmark"
            label=""
            onPress={() => driverRef.current?.end()}
            modifiers={[buttonStyle('bordered'), foregroundStyle('secondary')]}
          />
        </HStack>

        <Spacer modifiers={[frame({ maxHeight: 40 })]} />

        {/* State region — the anchor. Shape + label always agree; the mark
            animates only once real voice exists (shot 02), so it is honest
            about the mock: static, but never ambiguous. */}
        <VStack spacing={12}>
          <Image
            systemName={PHASE_SYMBOL[phase]}
            size={56}
            modifiers={[foregroundStyle(phase === 'listening' ? 'tint' : 'secondary')]}
          />
          <Text modifiers={[font({ textStyle: 'title2', weight: 'semibold' })]}>
            {PHASE_LABEL[phase]}
          </Text>
          {countdown !== undefined && (
            <Gauge
              value={countdown}
              min={0}
              max={prompt?.countdownSeconds ?? 1}
              currentValueLabel={<Text>{String(countdown)}</Text>}
              modifiers={[gaugeStyle('circularCapacity'), frame({ width: 52, height: 52 })]}
            />
          )}
        </VStack>

        {/* The prompt recedes but stays recoverable once it's the user's turn. */}
        {prompt && (
          <Text
            modifiers={[
              font({ textStyle: 'title3' }),
              foregroundStyle(phase === 'speaking' ? 'primary' : 'secondary'),
              padding({ top: 16 }),
            ]}>
            {prompt.text}
          </Text>
        )}

        {/* One line, self-replacing. Evidence of being heard, not a chat log. */}
        {transcript !== '' && (
          <Text modifiers={[font({ textStyle: 'body' }), foregroundStyle('secondary')]}>
            {transcript}
          </Text>
        )}

        {/* Deliberate emptiness — nothing competes with the state. */}
        <Spacer />
      </VStack>
    </Host>
  );
}
