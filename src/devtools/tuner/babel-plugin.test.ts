import { transformSync } from '@babel/core';

import tunerLocPlugin from './babel-plugin';

/**
 * Fixtures are transformed with ONLY this plugin (no presets), so the output
 * still contains JSX and assertions can match the injected attribute as text.
 * `root`/`cwd` are pinned so relative paths in the stamp are deterministic.
 */
function stamp(code: string, filename = '/project/src/Box.tsx'): string {
  const result = transformSync(code, {
    filename,
    root: '/project',
    cwd: '/project',
    babelrc: false,
    configFile: false,
    plugins: [tunerLocPlugin],
    parserOpts: { plugins: ['jsx', 'typescript'] },
  });
  if (!result?.code) throw new Error('transform produced no code');
  return result.code;
}

const CARD_FIXTURE = [
  "import { View, Text } from 'react-native';",
  'export function Box() {',
  '  return (',
  '    <View>',
  '      <Text>hi</Text>',
  '    </View>',
  '  );',
  '}',
].join('\n');

describe('tuner-loc babel plugin', () => {
  it('stamps react-native primitives with file:line:col', () => {
    const out = stamp(CARD_FIXTURE);
    expect(out).toContain('__tunerLoc="src/Box.tsx:4:4"'); // <View>
    expect(out).toContain('__tunerLoc="src/Box.tsx:5:6"'); // <Text>
  });

  it('preserves existing props', () => {
    const out = stamp(
      [
        "import { Pressable } from 'react-native';",
        'export function B({ onPress }: { onPress: () => void }) {',
        '  return <Pressable onPress={onPress} style={{ padding: 8 }} />;',
        '}',
      ].join('\n'),
    );
    expect(out).toContain('onPress={onPress}');
    // 3.2 routes style through the runtime helper; the literal must survive inside it.
    expect(out).toMatch(/style=\{_\w+\("src\/Box\.tsx:3:9", \{[\s\S]*padding: 8[\s\S]*\}\)\}/);
    expect(out).toContain('__tunerLoc="src/Box.tsx:3:9"');
  });

  it('does not stamp custom components', () => {
    const out = stamp(
      [
        "import { Card } from './Card';",
        'export function B() {',
        '  return <Card />;',
        '}',
      ].join('\n'),
    );
    expect(out).not.toContain('__tunerLoc');
  });

  it('stamps lowercase host elements', () => {
    const out = stamp(['export function W() {', '  return <div />;', '}'].join('\n'));
    expect(out).toContain('__tunerLoc="src/Box.tsx:2:9"');
  });

  it('stamps react-native namespace members like Animated.View', () => {
    const out = stamp(
      [
        "import { Animated } from 'react-native';",
        'export function F() {',
        '  return <Animated.View />;',
        '}',
      ].join('\n'),
    );
    expect(out).toContain('__tunerLoc="src/Box.tsx:3:9"');
  });

  it('skips files outside src/', () => {
    const out = stamp(CARD_FIXTURE, '/project/App.tsx');
    expect(out).not.toContain('__tunerLoc');
  });

  it('skips files under node_modules', () => {
    const out = stamp(CARD_FIXTURE, '/project/node_modules/lib/src/Box.tsx');
    expect(out).not.toContain('__tunerLoc');
  });

  it('skips elements with spread props', () => {
    const out = stamp(
      [
        "import { View } from 'react-native';",
        'export function B(rest: object) {',
        '  return <View {...rest} />;',
        '}',
      ].join('\n'),
    );
    expect(out).not.toContain('__tunerLoc');
  });

  it('does not rewrite the tuner runtime itself', () => {
    const out = stamp(CARD_FIXTURE, '/project/src/devtools/tuner/runtime.ts');
    expect(out).not.toContain('__tunerLoc');
  });

  // Regression: an over-broad exclusion of src/devtools/tuner/ silently
  // un-stamped the Playground, leaving every element with "no source stamp".
  it('DOES stamp other files inside the tuner directory', () => {
    const out = stamp(CARD_FIXTURE, '/project/src/devtools/tuner/Playground.tsx');
    expect(out).toContain('__tunerLoc="src/devtools/tuner/Playground.tsx:4:4"');
  });

  it('does not double-stamp an element that already has __tunerLoc', () => {
    const out = stamp(
      [
        "import { View } from 'react-native';",
        'export function B() {',
        '  return <View __tunerLoc="already:1:1" />;',
        '}',
      ].join('\n'),
    );
    expect(out).toContain('__tunerLoc="already:1:1"');
    expect(out.match(/__tunerLoc/g)).toHaveLength(1);
  });
});

describe('tuner babel plugin — style routing (3.2)', () => {
  const wrap = (jsx: string) =>
    stamp(
      [
        "import { View, StyleSheet } from 'react-native';",
        'const styles = StyleSheet.create({ a: {}, b: {} });',
        'export function B() {',
        `  return ${jsx};`,
        '}',
      ].join('\n'),
    );

  it('imports the runtime helper relative to the file', () => {
    const out = wrap('<View style={styles.a} />');
    // Both helpers share one declaration, so match the specifier and the
    // module path rather than the exact brace contents.
    expect(out).toMatch(/import \{[^}]*resolveStyle as _\w+[^}]*\} from "\.\/devtools\/tuner\/runtime"/);
  });

  it('wraps a StyleSheet reference', () => {
    const out = wrap('<View style={styles.a} />');
    expect(out).toMatch(/style=\{_\w+\("src\/Box\.tsx:4:9", styles\.a\)\}/);
  });

  it('wraps an inline object literal', () => {
    const out = wrap('<View style={{ padding: 8 }} />');
    expect(out).toMatch(/style=\{_\w+\("src\/Box\.tsx:4:9", \{[\s\S]*padding: 8[\s\S]*\}\)\}/);
  });

  it('wraps a style array', () => {
    const out = wrap('<View style={[styles.a, styles.b]} />');
    expect(out).toMatch(/style=\{_\w+\("src\/Box\.tsx:4:9", \[styles\.a, styles\.b\]\)\}/);
  });

  it('injects a style prop when the element has none', () => {
    const out = wrap('<View />');
    expect(out).toMatch(/style=\{_\w+\("src\/Box\.tsx:4:9", undefined\)\}/);
  });

  it('imports the runtime only once per file', () => {
    const out = wrap('<View style={styles.a}><View style={styles.b} /></View>');
    expect(out.match(/from "\.\/devtools\/tuner\/runtime"/g)).toHaveLength(1);
  });

  it('leaves non-host components untouched', () => {
    const out = stamp(
      [
        "import { Card } from './Card';",
        'export function B() {',
        '  return <Card style={{ padding: 1 }} />;',
        '}',
      ].join('\n'),
    );
    expect(out).not.toContain('resolveStyle');
    expect(out).toContain('style={{');
  });
});

/**
 * 3.3 — components owning stamped JSX must subscribe to the store, or
 * memoisation boundaries (React Navigation memoises inactive scenes) stop an
 * override from ever repainting.
 */
describe('tuner babel plugin — component subscription (3.3)', () => {
  it('injects the subscription at the top of a function declaration', () => {
    const out = stamp(
      [
        "import { View } from 'react-native';",
        'export function Screen() {',
        '  return <View />;',
        '}',
      ].join('\n'),
    );
    expect(out).toMatch(/function Screen\(\) \{\s*_tuner_useTunerVersion\(\);/);
  });

  it('injects into a named arrow component and gives it a block body', () => {
    const out = stamp(
      [
        "import { View } from 'react-native';",
        'export const Screen = () => <View />;',
      ].join('\n'),
    );
    expect(out).toMatch(/_tuner_useTunerVersion\(\);/);
    expect(out).toMatch(/return <View/);
  });

  it('does NOT inject into anonymous callbacks — that would break hook rules', () => {
    const out = stamp(
      [
        "import { View, FlatList } from 'react-native';",
        'export function List() {',
        '  return <FlatList renderItem={() => <View />} />;',
        '}',
      ].join('\n'),
    );
    // Exactly one injection: List itself, never the renderItem arrow.
    expect(out.match(/_tuner_useTunerVersion\(\)/g)).toHaveLength(1);
  });

  it('does NOT inject into lowercase helper functions', () => {
    const out = stamp(
      [
        "import { View } from 'react-native';",
        'export function makeRow() {',
        '  return <View />;',
        '}',
      ].join('\n'),
    );
    expect(out).not.toContain('useTunerVersion');
  });

  it('injects once per component, not once per element', () => {
    const out = stamp(
      [
        "import { View } from 'react-native';",
        'export function Screen() {',
        '  return <View><View /><View /></View>;',
        '}',
      ].join('\n'),
    );
    expect(out.match(/_tuner_useTunerVersion\(\)/g)).toHaveLength(1);
  });

  it('subscribes each component in a file independently', () => {
    const out = stamp(
      [
        "import { View } from 'react-native';",
        'export function A() { return <View />; }',
        'export function B() { return <View />; }',
      ].join('\n'),
    );
    expect(out.match(/_tuner_useTunerVersion\(\)/g)).toHaveLength(2);
    expect(out.match(/from "\.\/devtools\/tuner\/runtime"/g)).toHaveLength(1);
  });
});
