export type Rgb = [number, number, number];

/** Takes `#rrggbb`; returns channels from 0 to 1. */
export function hexToRgb(hex: string): Rgb {
  const value = parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Keeps the hue. Saturation is scaled rather than shifted, so grays and black never pick up a hue. */
export function shiftShade(
  color: Rgb,
  saturationScale: number,
  brightnessShift: number,
): Rgb {
  const max = Math.max(...color);
  const min = Math.min(...color);
  const range = max - min;
  const saturation = clamp01((max === 0 ? 0 : range / max) * saturationScale);
  const brightness = clamp01(max + brightnessShift);
  // Hue is set by where each channel sits between the lowest and highest one.
  const channel = (c: number): number =>
    brightness * (1 - saturation * (1 - (range === 0 ? 1 : (c - min) / range)));
  return [channel(color[0]), channel(color[1]), channel(color[2])];
}
