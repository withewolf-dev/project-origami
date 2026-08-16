import { inspectSource, writeSource } from './core';

/**
 * Fixture: covers all four style shapes. Element locs (line:col of `<`):
 *   <View style={styles.card}>            → 5:4   (sheetRef)
 *   <Text style={{ fontSize: 15, ... }}>  → 6:6   (inline, single-line)
 *   <View style={[styles.a, styles.b]}>   → 7:6   (array of refs)
 *   <View style={[styles.a, { margin: 2 }]}> → 8:6 (array with literal)
 *   <View />                              → 9:6   (no style)
 */
const FIXTURE = `import { View, Text, StyleSheet } from 'react-native';

export function Card() {
  return (
    <View style={styles.card}>
      <Text style={{ fontSize: 15, color: '#3C3C43' }}>hi</Text>
      <View style={[styles.a, styles.b]} />
      <View style={[styles.a, { margin: 2 }]} />
      <View />
    </View>
  );
}

const PAD = 8;

const styles = StyleSheet.create({
  // the card surface
  card: {
    backgroundColor: '#E6F4FE',
    borderRadius: 12,
    padding: PAD,
  },
  a: { flex: 1 },
  b: { opacity: 0.5 },
});
`;

describe('inspectSource (5.2)', () => {
  it('resolves a StyleSheet ref, marking computed values', () => {
    const result = inspectSource(FIXTURE, 5, 4);
    expect(result).toEqual({
      shape: 'sheetRef',
      editable: {
        backgroundColor: { kind: 'literal', value: '#E6F4FE' },
        borderRadius: { kind: 'literal', value: 12 },
        padding: { kind: 'computed' },
      },
    });
  });

  it('resolves a single-line inline object', () => {
    const result = inspectSource(FIXTURE, 6, 6);
    expect(result.shape).toBe('inline');
    expect(result.editable).toEqual({
      fontSize: { kind: 'literal', value: 15 },
      color: { kind: 'literal', value: '#3C3C43' },
    });
  });

  it('merges an array left to right, later wins', () => {
    const result = inspectSource(FIXTURE, 8, 6);
    expect(result.shape).toBe('array');
    expect(result.editable).toEqual({
      flex: { kind: 'literal', value: 1 },
      margin: { kind: 'literal', value: 2 },
    });
  });

  it('reports an element with no style', () => {
    expect(inspectSource(FIXTURE, 9, 6).shape).toBe('none');
  });

  it('errors on a loc that matches nothing (file drift)', () => {
    expect(inspectSource(FIXTURE, 5, 5)).toEqual({ error: 'element-not-found' });
  });
});

describe('writeSource (5.3)', () => {
  it('replaces a literal in a StyleSheet entry, preserving comments — byte exact', () => {
    const result = writeSource(FIXTURE, 5, 4, { borderRadius: 24 });
    expect(result.applied).toEqual(['borderRadius']);
    expect(result.code).toContain('// the card surface');
    expect(result.code).toContain('borderRadius: 24,');
    // The ONLY change is those two bytes.
    expect(result.code!.replace('borderRadius: 24', 'borderRadius: 12')).toBe(FIXTURE);
  });

  it('replaces a colour string', () => {
    const result = writeSource(FIXTURE, 5, 4, { backgroundColor: '#FF3B30' });
    expect(result.code).toContain("backgroundColor: '#FF3B30',");
  });

  it('inserts a missing key into a multiline entry with trailing-comma style', () => {
    const result = writeSource(FIXTURE, 5, 4, { marginTop: 4 });
    expect(result.code).toContain('padding: PAD,\n    marginTop: 4,\n  },');
  });

  it('edits a single-line inline object in place', () => {
    const result = writeSource(FIXTURE, 6, 6, { fontSize: 17, letterSpacing: 1 });
    expect(result.code).toContain(
      "style={{ fontSize: 17, color: '#3C3C43', letterSpacing: 1 }}",
    );
    // Single-line insert: no new lines added, locs below stay valid.
    expect(result.code!.split('\n').length).toBe(FIXTURE.split('\n').length);
  });

  it('writes into the last object literal of an array', () => {
    const result = writeSource(FIXTURE, 8, 6, { margin: 10, borderRadius: 6 });
    expect(result.code).toContain('style={[styles.a, { margin: 10, borderRadius: 6 }]}');
  });

  it('appends a literal to an array that has no writable member', () => {
    const result = writeSource(FIXTURE, 7, 6, { borderRadius: 8 });
    expect(result.code).toContain('style={[styles.a, styles.b, { borderRadius: 8 }]}');
  });

  it('injects a style prop onto an unstyled element', () => {
    const result = writeSource(FIXTURE, 9, 6, { opacity: 0.5 });
    expect(result.code).toContain('<View style={{ opacity: 0.5 }} />');
  });

  it('refuses computed values with a structured failure, applying the rest', () => {
    const result = writeSource(FIXTURE, 5, 4, { padding: 30, borderRadius: 24 });
    expect(result.failed).toEqual([{ key: 'padding', reason: 'computed-value' }]);
    expect(result.applied).toEqual(['borderRadius']);
    expect(result.code).toContain('padding: PAD,');
    expect(result.code).toContain('borderRadius: 24,');
  });

  it('errors when every key fails', () => {
    const result = writeSource(FIXTURE, 5, 4, { padding: 30 });
    expect(result.error).toBe('nothing-writable');
    expect(result.failed).toEqual([{ key: 'padding', reason: 'computed-value' }]);
  });

  it('errors on a stale loc (file drift)', () => {
    expect(writeSource(FIXTURE, 99, 0, { opacity: 1 }).error).toBe('element-not-found');
  });

  it('errors on unparseable source', () => {
    expect(writeSource('const x = {', 1, 0, { opacity: 1 }).error).toBe('parse-failed');
  });

  it('edits the LAST occurrence of a duplicated key', () => {
    const dup = [
      "import { View } from 'react-native';",
      'export function B() {',
      '  return <View style={{ padding: 1, padding: 2 }} />;',
      '}',
    ].join('\n');
    const result = writeSource(dup, 3, 9, { padding: 9 });
    expect(result.code).toContain('style={{ padding: 1, padding: 9 }}');
  });

  it('escapes quotes in string values', () => {
    const result = writeSource(FIXTURE, 6, 6, { fontFamily: "It's" });
    expect(result.code).toContain("fontFamily: 'It\\'s'");
  });
});
