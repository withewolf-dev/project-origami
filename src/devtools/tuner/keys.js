/**
 * The single home for "what is tunable" (docs/tuner/TODO.md, 10.1).
 *
 * CommonJS on purpose: imported by the RN panel (via TS + keys.d.ts) AND
 * required by the Metro middleware, which serves it to the dashboard at
 * GET /__tuner/ui/keys — one definition, three consumers, no fork.
 *
 * `appliesTo`: 'any' | 'text' — key validity is enforced at the offering
 * layer (the writer writes whatever it is told; a `color:` on a View breaks
 * typecheck — see TODO Log). `fallback` is what an ABSENT key renders as.
 *
 * Shadows are deliberately absent: shadowOffset is a nested object and the
 * source writer serialises scalars only.
 */
const NUMERIC_KEYS = [
  { key: 'borderRadius', label: 'Radius', min: 0, max: 48, step: 1, precision: 0, fallback: 0, appliesTo: 'any' },
  { key: 'padding', label: 'Padding', min: 0, max: 48, step: 1, precision: 0, fallback: 0, appliesTo: 'any' },
  { key: 'paddingHorizontal', label: 'Pad X', min: 0, max: 48, step: 1, precision: 0, fallback: 0, appliesTo: 'any' },
  { key: 'paddingVertical', label: 'Pad Y', min: 0, max: 48, step: 1, precision: 0, fallback: 0, appliesTo: 'any' },
  { key: 'margin', label: 'Margin', min: 0, max: 48, step: 1, precision: 0, fallback: 0, appliesTo: 'any' },
  { key: 'marginTop', label: 'Margin top', min: 0, max: 64, step: 1, precision: 0, fallback: 0, appliesTo: 'any' },
  { key: 'marginBottom', label: 'Margin btm', min: 0, max: 64, step: 1, precision: 0, fallback: 0, appliesTo: 'any' },
  { key: 'gap', label: 'Gap', min: 0, max: 48, step: 1, precision: 0, fallback: 0, appliesTo: 'any' },
  { key: 'borderWidth', label: 'Border', min: 0, max: 8, step: 0.5, precision: 1, fallback: 0, appliesTo: 'any' },
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.05, precision: 2, fallback: 1, appliesTo: 'any' },
  { key: 'fontSize', label: 'Font size', min: 8, max: 80, step: 1, precision: 0, fallback: 14, appliesTo: 'text' },
  { key: 'lineHeight', label: 'Line height', min: 0, max: 96, step: 1, precision: 0, fallback: 0, appliesTo: 'text' },
  { key: 'letterSpacing', label: 'Letter sp', min: -2, max: 8, step: 0.1, precision: 1, fallback: 0, appliesTo: 'text' },
];

const ENUM_KEYS = [
  { key: 'fontWeight', label: 'Weight', appliesTo: 'text', options: ['400', '500', '600', '700', '800'] },
  { key: 'flexDirection', label: 'Direction', appliesTo: 'any', options: ['column', 'row'] },
  { key: 'alignItems', label: 'Align', appliesTo: 'any', options: ['flex-start', 'center', 'flex-end', 'stretch'] },
  { key: 'justifyContent', label: 'Justify', appliesTo: 'any', options: ['flex-start', 'center', 'space-between', 'flex-end'] },
];

const COLOR_KEYS = [
  { key: 'backgroundColor', label: 'Background', appliesTo: 'any' },
  { key: 'color', label: 'Text colour', appliesTo: 'text' },
  { key: 'borderColor', label: 'Border colour', appliesTo: 'any' },
];

/** Only offered when the element already has a numeric value for them. */
const SIZE_KEYS = [
  { key: 'width', label: 'Width', min: 0, max: 420, step: 1, precision: 0, fallback: 0, appliesTo: 'any' },
  { key: 'height', label: 'Height', min: 0, max: 420, step: 1, precision: 0, fallback: 0, appliesTo: 'any' },
];

module.exports = { NUMERIC_KEYS, ENUM_KEYS, COLOR_KEYS, SIZE_KEYS };
