import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { clearOverride, getOverride, replaceOverride, setOverride } from '../store';
import type { SaveState, TunerHit } from '../types';
import { ColorRow } from './controls/ColorRow';
import { ScrubRow } from './controls/ScrubRow';
import { ACCENT, DANGER, HAIRLINE, MONO, PANEL_BG, TEXT_DIM, TEXT_HOT, TEXT_MID } from './theme';

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

/**
 * Only offered when the element already has a numeric value for them
 * (`fallback` is never reached — kept for shape-uniformity with NUMERIC_KEYS).
 */
const SIZE_KEYS = [
  { key: 'width', label: 'Width', min: 0, max: 420, step: 1, precision: 0, fallback: 0 },
  { key: 'height', label: 'Height', min: 0, max: 420, step: 1, precision: 0, fallback: 0 },
] as const;

/**
 * Colour keys with the element kinds they apply to. Key validity is enforced
 * HERE, panel-side: the writer writes whatever it is told, and a `color:` on
 * a View breaks typecheck (found via a real save — see TODO Log). New gated
 * keys get an `appliesTo` entry, not an inline conditional.
 */
const COLOR_KEYS = [
  { key: 'backgroundColor', label: 'Background', appliesTo: 'any' },
  { key: 'color', label: 'Text colour', appliesTo: 'text' },
] as const;

/** Host element kind, classified from the native view name (e.g. RCTText). */
function elementKind(hit: TunerHit | null): 'text' | 'view' {
  return hit?.name?.includes('Text') ? 'text' : 'view';
}

/** "RCTText" → "Text": the person tunes elements, not native view classes. */
function displayName(hit: TunerHit): string {
  return (hit.name ?? 'element').replace(/^RCT/, '');
}

type Props = {
  hit: TunerHit | null;
  saveState: SaveState;
  /** Dashboard open (8.9): collapse to the selection chip — phone is canvas. */
  collapsed: boolean;
  onExit: () => void;
  onResetAll: () => void;
  onSave: (loc: string) => void;
};

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asColor(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * The editor panel (docs/tuner/TODO.md, 3.4 + Phase 4) — an instrument strip,
 * not a form. Every numeric key is a one-line scrub row; colour is the only
 * disclosure. Kept deliberately shallow so the element being tuned stays
 * visible: the panel's most important pixel is the one behind it.
 *
 * Docks to the bottom, flipping to the top when the selected element's frame
 * would sit underneath it. It renders after the overlay's capture layer, so
 * as a later sibling it keeps its own touches and can never select itself.
 */
export function Panel({ hit, saveState, collapsed, onExit, onResetAll, onSave }: Props) {
  const { height: screenHeight } = useWindowDimensions();
  const [expandedColor, setExpandedColor] = useState<string | null>(null);

  const loc = hit?.loc ?? null;
  const override = loc ? getOverride(loc) : undefined;
  // `hit.style` is a snapshot frozen at selection time; the pending override
  // must win over it or controls read stale values mid-drag.
  const style: Record<string, unknown> = { ...(hit?.style ?? {}), ...(override ?? {}) };

  const maxHeight = Math.min(280, screenHeight * 0.36);
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

  const isDirty = (key: string) => (override ? key in override : false);
  const dirtyCount = override ? Object.keys(override).length : 0;

  const sizeKeys = SIZE_KEYS.filter((entry) => asNumber(style[entry.key]) !== null);
  const kind = elementKind(hit);
  const colorKeys = COLOR_KEYS.filter(
    (entry) => entry.appliesTo === 'any' || entry.appliesTo === kind,
  );

  return (
    <View style={[styles.panel, dockTop ? styles.dockTop : styles.dockBottom]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          {hit ? (
            <>
              <Text style={styles.title} numberOfLines={1}>
                {displayName(hit)}
                <Text style={styles.titleDim}>
                  {'  '}
                  {Math.round(hit.frame.width)}×{Math.round(hit.frame.height)}
                </Text>
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {loc ? loc.split('/').pop() : 'no source stamp — not editable'}
              </Text>
            </>
          ) : (
            <Text style={styles.title}>Tap an element</Text>
          )}
        </View>
        <Pressable accessibilityLabel="Exit design mode" hitSlop={12} onPress={onExit}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      {loc && collapsed ? (
        <Text style={styles.collapsedHint}>
          {saveState.status === 'saving'
            ? 'Saving…'
            : saveState.status === 'saved'
              ? 'Saved ✓'
              : saveState.status === 'error'
                ? saveState.message
                : 'Editing in the dashboard'}
        </Text>
      ) : null}

      {loc && !collapsed ? (
        <>
          <ScrollView style={{ maxHeight }} keyboardShouldPersistTaps="handled">
            {[...NUMERIC_KEYS, ...sizeKeys].map((entry) => (
              <ScrubRow
                key={entry.key}
                label={entry.label}
                value={asNumber(style[entry.key]) ?? entry.fallback}
                min={entry.min}
                max={entry.max}
                step={entry.step}
                precision={entry.precision}
                dirty={isDirty(entry.key)}
                onChange={(next) => patch({ [entry.key]: next })}
                onReset={() => resetKey(entry.key)}
              />
            ))}

            <View style={styles.sectionGap} />

            {colorKeys.map((entry) => (
              <ColorRow
                key={entry.key}
                label={entry.label}
                value={asColor(style[entry.key])}
                dirty={isDirty(entry.key)}
                expanded={expandedColor === entry.key}
                onToggle={() =>
                  setExpandedColor((current) => (current === entry.key ? null : entry.key))
                }
                onChange={(next) => patch({ [entry.key]: next })}
                onReset={() => resetKey(entry.key)}
              />
            ))}
          </ScrollView>

          {saveState.status === 'error' ? (
            <Text style={styles.errorLine} numberOfLines={2}>
              {saveState.message}
            </Text>
          ) : null}

          <View style={styles.footer}>
            <Pressable onPress={() => clearOverride(loc)} hitSlop={8}>
              <Text style={styles.footerAction}>Revert</Text>
            </Pressable>
            <Pressable onPress={onResetAll} hitSlop={8}>
              <Text style={styles.footerAction}>Reset all</Text>
            </Pressable>
            <View style={styles.footerSpace} />
            <Pressable
              accessibilityLabel="Save changes to source"
              disabled={dirtyCount === 0 || saveState.status === 'saving'}
              onPress={() => onSave(loc)}
              style={[styles.saveButton, dirtyCount === 0 ? styles.saveButtonDisabled : null]}>
              <Text style={styles.saveLabel}>
                {saveState.status === 'saving'
                  ? 'Saving…'
                  : saveState.status === 'saved'
                    ? 'Saved ✓'
                    : dirtyCount > 0
                      ? `Save ${dirtyCount}`
                      : 'Save'}
              </Text>
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 14,
    backgroundColor: PANEL_BG,
    borderWidth: 1,
    borderColor: HAIRLINE,
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
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
    marginBottom: 2,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: TEXT_HOT,
    fontSize: 14,
    fontWeight: '600',
  },
  titleDim: {
    color: TEXT_DIM,
    fontWeight: '400',
    fontFamily: MONO,
    fontSize: 12,
  },
  subtitle: {
    color: TEXT_DIM,
    fontFamily: MONO,
    fontSize: 10,
    marginTop: 3,
  },
  close: {
    color: TEXT_MID,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionGap: {
    height: 10,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
    paddingTop: 10,
    marginTop: 2,
  },
  footerAction: {
    color: TEXT_DIM,
    fontSize: 11,
    fontWeight: '600',
  },
  footerSpace: {
    flex: 1,
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: ACCENT,
  },
  saveButtonDisabled: {
    opacity: 0.3,
  },
  saveLabel: {
    color: '#00312A',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  errorLine: {
    color: DANGER,
    fontSize: 11,
    paddingVertical: 4,
  },
  collapsedHint: {
    color: TEXT_DIM,
    fontSize: 11,
    paddingTop: 8,
  },
});
