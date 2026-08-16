import { summarizeSession } from './sessionSummary';
import type { SessionRecord } from '../session/mockSession';

function record(times: number[], completed = true): SessionRecord {
  return {
    completed,
    exchanges: times.map((t, i) => ({
      prompt: `Prompt ${i}`,
      transcript: `Answer ${i}`,
      timeToFirstWordMs: t,
    })),
  };
}

describe('summarizeSession', () => {
  it('returns undefined for a session with no exchanges', () => {
    expect(summarizeSession(record([]))).toBeUndefined();
  });

  it('takes the middle value for an odd count', () => {
    expect(summarizeSession(record([1400, 600, 1000]))?.medianMs).toBe(1000);
  });

  it('averages the middle pair for an even count', () => {
    expect(summarizeSession(record([1400, 600, 1000, 800]))?.medianMs).toBe(900);
  });

  it('highlights the exchange with the lowest time-to-first-word', () => {
    const summary = summarizeSession(record([1400, 600, 1000]));
    expect(summary?.fastest.timeToFirstWordMs).toBe(600);
  });

  it('summarizes partial sessions the same way — partials count', () => {
    const summary = summarizeSession(record([900], false));
    expect(summary?.medianMs).toBe(900);
  });
});
