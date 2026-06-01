import { describe, expect, it } from 'vitest';
import { brandColsToTokenDoc, compileThemeForTenant } from './tenant';
import { compileTokensV2 } from './compile';
import { getThemePresetV2 } from '../presets/v2';

describe('brandColsToTokenDoc', () => {
  it('maps the identity columns onto a v2 brand doc', () => {
    const doc = brandColsToTokenDoc({
      colorPrimary: '#111111',
      colorPrimaryForeground: '#ffffff',
      colorAccent: '#22c55e',
      fontHeading: 'Sora',
      fontBody: 'Inter',
    });
    expect(doc.v).toBe(2);
    expect(doc.color?.primary).toBe('#111111');
    expect(doc.color?.primaryContent).toBe('#ffffff');
    expect(doc.color?.accent).toBe('#22c55e');
    expect(doc.type?.heading).toBe('Sora');
    expect(doc.type?.body).toBe('Inter');
  });

  it('maps secondary + the accent/secondary -content override columns', () => {
    const doc = brandColsToTokenDoc({
      colorAccent: '#f97316',
      colorAccentForeground: '#1c1917',
      colorSecondary: '#0ea5e9',
      colorSecondaryForeground: '#f8fafc',
    });
    expect(doc.color?.accent).toBe('#f97316');
    expect(doc.color?.accentContent).toBe('#1c1917');
    expect(doc.color?.secondary).toBe('#0ea5e9');
    expect(doc.color?.secondaryContent).toBe('#f8fafc');
  });

  it('leaves absent columns null so the compiler falls through to the preset', () => {
    const doc = brandColsToTokenDoc(null);
    expect(doc.color?.primary).toBeNull();
    expect(doc.color?.secondary).toBeNull();
    expect(doc.color?.accentContent).toBeNull();
    expect(doc.color?.secondaryContent).toBeNull();
    expect(doc.type?.heading).toBeNull();
    expect(doc.shape).toBeUndefined();
    expect(doc.effect).toBeUndefined();
  });

  it('merges shape/rhythm/effect from the tokens doc (colour/type stay in columns)', () => {
    const doc = brandColsToTokenDoc({
      colorPrimary: '#111111',
      tokens: {
        v: 2,
        shape: { radiusBox: '0px', borderWidth: '2px' },
        rhythm: { spaceBase: '0.3rem' },
        effect: { depth: 0 },
      },
    });
    expect(doc.color?.primary).toBe('#111111'); // column wins for colour
    expect(doc.shape?.radiusBox).toBe('0px');
    expect(doc.shape?.borderWidth).toBe('2px');
    expect(doc.rhythm?.spaceBase).toBe('0.3rem');
    expect(doc.effect?.depth).toBe(0);
  });
});

describe('compileThemeForTenant with brand shape/rhythm/effect', () => {
  it('applies brand shape + effect over the preset', () => {
    const c = compileThemeForTenant({
      themeKey: 'apex',
      brand: { tokens: { v: 2, shape: { radiusBox: '0px' }, effect: { depth: 0 } } },
    });
    expect(c.shared.radiusBox).toBe('0px');
    expect(c.shared.depth).toBe(0);
  });
});

describe('compileThemeForTenant', () => {
  it('falls back entirely to the preset with no brand or presentation', () => {
    const c = compileThemeForTenant({ themeKey: 'apex' });
    const preset = compileTokensV2(getThemePresetV2('apex'));
    expect(c.light.primary).toBe(preset.light.primary);
    expect(c.light.base100).toBe(preset.light.base100);
    expect(c.shared.containerWidth).toBe(preset.shared.containerWidth);
  });

  it('lets brand identity win across both modes (mode-independent)', () => {
    const c = compileThemeForTenant({
      themeKey: 'apex',
      brand: { colorPrimary: '#111111', colorAccent: '#22c55e' },
    });
    expect(c.light.primary).toBe('#111111');
    expect(c.dark.primary).toBe('#111111');
    expect(c.light.accent).toBe('#22c55e');
    expect(c.light.primaryContent).toBe('#ffffff'); // derived for near-black
  });

  it('lets the presentation overlay win for its slots, per mode', () => {
    const preset = compileTokensV2(getThemePresetV2('apex'));
    const c = compileThemeForTenant({
      themeKey: 'apex',
      presentation: {
        v: 2,
        containerWidth: 'narrow',
        light: { base100: '#fffbeb', baseContent: '#1c1917', border: '#fde68a' },
      },
    });
    expect(c.light.base100).toBe('#fffbeb');
    expect(c.light.baseContent).toBe('#1c1917');
    expect(c.light.border).toBe('#fde68a');
    expect(c.dark.base100).toBe(preset.dark.base100); // untouched mode stays on preset
    expect(c.shared.containerWidth).toBe('narrow');
  });

  it('lets brand secondary + explicit -content overrides win over derivation', () => {
    const c = compileThemeForTenant({
      themeKey: 'apex',
      brand: {
        colorAccent: '#f97316',
        colorAccentForeground: '#1c1917',
        colorSecondary: '#0ea5e9',
        colorSecondaryForeground: '#f8fafc',
      },
    });
    expect(c.light.secondary).toBe('#0ea5e9');
    expect(c.light.secondaryContent).toBe('#f8fafc'); // explicit, not derived
    expect(c.light.accent).toBe('#f97316');
    expect(c.light.accentContent).toBe('#1c1917'); // explicit, not derived
    expect(c.dark.secondary).toBe('#0ea5e9'); // identity is mode-independent
  });

  it('derives -content for accent/secondary when the override columns are unset', () => {
    const c = compileThemeForTenant({
      themeKey: 'apex',
      brand: { colorAccent: '#111111', colorSecondary: '#111111' },
    });
    expect(c.light.accentContent).toBe('#ffffff'); // derived for near-black
    expect(c.light.secondaryContent).toBe('#ffffff'); // derived for near-black
  });

  it('keeps brand identity even when presentation overrides surfaces', () => {
    const c = compileThemeForTenant({
      themeKey: 'industrial',
      brand: { colorPrimary: '#4f46e5' },
      presentation: { v: 2, light: { base100: '#0a0a0a' } },
    });
    expect(c.light.primary).toBe('#4f46e5'); // brand-owned
    expect(c.light.base100).toBe('#0a0a0a'); // presentation-owned
  });
});
