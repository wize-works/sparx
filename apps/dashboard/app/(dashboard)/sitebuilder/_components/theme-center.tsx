'use client';

// The Brand & Theme center — the merged "Look" surface (docs/30 Brand+Theme,
// docs/33 token model v2). One screen, three columns: theme picker (rail) ·
// grouped controls · live component showcase. It replaces the separate Brand
// board and Theme inspector: a single source for the tenant's identity AND its
// presentation overlay, with the showcase recompiling on every keystroke so the
// merchant sees the brand applied across the whole platform without an iframe.
//
//   edit → compileThemeForTenant(themeKey, brand, presentation)
//        → buildThemeCssV2(..., { rootSelector:'#sf-theme-preview' })   ← scoped, instant
//        → debounced updateBrand / updateSettings                       ← persists
//
// The same compile runs server-side on publish, so the showcase tells the truth.
// Brand-owned slots persist via /v1/brand; presentation via the site config —
// the two owners stay clean even though they share one form (docs/33 §3.6).

import * as React from 'react';
import {
  buildThemeCssV2,
  compileThemeForTenant,
  type PresentationOverlayV2,
} from '@sparx/storefront-themes';
import {
  applySavedTheme,
  deleteSavedTheme,
  saveTheme,
  selectTheme,
  updateBrand,
  updateSettings,
  type BrandPatch,
} from '../_lib/actions';
import type {
  AppearancePolicy,
  BrandDto,
  BrandMediaUrls,
  SiteConfigDto,
  SiteThemeDto,
} from '../_lib/types';
import { cleanTokens, type BrandTokens } from '../_lib/brand-feel';
import { BrandThemeControls, type MediaState } from './brand-theme-controls';
import { ThemeRail } from './theme-rail';
import { ThemeShowcase } from './theme-showcase';

type Mode = 'light' | 'dark';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface ThemeCenterProps {
  brand: BrandDto;
  config: SiteConfigDto;
  savedThemes: SiteThemeDto[];
  media: BrandMediaUrls;
}

export function ThemeCenter({ brand, config, savedThemes: initialSaved, media }: ThemeCenterProps) {
  // ── Brand state (persists via /v1/brand) ──────────────────────────────────
  const [businessName, setBusinessName] = React.useState(brand.businessName ?? '');
  const [tagline, setTagline] = React.useState(brand.tagline ?? '');
  const [colorPrimary, setColorPrimary] = React.useState<string | null>(brand.colorPrimary);
  const [colorPrimaryForeground, setColorPrimaryForeground] = React.useState<string | null>(
    brand.colorPrimaryForeground
  );
  const [colorAccent, setColorAccent] = React.useState<string | null>(brand.colorAccent);
  const [colorAccentForeground, setColorAccentForeground] = React.useState<string | null>(
    brand.colorAccentForeground
  );
  const [fontHeading, setFontHeading] = React.useState<string | null>(brand.fontHeading);
  const [fontBody, setFontBody] = React.useState<string | null>(brand.fontBody);
  const [logoLight, setLogoLight] = React.useState<MediaState>({
    id: brand.logoLightMediaId,
    url: media.logoLight,
  });
  const [logoDark, setLogoDark] = React.useState<MediaState>({
    id: brand.logoDarkMediaId,
    url: media.logoDark,
  });
  const [favicon, setFavicon] = React.useState<MediaState>({
    id: brand.faviconMediaId,
    url: media.favicon,
  });
  const [socials, setSocials] = React.useState<Record<string, string>>(brand.socials ?? {});
  const [tokens, setTokens] = React.useState<BrandTokens>(brand.tokens ?? {});

  // ── Presentation state (persists via the site config) ──────────────────────
  const [themeKey, setThemeKey] = React.useState(config.themeKey);
  const [policy, setPolicy] = React.useState<AppearancePolicy>(config.appearancePolicy);
  const [presentation, setPresentation] = React.useState<PresentationOverlayV2>(
    config.draftSettings.presentation ?? { v: 2 }
  );

  const [savedThemes, setSavedThemes] = React.useState<SiteThemeDto[]>(initialSaved);
  const [mode, setMode] = React.useState<Mode>(
    config.appearancePolicy === 'dark-only' ? 'dark' : 'light'
  );
  const [status, setStatus] = React.useState<SaveState>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const cleanedTokens = React.useMemo(() => cleanTokens(tokens), [tokens]);

  // ── Live compile → scoped CSS for the showcase ────────────────────────────
  const brandCols = React.useMemo(
    () => ({
      colorPrimary,
      colorPrimaryForeground,
      colorAccent,
      colorAccentForeground,
      fontHeading,
      fontBody,
      tokens: cleanedTokens,
    }),
    [
      colorPrimary,
      colorPrimaryForeground,
      colorAccent,
      colorAccentForeground,
      fontHeading,
      fontBody,
      cleanedTokens,
    ]
  );
  const compiled = React.useMemo(
    () => compileThemeForTenant({ themeKey, brand: brandCols, presentation }),
    [themeKey, brandCols, presentation]
  );
  const css = React.useMemo(
    () => buildThemeCssV2(compiled, { rootSelector: '#sf-theme-preview' }),
    [compiled]
  );

  // ── Debounced autosave: brand ──────────────────────────────────────────────
  const brandPatch = React.useMemo<BrandPatch>(
    () => ({
      businessName: businessName.trim() || null,
      tagline: tagline.trim() || null,
      logoLightMediaId: logoLight.id,
      logoDarkMediaId: logoDark.id,
      faviconMediaId: favicon.id,
      colorPrimary,
      colorPrimaryForeground,
      colorAccent,
      colorAccentForeground,
      fontHeading,
      fontBody,
      tokens: cleanedTokens,
      socials: Object.fromEntries(Object.entries(socials).filter(([, v]) => v.trim())),
    }),
    [
      businessName,
      tagline,
      logoLight.id,
      logoDark.id,
      favicon.id,
      colorPrimary,
      colorPrimaryForeground,
      colorAccent,
      colorAccentForeground,
      fontHeading,
      fontBody,
      cleanedTokens,
      socials,
    ]
  );
  const savedBrandRef = React.useRef(JSON.stringify(brandPatch));
  React.useEffect(() => {
    const cur = JSON.stringify(brandPatch);
    if (cur === savedBrandRef.current) return;
    setStatus('saving');
    const t = setTimeout(() => {
      void (async () => {
        const res = await updateBrand(brandPatch);
        if (res.ok) {
          savedBrandRef.current = cur;
          setStatus('saved');
        } else {
          setError(res.error ?? 'Could not save your brand.');
          setStatus('error');
        }
      })();
    }, 600);
    return () => clearTimeout(t);
  }, [brandPatch]);

  // ── Debounced autosave: presentation ───────────────────────────────────────
  const draftTokens = React.useRef(config.draftSettings.tokens);
  const draftCss = React.useRef(config.draftSettings.customCss);
  const savedPresRef = React.useRef(JSON.stringify(presentation));
  React.useEffect(() => {
    const cur = JSON.stringify(presentation);
    if (cur === savedPresRef.current) return;
    setStatus('saving');
    const t = setTimeout(() => {
      void (async () => {
        const res = await updateSettings({
          settings: { tokens: draftTokens.current, customCss: draftCss.current, presentation },
        });
        if (res.ok) {
          savedPresRef.current = cur;
          setStatus('saved');
        } else {
          setError(res.error ?? 'Could not save theme settings.');
          setStatus('error');
        }
      })();
    }, 600);
    return () => clearTimeout(t);
  }, [presentation]);

  // ── Theme / saved-theme actions ────────────────────────────────────────────
  const onSelectPreset = (key: string) => {
    setThemeKey(key);
    startTransition(async () => {
      setStatus('saving');
      const res = await selectTheme(key);
      if (res.ok) setStatus('saved');
      else {
        setError(res.error ?? 'Could not switch theme.');
        setStatus('error');
      }
    });
  };

  const onResetOverrides = () => setPresentation({ v: 2 });

  const onPolicyChange = (p: AppearancePolicy) => {
    setPolicy(p);
    startTransition(async () => {
      setStatus('saving');
      const res = await updateSettings({ appearancePolicy: p });
      if (res.ok) setStatus('saved');
      else {
        setError(res.error ?? 'Could not save appearance.');
        setStatus('error');
      }
    });
  };

  const onSaveCurrent = (name: string) => {
    startTransition(async () => {
      setStatus('saving');
      const res = await saveTheme({ name, basePresetKey: themeKey, presentation });
      if (res.ok && res.data) {
        setSavedThemes((s) => [...s, res.data!]);
        setStatus('saved');
      } else {
        setError(res.error ?? 'Could not save this theme yet.');
        setStatus('error');
      }
    });
  };

  const onDeleteSaved = (id: string) => {
    startTransition(async () => {
      const res = await deleteSavedTheme(id);
      if (res.ok) setSavedThemes((s) => s.filter((t) => t.id !== id));
      else {
        setError(res.error ?? 'Could not delete this theme.');
        setStatus('error');
      }
    });
  };

  const onApplySaved = (id: string) => {
    const t = savedThemes.find((x) => x.id === id);
    if (!t) return;
    setThemeKey(t.basePresetKey);
    setPresentation(t.presentation);
    // The apply endpoint persists base + presentation server-side; mark the
    // presentation as saved so the autosave effect doesn't redundantly re-PATCH.
    savedPresRef.current = JSON.stringify(t.presentation);
    startTransition(async () => {
      setStatus('saving');
      const res = await applySavedTheme(id);
      if (res.ok) setStatus('saved');
      else {
        setError(res.error ?? 'Could not apply this theme.');
        setStatus('error');
      }
    });
  };

  const setSocial = (platform: string, value: string) =>
    setSocials((s) => ({ ...s, [platform]: value }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Brand &amp; Theme
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Your identity and theme in one place — every change previews live across the platform.
          </p>
        </div>
        <SaveStatus status={status} error={error} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[15rem_22rem_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-4 xl:self-start">
          <ThemeRail
            savedThemes={savedThemes}
            activeThemeKey={themeKey}
            onSelectPreset={onSelectPreset}
            onResetOverrides={onResetOverrides}
            onApplySaved={onApplySaved}
            onSaveCurrent={onSaveCurrent}
            onDeleteSaved={onDeleteSaved}
            busy={pending}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:contents">
          <div className="min-w-0 xl:col-start-2">
            <BrandThemeControls
              businessName={businessName}
              setBusinessName={setBusinessName}
              tagline={tagline}
              setTagline={setTagline}
              logoLight={logoLight}
              setLogoLight={setLogoLight}
              logoDark={logoDark}
              setLogoDark={setLogoDark}
              favicon={favicon}
              setFavicon={setFavicon}
              colorPrimary={colorPrimary}
              setColorPrimary={setColorPrimary}
              colorPrimaryForeground={colorPrimaryForeground}
              setColorPrimaryForeground={setColorPrimaryForeground}
              colorAccent={colorAccent}
              setColorAccent={setColorAccent}
              colorAccentForeground={colorAccentForeground}
              setColorAccentForeground={setColorAccentForeground}
              fontHeading={fontHeading}
              setFontHeading={setFontHeading}
              fontBody={fontBody}
              setFontBody={setFontBody}
              tokens={tokens}
              setTokens={setTokens}
              socials={socials}
              setSocial={setSocial}
              themeKey={themeKey}
              mode={mode}
              compiledColors={compiled[mode]}
              presentation={presentation}
              onPresentationChange={setPresentation}
              policy={policy}
              onPolicyChange={onPolicyChange}
            />
          </div>

          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start xl:col-start-3">
            <ThemeShowcase
              css={css}
              mode={mode}
              onModeChange={setMode}
              brandName={businessName.trim() || brand.businessName}
              logoLightUrl={logoLight.url}
              logoDarkUrl={logoDark.url}
              headingFont={fontHeading}
              bodyFont={fontBody}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveStatus({ status, error }: { status: SaveState; error: string | null }) {
  if (status === 'error') {
    return (
      <span role="alert" className="text-xs text-[var(--color-danger-text)]">
        {error ?? 'Could not save.'}
      </span>
    );
  }
  const label = status === 'saving' ? 'Saving…' : status === 'saved' ? 'All changes saved' : '';
  return (
    <span role="status" aria-live="polite" className="text-xs text-[var(--color-text-muted)]">
      {label}
    </span>
  );
}
