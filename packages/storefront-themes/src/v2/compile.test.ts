import { describe, expect, it } from 'vitest';
import { compileTokensV2 } from './compile';
import { buildThemeCssV2, colorVars, sharedVars } from './css';
import type { ColorTokensV2, ThemePresetV2 } from './types';

// A minimal but complete v2 preset fixture (the real presets land in §2).
const LIGHT: ColorTokensV2 = {
  base100: '#ffffff',
  base200: '#f7f7f9',
  base300: '#ececf1',
  baseContent: '#0b1120',
  primary: '#4f46e5',
  secondary: '#0ea5e9',
  accent: '#f97316',
  neutral: '#1f2430',
  info: '#0284c7',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  border: '#e4e4e7',
};

const DARK: ColorTokensV2 = {
  ...LIGHT,
  base100: '#0b1120',
  base200: '#111827',
  base300: '#1f2937',
  baseContent: '#e2e8f0',
  border: '#1f2937',
};

const PRESET: ThemePresetV2 = {
  shared: {
    fontHeading: 'Geist',
    fontBody: 'Inter',
    radiusSelector: '9999px',
    radiusField: '0.5rem',
    radiusBox: '0.875rem',
    borderWidth: '1px',
    spaceBase: '0.25rem',
    sizeField: '2.75rem',
    sizeSelector: '2rem',
    depth: 1,
    containerWidth: 'wide',
  },
  light: LIGHT,
  dark: DARK,
};

describe('compileTokensV2', () => {
  it('produces a complete set from a preset alone, deriving every -content', () => {
    const c = compileTokensV2(PRESET);
    // Bases carried through.
    expect(c.light.primary).toBe('#4f46e5');
    expect(c.dark.base100).toBe('#0b1120');
    // -content derived (none explicit in the fixture).
    expect(c.light.primaryContent).toBe('#ffffff'); // white on indigo
    expect(c.light.warningContent).toBe('#0a0a0a'); // near-black on amber
    // Shared carried through.
    expect(c.shared.radiusBox).toBe('0.875rem');
    expect(c.shared.depth).toBe(1);
  });

  it('lets brand identity win and re-derives its content', () => {
    const c = compileTokensV2(PRESET, {
      brand: { v: 2, color: { primary: '#ffffff' } },
    });
    expect(c.light.primary).toBe('#ffffff');
    expect(c.light.primaryContent).toBe('#0a0a0a'); // re-derived for white primary
  });

  it('honors an explicit brand -content override over derivation', () => {
    const c = compileTokensV2(PRESET, {
      brand: { v: 2, color: { primary: '#4f46e5', primaryContent: '#fef08a' } },
    });
    expect(c.light.primaryContent).toBe('#fef08a');
  });

  it('lets presentation overlay win per mode for surfaces + status', () => {
    const c = compileTokensV2(PRESET, {
      presentation: {
        v: 2,
        light: { base100: '#fffbeb', danger: '#b91c1c' },
        dark: { base100: '#1c1917' },
      },
    });
    expect(c.light.base100).toBe('#fffbeb');
    expect(c.light.danger).toBe('#b91c1c');
    expect(c.dark.base100).toBe('#1c1917');
    // Untouched mode keeps the preset default.
    expect(c.dark.danger).toBe('#dc2626');
  });

  it('falls secondary back to primary when the preset omits it', () => {
    const noSecondary = { ...PRESET, light: { ...LIGHT, secondary: '' } };
    const c = compileTokensV2(noSecondary);
    expect(c.light.secondary).toBe(c.light.primary);
  });

  it('takes containerWidth from presentation and shape/rhythm/depth from brand', () => {
    const c = compileTokensV2(PRESET, {
      presentation: { v: 2, containerWidth: 'narrow' },
      brand: {
        v: 2,
        shape: { radiusBox: '0px' },
        rhythm: { spaceBase: '0.3rem' },
        effect: { depth: 0 },
      },
    });
    expect(c.shared.containerWidth).toBe('narrow');
    expect(c.shared.radiusBox).toBe('0px');
    expect(c.shared.spaceBase).toBe('0.3rem');
    expect(c.shared.depth).toBe(0);
  });

  it('normalizes hex casing/shorthand from inputs', () => {
    const c = compileTokensV2(PRESET, { brand: { v: 2, color: { primary: '#ABC' } } });
    expect(c.light.primary).toBe('#aabbcc');
  });
});

describe('css emission', () => {
  it('maps canonical color vars', () => {
    const c = compileTokensV2(PRESET);
    const vars = colorVars(c.light);
    expect(vars['--sf-base-100']).toBe('#ffffff');
    expect(vars['--sf-primary']).toBe('#4f46e5');
    expect(vars['--sf-primary-content']).toBe('#ffffff');
    expect(vars['--sf-danger']).toBe('#dc2626');
  });

  it('emits the space scale, depth, font stack, and legacy aliases', () => {
    const c = compileTokensV2(PRESET);
    const s = sharedVars(c.shared);
    expect(s['--sf-space-base']).toBe('0.25rem');
    expect(s['--sf-space-4']).toBe('calc(var(--sf-space-base) * 4)');
    expect(s['--sf-depth']).toBe('1');
    expect(s['--sf-font-heading']).toContain("'Geist'");
    // Legacy aliases point at canonical vars (removed in §4).
    expect(s['--sf-bg']).toBe('var(--sf-base-100)');
    expect(s['--sf-radius']).toBe('var(--sf-radius-box)');
    expect(s['--sf-on-primary']).toBe('var(--sf-primary-content)');
  });

  it('builds a stylesheet with root, dark opt-in, and system-preference blocks', () => {
    const css = buildThemeCssV2(compileTokensV2(PRESET));
    expect(css).toContain(':root{');
    expect(css).toContain(':root[data-theme="dark"]{');
    expect(css).toContain('@media (prefers-color-scheme:dark)');
    expect(css).toContain('--sf-primary:#4f46e5');
  });
});
