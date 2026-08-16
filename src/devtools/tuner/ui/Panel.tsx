import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { clearOverride, getOverride, replaceOverride, setOverride } from '../store';
import type { TunerHit } from '../types';
import { ColorField } from './controls/ColorField';
import { Slider } from './controls/Slider';

const ACCENT = '#00E0B8';

/**
 * Numeric keys offered for every element (4.1 / 4.2). `fallback` is what an
 * ABSENT key actually renders as — opacity defaults to 1, not 0. Seeding from
 * `min` displayed "Opacity 0.00" on untouched elements and one accidental
 * drag made them vanish.
 */
const NUMERIC_KEYS = [
  { key: 'borderRadius', label: 'Radius', min: 0, max: 48, step: 1, precision: 0, fallback: 0 },
  { key: 'padding', label: 'Padding', min: 0, max: 48, step: 1, precision: 0, fallback: 0 },
  { key: 'margin', label: 'Margin', min: 0, max: 48, step: 1, precision: 0, fallback: 0 },
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.05, precision: 2, fallback: 1 },
] as const;

/** Only offered when the element already has a numeric value for them. */
const SIZE_KEYS = [
  { key: 'width', label: 'Width', min: 0, max: 420, step: 1, precision: 0, fallback: 0 },
  { key: 'height', label: 'Height', min: 0, max: 420, step: 1, precision: 0, fallback: 0 },
] as const;

type Props = {
  hit: TunerHit | null;
  onExit: () => void;
  onResetAll: () => void;
};

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asColor(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * The editor panel (docs/tuner/TODO.md, 3.4 + Phase 4).
 *
 * Docks to the bottom, flipping to the top when the selected element's frame
 * would sit underneath it — otherwise you would be tuning something you cannot
 * see. It renders after the overlay's capture layer, so as a later sibling it
 * is on top and keeps its own touches: the panel can never select itself.
 *
 * Controls seed from `hit.style` (the element's flattened style as rendered),
 * so a slider starts at the element's real value rather than zero.
 */
export function Panel({ hit, onExit, onResetAll }: Props) {
  const { height: screenHeight } = useWindowDimensions();

  const loc = hit?.loc ?? null;
  const override = loc ? getOverride(loc) : undefined;
  // `hit.style` is a snapshot frozen at selection time; the pending override
  // must win over it or controls read stale values and knobs do not track
  // the drag in real time.
  const style: Record<string, unknown> = { ...(hit?.style ?? {}), ...(override ?? {}) };

  // Compact: the panel is a tool, not a screen. Cap it well under half the
  // display so the element being tuned stays visible.
  const maxHeight = Math.min(264, screenHeight * 0.34);
  const dockTop = hit ? hit.frame.top + hit.frame.height > screenHeight - maxHeight - 64 : false;

  const patch = (next: Record<string, unknown>) => {
    if (loc) setOverride(loc, next);
  };

  /** Drop one key from the override, leaving the rest pending. */
  const resetKey = (key: string) => {
    if (!loc || !override) return;
    const next = { ...override };
    delete next[key];
    replaceOverride(loc, Object.keys(next).length > 0 ? next : null);
  };

  const sizeKeys = SIZE_KEYS.filter((entry) => asNumber(style[entry.key]) !== null);

  return (
    <View style={[styles.panel, dockTop ? styles.dockTop : styles.dockBottom]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {loc ?? (hit ? `${hit.name ?? 'element'} — no source stamp` : 'Tap an element')}
          </Text>
          {hit ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {hit.name ?? '?'} · {Math.round(hit.frame.width)}×{Math.round(hit.frame.height)}
            </Text>
          ) : null}
        </View>
        <Pressable accessibilityLabel="Exit design mode" hitSlop={12} onPress={onExit}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      {loc ? (
        <>
          <ScrollView style={{ maxHeight }} keyboardShouldPersistTaps="handled">
            {[...NUMERIC_KEYS, ...sizeKeys].map((entry) => {
              const current = asNumber(style[entry.key]) ?? entry.fallback;
              const isOverridden = override ? entry.key in override : false;
              return (
                <Slider
                  key={entry.key}
                  label={entry.label}
                  value={current}
                  min={entry.min}
                  max={entry.max}
                  step={entry.step}
                  precision={entry.precision}
                  onChange={(next) => patch({ [entry.key]: next })}
                  onReset={isOverridden ? () => resetKey(entry.key) : undefined}
                />
              );
            })}

            <View style={styles.divider} />

            <ColorField
              label="Background"
              value={asColor(style.backgroundColor)}
              onChange={(next) => patch({ backgroundColor: next })}
              onReset={
                override && 'backgroundColor' in override
                  ? () => resetKey('backgroundColor')
                  : undefined
              }
            />
            <ColorField
              label="Text colour"
              value={asColor(style.color)}
              onChange={(next) => patch({ color: next })}
              onReset={override && 'color' in override ? () => resetKey('color') : undefined}
            />
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.json} numberOfLines={1}>
              {override ? JSON.stringify(override) : 'no pending changes'}
            </Text>
            <Pressable onPress={() => clearOverride(loc)} hitSlop={8}>
              <Text style={styles.footerAction}>Revert</Text>
            </Pressable>
            <Pressable onPress={onResetAll} hitSlop={8}>
              <Text style={styles.footerAction}>Reset all</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(20, 20, 22, 0.96)',
    gap: 8,
  },
  dockBottom: {
    bottom: 40,
  },
  dockTop: {
    top: 64,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    marginTop: 2,
  },
  close: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 8,
  },
  json: {
    flex: 1,
    color: ACCENT,
    fontSize: 11,
  },
  footerAction: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    fontWeight: '600',
  },
});
