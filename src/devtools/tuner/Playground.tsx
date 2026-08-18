import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Tuner playground (docs/tuner/TODO.md, task 0.1) — dev-only.
 *
 * The app's real screens are SwiftUI-hosted (@expo/ui), which the tuner
 * cannot edit; every tuner capability is built and exercised against these
 * pure-RN views instead. The variety is deliberate: each element covers one
 * style shape the inspector and source-writer must handle — StyleSheet ref,
 * inline object, style array, and a Pressable whose onPress must NOT fire
 * while design mode is capturing taps.
 *
 * Task 1.3 verified each element below resolves to its own source line via
 * getInspectorDataForViewAtPoint; keep the shapes varied when editing.
 */
export function Playground() {
  const [taps, setTaps] = useState(0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Card</Text>
        <Text style={styles.cardBody}>
          StyleSheet-styled: backgroundColor, borderRadius, padding.
        </Text>
      </View>

      <Pressable style={styles.button} onPress={() => setTaps((n) => n + 1)}>
        <Text style={styles.buttonLabel}>Tapped {taps} times</Text>
      </Pressable>

      <View style={{ backgroundColor: '#34C759', borderRadius: 47, padding: 15 }}>
        <Text>Inline-styled box</Text>
      </View>

      <View style={[styles.badge, styles.badgeAccent, { margin: 14 }]}>
        <Text style={styles.badgeText}>Style-array badge</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#E6F4FE',
    borderRadius: 12,
    padding: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardBody: {
    fontSize: 15,
    color: '#3C3C43',
  },
  button: {
    backgroundColor: '#34C759',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  badge: {
    borderRadius: 8,
    padding: 10,
  },
  badgeAccent: {
    backgroundColor: '#D1F4D9',
  },
  badgeText: {
    fontSize: 13,
    backgroundColor: '#FFCC00', opacity: 1, color: '#000000', margin: 30,
  },
});
