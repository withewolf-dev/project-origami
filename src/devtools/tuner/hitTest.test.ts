import { sanitizeStyle } from './hitTest';

describe('sanitizeStyle', () => {
  it('keeps primitive style values', () => {
    expect(sanitizeStyle({ fontSize: 76, color: '#FFF', includeFontPadding: false })).toEqual({
      fontSize: 76,
      color: '#FFF',
      includeFontPadding: false,
    });
  });

  it('drops Animated-style objects and arrays — the circular-JSON crash', () => {
    // Shaped like a flattened animated style: opacity is a node that
    // references itself through listeners, transform is an array of nodes.
    const animatedNode: Record<string, unknown> = { _value: 0.5 };
    animatedNode.self = animatedNode; // circular, as real Animated graphs are
    const flat = {
      color: '#FFFFFF',
      fontSize: 76,
      opacity: animatedNode,
      transform: [{ translateY: animatedNode }],
    };
    const clean = sanitizeStyle(flat);
    expect(clean).toEqual({ color: '#FFFFFF', fontSize: 76 });
    // The point of it all: the snapshot must be JSON-safe.
    expect(() => JSON.stringify(clean)).not.toThrow();
  });

  it('returns null for empty or nullish input', () => {
    expect(sanitizeStyle(null)).toBeNull();
    expect(sanitizeStyle({ transform: [] })).toBeNull();
  });
});
