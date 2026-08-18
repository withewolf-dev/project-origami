import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { COLOR_KEYS, ENUM_KEYS, NUMERIC_KEYS, SIZE_KEYS } from '../keys';
import { canUndo, clearOverride, getOverride, replaceOverride, setOverride, undo } from '../store';
import type { SaveState, TunerHit } from '../types';
import { ColorRow } from './controls/ColorRow';
import { EnumRow } from './controls/EnumRow';
import { ScrubRow } from './controls/ScrubRow';
import { ACCENT, DANGER, HAIRLINE, MONO, PANEL_BG, TEXT_DIM, TEXT_HOT, TEXT_MID } from './theme';

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
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());

  const toggleGroup = (key: string) =>
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const loc = hit?.loc ?? null;
  const override = loc ? getOverride(loc) : undefined;
  // `hit.style` is a snapshot frozen at selection time; the pending override
  // must win over it or controls read stale values mid-drag.
  const style: Record<string, unknown> = { ...(hit?.style ?? {}), ...(override ?? {}) };

  const maxHeight = Math.min(280, screenHeight * 0.36);
  const dockTop = hit ? hit.frame.top + hit.frame.height > screenHeight - maxHeight - 64 : false;

  const patch = (next: Record<string, unknown>) => {
    if (!loc) return;
    // A stroke with no colour is invisible (RN defaults borderColor to
    // black): the first border-width edit also sets a visible colour.
    const touchesBorderWidth = Object.keys(next).some((key) => /^border.*Width$/.test(key));
    if (touchesBorderWidth && style.borderColor == null) {
      next = { ...next, borderColor: '#8E8E93' };
    }
    setOverride(loc, next);
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

  // Key validity lives in the shared tables (keys.js): the writer writes
  // whatever it is told, so what is OFFERED is the enforcement point.
  const kind = elementKind(hit);
  const fits = (entry: { appliesTo: 'any' | 'text' }) =>
    entry.appliesTo === 'any' || entry.appliesTo === kind;
  const numericKeys = NUMERIC_KEYS.filter(fits);
  const sizeKeys = SIZE_KEYS.filter((entry) => asNumber(style[entry.key]) !== null);
  const enumKeys = ENUM_KEYS.filter(fits);
  const colorKeys = COLOR_KEYS.filter(fits);

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
            {[...numericKeys, ...sizeKeys].map((entry) => {
              const parentValue = asNumber(style[entry.key]) ?? entry.fallback;
              const open = entry.children ? expandedGroups.has(entry.key) : false;
              return (
                <View key={entry.key}>
                  <ScrubRow
                    label={entry.label}
                    value={parentValue}
                    min={entry.min}
                    max={entry.max}
                    step={entry.step}
                    precision={entry.precision}
                    dirty={isDirty(entry.key)}
                    onChange={(next) => patch({ [entry.key]: next })}
                    onReset={() => resetKey(entry.key)}
                    onToggleChildren={entry.children ? () => toggleGroup(entry.key) : undefined}
                    childrenExpanded={open}
                  />
                  {open
                    ? entry.children?.map((child) => (
                        <View key={child.key} style={styles.subRow}>
                          <ScrubRow
                            label={child.label}
                            // RN precedence: the specific side falls back to
                            // the shorthand's rendered value.
                            value={asNumber(style[child.key]) ?? parentValue}
                            min={entry.min}
                            max={entry.max}
                            step={entry.step}
                            precision={entry.precision}
                            dirty={isDirty(child.key)}
                            onChange={(next) => patch({ [child.key]: next })}
                            onReset={() => resetKey(child.key)}
                          />
                        </View>
                      ))
                    : null}
                </View>
              );
            })}

            <View style={styles.sectionGap} />

            {enumKeys.map((entry) => (
              <EnumRow
                key={entry.key}
                label={entry.label}
                options={entry.options}
                value={typeof style[entry.key] === 'string' || typeof style[entry.key] === 'number' ? String(style[entry.key]) : null}
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
            <Pressable onPress={undo} disabled={!canUndo()} hitSlop={8}>
              <Text style={[styles.footerAction, !canUndo() ? styles.footerActionDisabled : null]}>
                Undo
              </Text>
            </Pressable>
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
  subRow: {
    paddingLeft: 16,
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
  footerActionDisabled: {
    opacity: 0.35,
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
