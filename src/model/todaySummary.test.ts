import { describeTrend, formatThoughtSpeed } from './todaySummary';

describe('formatThoughtSpeed', () => {
  it('renders milliseconds as seconds with one decimal', () => {
    expect(formatThoughtSpeed(1400)).toBe('1.4s');
    expect(formatThoughtSpeed(900)).toBe('0.9s');
    expect(formatThoughtSpeed(2000)).toBe('2.0s');
  });

  it('rounds rather than truncating', () => {
    expect(formatThoughtSpeed(1460)).toBe('1.5s');
    expect(formatThoughtSpeed(1440)).toBe('1.4s');
  });
});

describe('describeTrend', () => {
  it('explains that trends need more history when there is no previous week', () => {
    expect(describeTrend({ yesterdayMs: 1400, streakDays: 1 })).toBe(
      'Your last session. Trends appear after a few more.'
    );
  });

  it('reports faster when meaningfully below last week', () => {
    expect(
      describeTrend({ yesterdayMs: 1400, previousWeekMs: 1900, streakDays: 6 })
    ).toBe('Faster than last week.');
  });

  it('reports slower without praise or apology when meaningfully above', () => {
    expect(
      describeTrend({ yesterdayMs: 2100, previousWeekMs: 1900, streakDays: 6 })
    ).toBe('A little slower than last week.');
  });

  it('treats sub-100ms deltas as no change, in both directions', () => {
    expect(
      describeTrend({ yesterdayMs: 1950, previousWeekMs: 1900, streakDays: 6 })
    ).toBe('About the same as last week.');
    expect(
      describeTrend({ yesterdayMs: 1850, previousWeekMs: 1900, streakDays: 6 })
    ).toBe('About the same as last week.');
  });
});
