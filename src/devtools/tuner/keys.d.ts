export type AppliesTo = 'any' | 'text';

export type NumericKey = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  precision: number;
  fallback: number;
  appliesTo: AppliesTo;
};

export type EnumKey = {
  key: string;
  label: string;
  appliesTo: AppliesTo;
  options: readonly string[];
};

export type ColorKey = {
  key: string;
  label: string;
  appliesTo: AppliesTo;
};

export const NUMERIC_KEYS: readonly NumericKey[];
export const ENUM_KEYS: readonly EnumKey[];
export const COLOR_KEYS: readonly ColorKey[];
export const SIZE_KEYS: readonly NumericKey[];
