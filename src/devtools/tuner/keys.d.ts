export type AppliesTo = 'any' | 'text';

export type NumericChildKey = {
  key: string;
  label: string;
};

export type NumericKey = {
  key: string;
  label: string;
  section: string;
  min: number;
  max: number;
  step: number;
  precision: number;
  fallback: number;
  appliesTo: AppliesTo;
  /** Shown after the disclosure toggle, e.g. "per corner". */
  childrenLabel?: string;
  /** Longhand keys behind the shorthand; inherit the parent's range. */
  children?: readonly NumericChildKey[];
};

export type EnumKey = {
  key: string;
  label: string;
  section: string;
  appliesTo: AppliesTo;
  options: readonly string[];
};

export type ColorKey = {
  key: string;
  label: string;
  section: string;
  appliesTo: AppliesTo;
};

export const NUMERIC_KEYS: readonly NumericKey[];
export const ENUM_KEYS: readonly EnumKey[];
export const COLOR_KEYS: readonly ColorKey[];
export const SIZE_KEYS: readonly NumericKey[];
