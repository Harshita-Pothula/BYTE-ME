/** ByteMe brand palette. Every value is an sRGB hex colour. */
export const PALETTE = {
  chocolate: 0x3b2416,
  espresso: 0x2a1b12,
  cocoa: 0x5a3a26,
  caramel: 0x8a4b22,
  cream: 0xeae2d4,
  milk: 0xfffaf2,
  teal: 0x1e6e68,
  sunlight: 0xe3a72f,
  terracotta: 0xc2502e,
} as const;

/** Status colours used by 3D beacons and floor marks. */
export const STATUS_COLORS = {
  running: 0x2bc4b4,
  idle: 0xc9b79c,
  maintenance: 0xf2b23a,
  warning: 0xf0603f,
  offline: 0x5e524a,
} as const;

/** Scene-level colours (sky, fog, ground) for both themes. */
export const SCENE_COLORS = {
  light: { skyTop: '#B9CBD3', skyMid: '#E6E3DA', skyBottom: '#EFE7DA', fog: 0xe6e3da, ground: 0x77716a },
  dark: { skyTop: '#07090C', skyMid: '#1A140F', skyBottom: '#2A1E16', fog: 0x1e150f, ground: 0x3a332e },
} as const;

export const SELECTION_COLOR = 0xf2b23a;
export const HIGHLIGHT_EMISSIVE = 0xe3a72f;

export const hexCss = (hex: number) => '#' + hex.toString(16).padStart(6, '0');
