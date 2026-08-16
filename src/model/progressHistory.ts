/**
 * Seeded 14-day history for the Progress screen — shot 08's stand-in until
 * shot 07 (local persistence) supplies real session records.
 *
 * Deterministic on purpose: the walkthrough asserts exact bars and a matching
 * streak, so the data must be the same on every launch.
 */

export type DayEntry = {
  /** Short weekday label, oldest first. */
  label: string;
  /** Median thought-speed for that day; undefined = no session (a gap). */
  medianMs?: number;
};

/**
 * Fourteen days, oldest first: a believable downward trend with two gaps,
 * ending in a six-day run — matching the shape Today's demo data implies.
 */
export const SEEDED_HISTORY: DayEntry[] = [
  { label: 'M', medianMs: 1950 },
  { label: 'T', medianMs: 1900 },
  { label: 'W', medianMs: 1980 },
  { label: 'T', medianMs: 1820 },
  { label: 'F' }, // gap
  { label: 'S', medianMs: 1750 },
  { label: 'S', medianMs: 1700 },
  { label: 'M' }, // gap
  { label: 'T', medianMs: 1650 },
  { label: 'W', medianMs: 1600 },
  { label: 'T', medianMs: 1520 },
  { label: 'F', medianMs: 1480 },
  { label: 'S', medianMs: 1450 },
  { label: 'S', medianMs: 1400 },
];

/** Consecutive session days counted back from the most recent day. */
export function currentStreak(history: DayEntry[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].medianMs === undefined) break;
    streak++;
  }
  return streak;
}

/** Most recent day with a session, for the summary line. */
export function latestMedian(history: DayEntry[]): number | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const ms = history[i].medianMs;
    if (ms !== undefined) return ms;
  }
  return undefined;
}

/** True when there is too little data for a trend to mean anything. */
export function isSparse(history: DayEntry[]): boolean {
  return history.filter((d) => d.medianMs !== undefined).length < 3;
}
