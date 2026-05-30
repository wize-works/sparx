import { describe, it, expect } from 'vitest';
import { compileTokens, getTheme, toStorefrontThemeColumns } from './compile';
import { THEME_LIST } from './presets';
import { tokensToCssVars } from './tokens';

describe('compileTokens', () => {
  it('returns complete light + dark token maps from preset defaults', () => {
    const { light, dark } = compileTokens('apex');
    expect(light.colorPrimary).toBe('#4f46e5');
    expect(dark.colorBackground).toBe('#0b1120');
    // Every token key is present (no holes) so the storefront always has a value.
    expect(Object.keys(light)).toContain('containerWidth');
  });

  it('overlays merchant overrides per mode and ignores unknown keys', () => {
    const { light, dark } = compileTokens('apex', {
      light: { colorPrimary: '#ff0000', bogus: 'nope' } as Record<string, string>,
      dark: { colorPrimary: '#00ff00' },
    });
    expect(light.colorPrimary).toBe('#ff0000');
    expect(dark.colorPrimary).toBe('#00ff00');
    // Untouched tokens fall back to the preset default.
    expect(light.colorAccent).toBe('#0ea5e9');
    expect((light as Record<string, string>).bogus).toBeUndefined();
  });

  it('falls back to apex for an unknown theme key', () => {
    expect(getTheme('does-not-exist').key).toBe('apex');
  });

  it('projects light tokens onto StorefrontTheme columns for write-through', () => {
    const { light } = compileTokens('industrial');
    const cols = toStorefrontThemeColumns(light);
    expect(cols.colorPrimary).toBe('#cc1010');
    expect(cols.fontHeading).toBe('Oswald');
    // colorForeground/colorBorder/containerWidth have no column — not written through.
    expect(cols.colorForeground).toBeUndefined();
    expect(cols.containerWidth).toBeUndefined();
  });
});

describe('tokensToCssVars', () => {
  it('maps tokens to --sf-* custom properties with font fallbacks', () => {
    const { light } = compileTokens('apex');
    const vars = tokensToCssVars(light);
    expect(vars['--sf-primary']).toBe('#4f46e5');
    expect(vars['--sf-font-body']).toContain("'Inter'");
    // Named container width compiles to a CSS length.
    expect(vars['--sf-container']).toBe('72rem');
  });
});

describe('theme catalog', () => {
  it('ships all six themes with light + dark defaults', () => {
    expect(THEME_LIST.map((t) => t.key)).toEqual([
      'apex',
      'industrial',
      'drift',
      'market',
      'fleet',
      'drop',
    ]);
    for (const theme of THEME_LIST) {
      expect(Object.keys(theme.tokenDefaults.light).length).toBeGreaterThan(0);
      expect(Object.keys(theme.tokenDefaults.dark).length).toBeGreaterThan(0);
    }
  });
});
