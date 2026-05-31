import { describe, expect, it } from 'vitest';
import { buildLegacyThemeCss, compileFromLegacy } from './legacy';
import { compileTokensV2 } from './compile';
import { getThemePresetV2 } from '../presets/v2';

describe('compileFromLegacy', () => {
  it('falls back entirely to the preset when no legacy data is present', () => {
    const c = compileFromLegacy({ themeKey: 'apex' });
    const preset = compileTokensV2(getThemePresetV2('apex'));
    expect(c.light.primary).toBe(preset.light.primary);
    expect(c.light.base100).toBe(preset.light.base100);
    expect(c.shared.radiusBox).toBe(preset.shared.radiusBox);
  });

  it('overlays brand identity (both modes) and re-derives its content', () => {
    const c = compileFromLegacy({
      themeKey: 'apex',
      brand: { colorPrimary: '#111111', colorAccent: '#22c55e' },
    });
    expect(c.light.primary).toBe('#111111');
    expect(c.dark.primary).toBe('#111111'); // brand is mode-independent
    expect(c.light.primaryContent).toBe('#ffffff'); // derived for near-black
    expect(c.light.accent).toBe('#22c55e');
  });

  it('maps a merchant corner radius onto brand shape', () => {
    const c = compileFromLegacy({ themeKey: 'apex', brand: { radiusBase: '0px' } });
    expect(c.shared.radiusBox).toBe('0px');
    expect(c.shared.radiusField).toBe('0px');
  });

  it('seeds light surfaces from StorefrontTheme columns; dark stays on preset', () => {
    const preset = compileTokensV2(getThemePresetV2('apex'));
    const c = compileFromLegacy({
      themeKey: 'apex',
      presentationLight: { colorBackground: '#fffbeb', colorMuted: '#fde68a' },
    });
    expect(c.light.base100).toBe('#fffbeb');
    expect(c.light.base300).toBe('#fde68a');
    expect(c.dark.base100).toBe(preset.dark.base100); // untouched
  });

  it('prefers a published snapshot’s per-mode surfaces + container', () => {
    const c = compileFromLegacy({
      themeKey: 'industrial',
      snapshotTokens: {
        light: {
          colorBackground: '#0a0a0a',
          colorForeground: '#fafafa',
          colorMuted: '#171717',
          colorBorder: '#2a2a2a',
          radiusBase: '0.5rem',
          containerWidth: 'narrow',
        },
        dark: {
          colorBackground: '#000000',
          colorForeground: '#ffffff',
          colorMuted: '#111111',
          colorBorder: '#222222',
        },
      },
    });
    expect(c.light.base100).toBe('#0a0a0a');
    expect(c.light.baseContent).toBe('#fafafa');
    expect(c.dark.base100).toBe('#000000');
    expect(c.shared.radiusBox).toBe('0.5rem'); // snapshot radius → brand shape
    expect(c.shared.containerWidth).toBe('narrow');
  });
});

describe('buildLegacyThemeCss', () => {
  it('emits canonical vars + legacy aliases in a root block', () => {
    const css = buildLegacyThemeCss({ themeKey: 'apex', brand: { colorPrimary: '#4f46e5' } });
    expect(css).toContain('--sf-primary:#4f46e5');
    expect(css).toContain('--sf-base-100:');
    expect(css).toContain('--sf-bg:var(--sf-base-100)'); // legacy alias
    expect(css).toContain('--sf-radius:var(--sf-radius-box)');
    expect(css).toContain(':root[data-theme="dark"]{');
  });
});
