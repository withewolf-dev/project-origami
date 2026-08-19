/** Design tuner shared types (docs/tuner/TODO.md). Dev-only. */

/**
 * `off`       — overlay inert, app behaves exactly as if the tuner were absent.
 * `selecting` — every touch is captured and hit-tested instead of reaching the app.
 * `editing`   — an element is selected; the panel is interactive, taps elsewhere reselect.
 */
export type TunerMode = 'off' | 'selecting' | 'editing';

/** A file's tunable motion constants, as offered in the Motion section. */
export type MotionInfo = {
  /** Registry id — also the source file the writer edits. */
  id: string;
  /** The exported const's name, e.g. "MOTION". */
  name: string;
  /** Declared defaults from source. */
  spec: Record<string, number>;
  /** Live values (defaults merged with any pending override). */
  values: Record<string, number>;
  /** Optional per-key range + human label; inferred from the default otherwise. */
  ranges?: Record<string, { min: number; max: number; step: number; label?: string }>;
};

/** Save button lifecycle (docs/tuner/TODO.md, 6.1/6.3). */
export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string };

/** Screen-space rect, in the coordinate space of the tuner root view. */
export type TunerFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** A resolved hit: where it is on screen, and where it came from in source. */
export type TunerHit = {
  frame: TunerFrame;
  /** `src/path/File.tsx:line:col`, or null when nothing in the hierarchy was stamped. */
  loc: string | null;
  /** Innermost component name, e.g. `RCTView` — for the debug chip. */
  name: string | null;
  /** Outer → inner component names, as returned by the inspector. */
  hierarchy: string[];
  /**
   * Every live instance's frame when one JSX element renders many (a
   * `.map()`); length 1 for the ordinary case. All instances share the loc,
   * so an edit affects all of them — the overlay outlines each.
   */
  frames?: TunerFrame[];
  /** Tunable motion registered for this element's file (Motion section). */
  motion?: MotionInfo | null;
  /**
   * The element's flattened style as currently rendered, INCLUDING any pending
   * override. Controls seed from this so a slider starts at the real value
   * instead of zero. Null when the element has no style.
   */
  style: Record<string, unknown> | null;
};
