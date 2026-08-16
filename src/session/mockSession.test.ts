import {
  MockSessionDriver,
  MOCK_PROMPTS,
  type SessionPhase,
  type SessionRecord,
} from './mockSession';

function makeHarness(prompts = MOCK_PROMPTS) {
  const phases: SessionPhase[] = [];
  const transcripts: string[] = [];
  let record: SessionRecord | undefined;
  const driver = new MockSessionDriver(
    {
      onPhase: (phase) => phases.push(phase),
      onTranscript: (text) => transcripts.push(text),
      onCountdown: () => {},
      onComplete: (r) => {
        record = r;
      },
    },
    prompts
  );
  return { driver, phases, transcripts, getRecord: () => record };
}

describe('MockSessionDriver', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs every prompt through speaking → listening → thinking and completes', () => {
    const { driver, phases, getRecord } = makeHarness();
    driver.start();
    jest.runAllTimers();

    const record = getRecord();
    expect(record?.completed).toBe(true);
    expect(record?.exchanges).toHaveLength(MOCK_PROMPTS.length);
    expect(phases.filter((p) => p === 'speaking')).toHaveLength(MOCK_PROMPTS.length);
    expect(phases.filter((p) => p === 'listening')).toHaveLength(MOCK_PROMPTS.length);
    expect(phases[phases.length - 1]).toBe('complete');
  });

  it('streams the transcript incrementally, ending on the full reply', () => {
    const { driver, transcripts } = makeHarness();
    driver.start();
    jest.runAllTimers();

    expect(transcripts).toContain(MOCK_PROMPTS[0].reply.split(' ')[0]);
    expect(transcripts).toContain(MOCK_PROMPTS[0].reply);
  });

  it('ending early yields a partial record with the exchanges so far', () => {
    const { driver, getRecord } = makeHarness();
    driver.start();
    // Let the first exchange fully finish, then end mid-session.
    jest.advanceTimersByTime(10000);
    driver.end();

    const record = getRecord();
    expect(record?.completed).toBe(false);
    expect(record?.exchanges.length).toBeGreaterThanOrEqual(1);
    expect(record?.exchanges.length).toBeLessThan(MOCK_PROMPTS.length);
  });

  it('ending twice does not double-report', () => {
    const { driver } = makeHarness();
    const spy = jest.fn();
    const d = new MockSessionDriver(
      { onPhase: () => {}, onTranscript: () => {}, onCountdown: () => {}, onComplete: spy },
      MOCK_PROMPTS
    );
    d.start();
    d.end();
    d.end();
    driver.end();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
