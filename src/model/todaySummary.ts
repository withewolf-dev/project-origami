/**
 * Presentation logic for the Today screen.
 *
 * Kept out of the view so it can be unit-tested without a simulator — the
 * deterministic half of the shot's verification lives here.
 *
 * "Thought-speed" is time-to-first-word: how long after the prompt ends before
 * the user starts speaking. Lower is better, which is the whole presentation
 * problem this module exists to solve.
 */

export type TodaySummary = {
  /** Yesterday's median time-to-first-word, in milliseconds. */
  yesterdayMs: number;
  /** Median across the seven days before yesterday, if there is enough history. */
  previousWeekMs?: number;
  /** Consecutive days with at least one session, including yesterday. */
  streakDays: number;
};

/** Below this, two readings are the same to a human — don't claim a change. */
const MEANINGFUL_DELTA_MS = 100;

/** Seconds, one decimal. `1.4s` reads faster than `1400ms` and is honest at this precision. */
export function formatThoughtSpeed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * The sentence under the number. It carries direction, because "lower is better"
 * is not inferable from a numeral.
 *
 * Deliberately flat in both directions: no praise when faster, no apology or
 * encouragement when slower. The PRD forbids grading, and a cheerful message on
 * a bad day is grading with a smile on it.
 */
export function describeTrend(summary: TodaySummary): string {
  const { yesterdayMs, previousWeekMs } = summary;

  if (previousWeekMs === undefined) {
    return 'Your last session. Trends appear after a few more.';
  }

  const delta = yesterdayMs - previousWeekMs;

  if (Math.abs(delta) < MEANINGFUL_DELTA_MS) {
    return 'About the same as last week.';
  }

  return delta < 0 ? 'Faster than last week.' : 'A little slower than last week.';
}
