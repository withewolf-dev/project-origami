import { Platform } from 'react-native';

/** Shared visual constants for the tuner UI — the single place the accent lives. */
export const ACCENT = '#00E0B8';

/** Panel surface — near-black so the tool recedes behind the app being tuned. */
export const PANEL_BG = 'rgba(16, 17, 19, 0.97)';

/** Line-work. Hairlines are the panel's only decoration. */
export const HAIRLINE = 'rgba(255, 255, 255, 0.09)';

/** Text emphasis ladder. */
export const TEXT_HOT = '#FFFFFF';
export const TEXT_MID = 'rgba(255, 255, 255, 0.72)';
export const TEXT_DIM = 'rgba(255, 255, 255, 0.40)';

export const DANGER = '#FF6B60';

/** Values are data: mono everywhere a number or hex appears. */
export const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
