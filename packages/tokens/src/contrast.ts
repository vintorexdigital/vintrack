export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`Invalid colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Blend `fg` over `bg` at `alpha` (0-1); used to evaluate status tints. */
export function mix(fg: string, bg: string, alpha: number): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  const c = f.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export interface BrandOverride {
  primary: string;
  onPrimary: string;
}

/**
 * White-label tenants may override only the brand tokens, and only when text contrast is at least
 * 4.5:1 and the primary colour is distinguishable from the surface at 3:1 (UI elements).
 */
export function validateBrandOverride(o: BrandOverride, surface = '#FFFFFF'): string[] {
  const errors: string[] = [];
  try {
    const textOnBrand = contrastRatio(o.onPrimary, o.primary);
    if (textOnBrand < 4.5) errors.push(`Text on the brand colour has contrast ${textOnBrand.toFixed(2)}:1; it needs at least 4.5:1.`);
    const brandOnSurface = contrastRatio(o.primary, surface);
    if (brandOnSurface < 3) errors.push(`The brand colour on the page background has contrast ${brandOnSurface.toFixed(2)}:1; it needs at least 3:1.`);
  } catch (e) {
    errors.push((e as Error).message);
  }
  return errors;
}
