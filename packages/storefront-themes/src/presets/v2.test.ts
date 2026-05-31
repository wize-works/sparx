import { describe, expect, it } from 'vitest';
import { compileTokensV2 } from '../v2/compile';
import { contrastRatio } from '../v2/color';
import type { CompiledColorTokensV2 } from '../v2/types';
import { DEFAULT_THEME_KEY_V2, getThemePresetV2, THEME_DEFAULTS_V2, THEME_KEYS_V2 } from './v2';

describe('v2 preset catalog', () => {
  it('ships all six themes with complete light + dark color sets', () => {
    expect(Object.keys(THEME_DEFAULTS_V2).sort()).toEqual(
      ['apex', 'drift', 'drop', 'fleet', 'industrial', 'market'].sort()
    );
    for (const key of THEME_KEYS_V2) {
      const p = THEME_DEFAULTS_V2[key];
      for (const mode of ['light', 'dark'] as const) {
        // Every required base slot is a non-empty hex.
        for (const slot of [
          'base100',
          'base200',
          'base300',
          'baseContent',
          'primary',
          'secondary',
          'accent',
          'neutral',
          'info',
          'success',
          'warning',
          'danger',
          'border',
        ] as const) {
          expect(p[mode][slot], `${key}.${mode}.${slot}`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
      // Shared shape/rhythm present.
      expect(p.shared.radiusBox).toBeTruthy();
      expect(p.shared.spaceBase).toBeTruthy();
      expect(typeof p.shared.depth).toBe('number');
    }
  });

  it('falls back to apex for an unknown key', () => {
    expect(getThemePresetV2('does-not-exist')).toBe(THEME_DEFAULTS_V2[DEFAULT_THEME_KEY_V2]);
  });
});

describe('v2 preset compile snapshots', () => {
  // Lock the compiled defaults (incl. derived -content) so visual defaults
  // don't silently drift. Update intentionally when a preset changes.
  for (const key of THEME_KEYS_V2) {
    it(`${key} compiles to a stable token set`, () => {
      expect(compileTokensV2(getThemePresetV2(key))).toMatchSnapshot();
    });
  }
});

describe('v2 preset accessibility', () => {
  // Primary/accent/status text must be legible on their own surface. AA for
  // normal text is 4.5; we assert >= 4.5 against the derived (or explicit)
  // content color for the key interactive colors.
  const checkPair = (label: string, base: string, content: string) => {
    expect(contrastRatio(base, content), label).toBeGreaterThanOrEqual(4.5);
  };

  for (const key of THEME_KEYS_V2) {
    it(`${key} primary/accent/status content clears AA`, () => {
      const c = compileTokensV2(getThemePresetV2(key));
      for (const mode of ['light', 'dark'] as const) {
        const t: CompiledColorTokensV2 = c[mode];
        checkPair(`${key}.${mode}.primary`, t.primary, t.primaryContent);
        checkPair(`${key}.${mode}.accent`, t.accent, t.accentContent);
        checkPair(`${key}.${mode}.danger`, t.danger, t.dangerContent);
        checkPair(`${key}.${mode}.success`, t.success, t.successContent);
      }
    });
  }
});
