/** Design tuner shared types (docs/tuner/TODO.md). Dev-only. */

/**
 * `off`       — overlay inert, app behaves exactly as if the tuner were absent.
 * `selecting` — every touch is captured and hit-tested instead of reaching the app.
 * `editing`   — an element is selected; the panel is interactive, taps elsewhere reselect.
 */
export type TunerMode = 'off' | 'selecting' | 'editing';

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
   * The element's flattened style as currently rendered, INCLUDING any pending
   * override. Controls seed from this so a slider starts at the real value
   * instead of zero. Null when the element has no style.
   */
  style: Record<string, unknown> | null;
};
