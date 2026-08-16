import {
  currentStreak,
  isSparse,
  latestMedian,
  SEEDED_HISTORY,
  type DayEntry,
} from './progressHistory';

describe('SEEDED_HISTORY', () => {
  it('covers exactly 14 days', () => {
    expect(SEEDED_HISTORY).toHaveLength(14);
  });

  it('ends in a six-day streak', () => {
    expect(currentStreak(SEEDED_HISTORY)).toBe(6);
  });

  it('is not sparse', () => {
    expect(isSparse(SEEDED_HISTORY)).toBe(false);
  });
});

describe('currentStreak', () => {
  it('is zero when the most recent day is a gap', () => {
    const history: DayEntry[] = [{ label: 'M', medianMs: 1500 }, { label: 'T' }];
    expect(currentStreak(history)).toBe(0);
  });

  it('counts only the trailing run, not earlier runs', () => {
    const history: DayEntry[] = [
      { label: 'M', medianMs: 1500 },
      { label: 'T', medianMs: 1500 },
      { label: 'W' },
      { label: 'T', medianMs: 1400 },
    ];
    expect(currentStreak(history)).toBe(1);
  });
});

describe('latestMedian', () => {
  it('skips trailing gaps to the last real session', () => {
    const history: DayEntry[] = [{ label: 'M', medianMs: 1500 }, { label: 'T' }];
    expect(latestMedian(history)).toBe(1500);
  });

  it('is undefined for an empty history', () => {
    expect(latestMedian([])).toBeUndefined();
  });
});

describe('isSparse', () => {
  it('treats fewer than three session days as sparse', () => {
    expect(isSparse([{ label: 'M', medianMs: 1 }, { label: 'T', medianMs: 2 }])).toBe(true);
    expect(
      isSparse([
        { label: 'M', medianMs: 1 },
        { label: 'T', medianMs: 2 },
        { label: 'W', medianMs: 3 },
      ])
    ).toBe(false);
  });
});
