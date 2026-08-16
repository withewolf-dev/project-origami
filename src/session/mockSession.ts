/**
 * Mock-voice session driver — shot 05's stand-in for the real engine.
 *
 * Shots 02 (voice) and 04 (session engine) replace this behind the same
 * callback surface. Until then it scripts a short session: speak a prompt,
 * "hear" a canned reply arrive word by word, think, advance. Deterministic
 * timings so tests can drive it with fake timers.
 */

export type SessionPhase = 'speaking' | 'listening' | 'thinking' | 'complete';

export type Exchange = {
  prompt: string;
  transcript: string;
  timeToFirstWordMs: number;
};

export type SessionRecord = {
  exchanges: Exchange[];
  /** False when the user ended the session early. Partial sessions still count. */
  completed: boolean;
};

export type MockPrompt = {
  text: string;
  tier: 1 | 2 | 3;
  reply: string;
  timeToFirstWordMs: number;
  /** Tier-3 prompts carry a countdown; undefined elsewhere. */
  countdownSeconds?: number;
};

/** Two prompts per tier — enough to exercise every state the screen renders. */
export const MOCK_PROMPTS: MockPrompt[] = [
  { text: 'Quick — something cold.', tier: 1, reply: 'Ice cream', timeToFirstWordMs: 800 },
  { text: 'Quick — the opposite of early.', tier: 1, reply: 'Late', timeToFirstWordMs: 650 },
  { text: 'Describe what is directly in front of you.', tier: 2, reply: 'A wooden desk with my laptop and a cup of coffee', timeToFirstWordMs: 1100 },
  { text: 'Describe the weather outside right now.', tier: 2, reply: 'It looks sunny but a little windy', timeToFirstWordMs: 950 },
  { text: 'Is it better to work early in the morning or late at night?', tier: 3, reply: 'I think mornings are better because my head is clear', timeToFirstWordMs: 1400, countdownSeconds: 8 },
  { text: 'Should everyone learn a second language? Why?', tier: 3, reply: 'Yes because it changes how you see your own language', timeToFirstWordMs: 1250, countdownSeconds: 8 },
];

export type SessionCallbacks = {
  onPhase: (phase: SessionPhase, prompt?: MockPrompt) => void;
  onTranscript: (text: string) => void;
  onCountdown: (secondsLeft: number | undefined) => void;
  onComplete: (record: SessionRecord) => void;
};

export const MOCK_TIMINGS = {
  speakMs: 2200,
  wordMs: 280,
  thinkMs: 700,
};

export class MockSessionDriver {
  private timers: ReturnType<typeof setTimeout>[] = [];
  private exchanges: Exchange[] = [];
  private finished = false;

  constructor(
    private callbacks: SessionCallbacks,
    private prompts: MockPrompt[] = MOCK_PROMPTS
  ) {}

  start(): void {
    this.runPrompt(0);
  }

  /** Early end. Saves whatever happened — a partial session is a valid session. */
  end(): void {
    if (this.finished) return;
    this.finish(false);
  }

  private runPrompt(index: number): void {
    if (index >= this.prompts.length) {
      this.finish(true);
      return;
    }
    const prompt = this.prompts[index];

    this.callbacks.onPhase('speaking', prompt);
    this.callbacks.onCountdown(undefined);
    this.callbacks.onTranscript('');

    this.after(MOCK_TIMINGS.speakMs, () => {
      this.callbacks.onPhase('listening', prompt);
      if (prompt.countdownSeconds !== undefined) {
        this.tickCountdown(prompt.countdownSeconds);
      }

      const words = prompt.reply.split(' ');
      words.forEach((_, i) => {
        this.after(prompt.timeToFirstWordMs + i * MOCK_TIMINGS.wordMs, () => {
          this.callbacks.onTranscript(words.slice(0, i + 1).join(' '));
        });
      });

      const utteranceMs = prompt.timeToFirstWordMs + words.length * MOCK_TIMINGS.wordMs;
      this.after(utteranceMs, () => {
        this.exchanges.push({
          prompt: prompt.text,
          transcript: prompt.reply,
          timeToFirstWordMs: prompt.timeToFirstWordMs,
        });
        this.callbacks.onPhase('thinking', prompt);
        this.callbacks.onCountdown(undefined);
        this.after(MOCK_TIMINGS.thinkMs, () => this.runPrompt(index + 1));
      });
    });
  }

  private tickCountdown(seconds: number): void {
    this.callbacks.onCountdown(seconds);
    if (seconds > 0) {
      this.after(1000, () => this.tickCountdown(seconds - 1));
    }
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(() => {
      if (!this.finished) fn();
    }, ms));
  }

  private finish(completed: boolean): void {
    this.finished = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.callbacks.onPhase('complete');
    this.callbacks.onComplete({ exchanges: this.exchanges, completed });
  }
}
