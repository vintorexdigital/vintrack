import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, mix, validateBrandOverride } from './contrast.js';
import { toCss, toNativeTheme, toTailwindTheme } from './css.js';
import { primitive, semanticDark, semanticHighContrast, semanticLight, statusKeys } from './tokens.js';

describe('palette contrast (WCAG)', () => {
  it('meets the documented ratios on Surface', () => {
    expect(contrastRatio(primitive.ink, '#FFFFFF')).toBeGreaterThan(16);
    expect(contrastRatio(primitive.slate, '#FFFFFF')).toBeGreaterThan(6.4);
    expect(contrastRatio(primitive.petrol, '#FFFFFF')).toBeGreaterThan(7.2);
    expect(contrastRatio(primitive.ink, primitive.marigold)).toBeGreaterThan(7.8);
  });
  it.each(statusKeys)('status %s is at least 4.5:1 as text on Surface', (k) => {
    expect(contrastRatio(semanticLight[`status-${k}`]!, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps Ink readable on every status tint', () => {
    for (const k of statusKeys) {
      expect(contrastRatio(primitive.ink, mix(semanticLight[`status-${k}`]!, '#FFFFFF', 0.14))).toBeGreaterThan(12);
    }
  });
  it('keeps dark and high-contrast themes accessible', () => {
    for (const k of statusKeys) {
      expect(contrastRatio(semanticDark[`status-${k}`]!, semanticDark['color-surface']!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(semanticHighContrast[`status-${k}`]!, '#FFFFFF')).toBeGreaterThanOrEqual(7);
    }
    expect(contrastRatio(semanticDark['color-ink']!, semanticDark['color-canvas']!)).toBeGreaterThan(12);
    expect(contrastRatio(semanticDark['brand-on-primary']!, semanticDark['brand-primary']!)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('brand override validation', () => {
  it('accepts a compliant colour and rejects poor contrast', () => {
    expect(validateBrandOverride({ primary: '#0F5E73', onPrimary: '#FFFFFF' })).toEqual([]);
    expect(validateBrandOverride({ primary: '#F2A516', onPrimary: '#FFFFFF' })).not.toEqual([]);
    expect(validateBrandOverride({ primary: '#FFF8C0', onPrimary: '#000000' }).join()).toContain('3:1');
    expect(validateBrandOverride({ primary: 'nope', onPrimary: '#FFFFFF' })[0]).toContain('Invalid colour');
  });
});

describe('generated outputs', () => {
  it('css files on disk are in sync with the source', () => {
    expect(readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8')).toBe(toCss());
    expect(readFileSync(new URL('../css/tailwind.css', import.meta.url), 'utf8')).toBe(toTailwindTheme());
    expect(readFileSync(new URL('../css/native-theme.ts', import.meta.url), 'utf8')).toBe(toNativeTheme());
  });
  it('defines light, dark and contrast themes and brand tokens', () => {
    const css = toCss();
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(':root[data-theme="contrast"]');
    expect(css).toContain('--brand-primary');
    expect(css).toContain('prefers-reduced-motion');
  });
});
