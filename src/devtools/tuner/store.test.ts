import { resolveStyle } from './runtime';
import {
  clearAll,
  clearOverride,
  getOverride,
  getVersion,
  replaceOverride,
  setOverride,
  subscribe,
} from './store';

const LOC = 'src/screens/Demo.tsx:12:4';

beforeEach(() => clearAll());

describe('override store', () => {
  it('starts empty', () => {
    expect(getOverride(LOC)).toBeUndefined();
  });

  it('sets and reads an override', () => {
    setOverride(LOC, { backgroundColor: 'red' });
    expect(getOverride(LOC)).toEqual({ backgroundColor: 'red' });
  });

  it('merges successive patches rather than replacing', () => {
    setOverride(LOC, { backgroundColor: 'red' });
    setOverride(LOC, { borderRadius: 8 });
    expect(getOverride(LOC)).toEqual({ backgroundColor: 'red', borderRadius: 8 });
  });

  it('replaceOverride swaps wholesale and null deletes', () => {
    setOverride(LOC, { backgroundColor: 'red', borderRadius: 8 });
    replaceOverride(LOC, { opacity: 0.5 });
    expect(getOverride(LOC)).toEqual({ opacity: 0.5 });
    replaceOverride(LOC, null);
    expect(getOverride(LOC)).toBeUndefined();
  });

  it('returns a reference-stable snapshot between mutations', () => {
    setOverride(LOC, { backgroundColor: 'red' });
    expect(getOverride(LOC)).toBe(getOverride(LOC));
  });

  it('notifies subscribers and bumps the version', () => {
    const seen: number[] = [];
    const unsubscribe = subscribe(() => seen.push(getVersion()));

    setOverride(LOC, { opacity: 1 });
    clearOverride(LOC);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeGreaterThan(seen[0]);

    unsubscribe();
    setOverride(LOC, { opacity: 0 });
    expect(seen).toHaveLength(2);
  });

  it('does not notify when clearing something that is not there', () => {
    let calls = 0;
    const unsubscribe = subscribe(() => (calls += 1));
    clearOverride('src/nope.tsx:1:1');
    clearAll();
    expect(calls).toBe(0);
    unsubscribe();
  });

});

describe('resolveStyle', () => {
  it('returns the original style by identity when nothing is overridden', () => {
    const style = { padding: 4 };
    expect(resolveStyle(LOC, style)).toBe(style);
  });

  it('passes null through untouched when not overridden', () => {
    expect(resolveStyle(LOC, null)).toBeNull();
    expect(resolveStyle(LOC, undefined)).toBeUndefined();
  });

  it('appends the override after an object style so it wins', () => {
    const style = { padding: 4, backgroundColor: 'blue' };
    setOverride(LOC, { backgroundColor: 'red' });
    expect(resolveStyle(LOC, style)).toEqual([style, { backgroundColor: 'red' }]);
  });

  it('appends to an array style, preserving order', () => {
    const a = { padding: 4 };
    const b = { margin: 2 };
    setOverride(LOC, { backgroundColor: 'red' });
    expect(resolveStyle(LOC, [a, b])).toEqual([a, b, { backgroundColor: 'red' }]);
  });

  it('becomes the whole style when the element had none', () => {
    setOverride(LOC, { backgroundColor: 'red' });
    expect(resolveStyle(LOC, undefined)).toEqual({ backgroundColor: 'red' });
  });

  it('does not leak overrides across locations', () => {
    setOverride(LOC, { backgroundColor: 'red' });
    const other = { padding: 1 };
    expect(resolveStyle('src/other.tsx:1:1', other)).toBe(other);
  });
});
