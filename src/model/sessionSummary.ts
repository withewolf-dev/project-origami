/**
 * Presentation logic for the Recap screen — pure and unit-testable,
 * same split as todaySummary.ts.
 */

import type { Exchange, SessionRecord } from '../session/mockSession';

export type SessionSummary = {
  /** Median time-to-first-word across the session's exchanges, in ms. */
  medianMs: number;
  /** The exchange answered with the least hesitation. */
  fastest: Exchange;
};

/** Undefined when nothing was measured — the zero-exchange partial. */
export function summarizeSession(record: SessionRecord): SessionSummary | undefined {
  if (record.exchanges.length === 0) return undefined;

  const sorted = [...record.exchanges].sort(
    (a, b) => a.timeToFirstWordMs - b.timeToFirstWordMs
  );
  const mid = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 1
      ? sorted[mid].timeToFirstWordMs
      : (sorted[mid - 1].timeToFirstWordMs + sorted[mid].timeToFirstWordMs) / 2;

  return { medianMs, fastest: sorted[0] };
}
