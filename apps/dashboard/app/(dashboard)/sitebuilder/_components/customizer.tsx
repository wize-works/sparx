'use client';

// The visual customizer: theme + appearance + color/font/layout settings on the
// left, a live storefront preview on the right. Light/dark mode flips live over
// the Phase 2 §1 preview transport (`sparx-preview-mode`); token + CSS edits
// debounce-save to the draft and surface in the preview on Refresh (the
// storefront re-renders them through the v2 SSR path). Live token streaming —
// compiling buildThemeCssV2 in the browser and pushing `sparx-preview-theme` —
// lands with the v2-native inspector that replaces this panel (Phase 2 §3),
// where the editor holds v2 token state directly. Structural/theme changes save
// then refresh.

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  ColorPicker,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@sparx/ui';
import { BRAND_IDENTITY_TOKEN_KEYS, type ThemeSettingField } from '@sparx/storefront-themes';
import { selectTheme, updateSettings } from '../_lib/actions';
import type { AppearancePolicy, SiteConfigDto, ThemeDto } from '../_lib/types';
import { PublishBar } from './publish-bar';
import { FieldControl } from './field-control';

type Mode = 'light' | 'dark';
type TokenMap = Record<string, string>;

const DEVICES: { id: string; label: string; width: number | null }[] = [
  { id: 'desktop', label: 'Desktop', width: null },
  { id: 'tablet', label: 'Tablet', width: 820 },
  { id: 'mobile', label: 'Mobile', width: 390 },
];

const POLICIES: { value: AppearancePolicy; label: string }[] = [
  { value: 'light-only', label: 'Light only' },
  { value: 'dark-only', label: 'Dark only' },
  { value: 'auto', label: 'Auto (follow device)' },
  { value: 'toggle', label: 'Shopper toggle' },
];

export interface CustomizerProps {
  config: SiteConfigDto;
  themes: ThemeDto[];
  storefrontUrl: string;
  slug: string;
  hasUnpublishedChanges: boolean;
  /** Site-preview token so the iframe renders the draft composition. */
  previewToken?: string | null;
}

export function Customizer({
  config,
  themes,
  storefrontUrl,
  slug,
  hasUnpublishedChanges,
  previewToken,
}: CustomizerProps) {
  const router = useRouter();
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [pending, startTransition] = React.useTransition();

  const [themeKey, setThemeKey] = React.useState(config.themeKey);
  const [policy, setPolicy] = React.useState<AppearancePolicy>(config.appearancePolicy);
  const [previewMode, setPreviewMode] = React.useState<Mode>(
    config.appearancePolicy === 'dark-only' ? 'dark' : 'light'
  );
  const [device, setDevice] = React.useState('desktop');
  const [light, setLight] = React.useState<TokenMap>(config.draftSettings.tokens?.light ?? {});
  const [dark, setDark] = React.useState<TokenMap>(config.draftSettings.tokens?.dark ?? {});
  const [customCss, setCustomCss] = React.useState(config.draftSettings.customCss ?? '');

  const theme = themes.find((t) => t.key === themeKey) ?? themes[0];
  const editing = previewMode === 'light' ? light : dark;
  const setEditing = previewMode === 'light' ? setLight : setDark;

  // Effective token value: merchant override → theme default for the mode.
  const tokenValue = (field: ThemeSettingField): string => {
    const override = editing[field.key];
    if (override) return override;
    return theme?.tokenDefaults[previewMode][field.key] ?? '';
  };

  // Live mode flip over the preview transport (Phase 2 §1). Token/CSS streaming
  // is intentionally NOT pushed here — see the file header.
  const postMode = React.useCallback((mode: Mode) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'sparx-preview-mode', mode }, '*');
  }, []);

  // Debounced draft save of token settings.
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = React.useCallback((next: { light: TokenMap; dark: TokenMap; css: string }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void updateSettings({
        settings: { tokens: { light: next.light, dark: next.dark }, customCss: next.css },
      });
    }, 600);
  }, []);

  const onTokenChange = (key: string, value: string) => {
    const next = { ...editing, [key]: value };
    setEditing(next);
    const nextLight = previewMode === 'light' ? next : light;
    const nextDark = previewMode === 'dark' ? next : dark;
    queueSave({ light: nextLight, dark: nextDark, css: customCss });
  };

  // Fonts/layout are shared across modes — write to both palettes.
  const onSharedChange = (key: string, value: string) => {
    const nextLight = { ...light, [key]: value };
    const nextDark = { ...dark, [key]: value };
    setLight(nextLight);
    setDark(nextDark);
    queueSave({ light: nextLight, dark: nextDark, css: customCss });
  };

  const onCssChange = (css: string) => {
    setCustomCss(css);
    queueSave({ light, dark, css });
  };

  const onSelectTheme = (key: string) => {
    setThemeKey(key);
    startTransition(async () => {
      await selectTheme(key);
      router.refresh();
    });
  };

  const onPolicyChange = (value: AppearancePolicy) => {
    setPolicy(value);
    startTransition(() => void updateSettings({ appearancePolicy: value }));
  };

  const switchMode = (mode: Mode) => {
    setPreviewMode(mode);
    postMode(mode);
  };

  // Identity tokens (brand/primary colour, accent, type) are owned by the
  // tenant-level brand (docs/30 §6) and edited in the Brand panel — never here.
  // The customizer edits PRESENTATION tokens only, so a merchant can't set a
  // value the brand overlay silently overrides at render ("preview tells the
  // truth"). Brand wins live on the storefront + this preview alike.
  const identityTokens = new Set<string>(BRAND_IDENTITY_TOKEN_KEYS);
  const colorFields = (theme?.settingsSchema ?? []).filter(
    (f) => f.group === 'colors' && !identityTokens.has(f.key)
  );
  const typeFields = (theme?.settingsSchema ?? []).filter(
    (f) => f.group === 'typography' && !identityTokens.has(f.key)
  );
  const layoutFields = (theme?.settingsSchema ?? []).filter((f) => f.group === 'layout');
  const deviceWidth = DEVICES.find((d) => d.id === device)?.width ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PublishBar
        isPublished={config.publishedVersionId !== null}
        hasUnpublishedChanges={hasUnpublishedChanges}
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        {/* Left — settings panels */}
        <div className="flex max-h-[calc(100vh-220px)] flex-col gap-6 overflow-y-auto pr-1">
          <Panel title="Theme">
            <Select value={themeKey} onValueChange={onSelectTheme}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {themes.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {theme ? (
              <p className="text-xs text-[var(--color-text-muted)]">{theme.description}</p>
            ) : null}
          </Panel>

          <Panel title="Appearance">
            <div className="flex flex-col gap-1.5">
              <Label>Mode policy</Label>
              <Select value={policy} onValueChange={(v) => onPolicyChange(v as AppearancePolicy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLICIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Panel>

          {/* Brand owns identity (logo, brand colour, accent, type). It's edited
              once in Brand and read everywhere — including this preview — so it
              isn't editable here. */}
          <Panel title="Brand">
            <p className="text-xs text-[var(--color-text-muted)]">
              Your logo, brand colour, accent, and fonts come from your brand and apply across the
              storefront, email, and more. The preview reflects them live.
            </p>
            <Link
              href="/sitebuilder/brand"
              className="text-xs font-medium text-[var(--module-active)] hover:underline"
            >
              Edit brand →
            </Link>
          </Panel>

          {/* Light/Dark is a single control in the preview header (above) — the
              Colors panel edits whichever mode is shown there. Identity colours
              (primary, accent) live in Brand; only presentation colours here. */}
          {colorFields.length > 0 ? (
            <Panel title="Colors">
              {colorFields.map((f) => (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <Label>{f.label}</Label>
                  <ColorPicker value={tokenValue(f)} onChange={(v) => onTokenChange(f.key, v)} />
                  {f.help ? (
                    <p className="text-xs text-[var(--color-text-muted)]">{f.help}</p>
                  ) : null}
                </div>
              ))}
            </Panel>
          ) : null}

          {typeFields.length > 0 ? (
            <Panel title="Fonts">
              {typeFields.map((f) => (
                <FieldControl
                  key={f.key}
                  field={{ key: f.key, label: f.label, type: 'font' }}
                  value={light[f.key] ?? theme?.tokenDefaults.light[f.key] ?? ''}
                  onChange={(v) => onSharedChange(f.key, v as string)}
                />
              ))}
            </Panel>
          ) : null}

          <Panel title="Layout">
            {layoutFields.map((f) => (
              <FieldControl
                key={f.key}
                field={{
                  key: f.key,
                  label: f.label,
                  type: 'select',
                  options: f.options,
                }}
                value={light[f.key] ?? theme?.tokenDefaults.light[f.key] ?? ''}
                onChange={(v) => onSharedChange(f.key, v as string)}
              />
            ))}
          </Panel>

          <Panel title="Custom CSS">
            <Textarea
              rows={6}
              value={customCss}
              onChange={(e) => onCssChange(e.target.value)}
              placeholder=":root { /* advanced overrides */ }"
              className="font-mono text-xs"
            />
          </Panel>
        </div>

        {/* Right — live preview */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {DEVICES.map((d) => (
                <Button
                  key={d.id}
                  size="sm"
                  variant={device === d.id ? 'primary' : 'ghost'}
                  onClick={() => setDevice(d.id)}
                >
                  {d.label}
                </Button>
              ))}
            </div>
            <ModeSwitch mode={previewMode} onChange={switchMode} />
          </div>

          <div className="flex justify-center overflow-hidden rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3">
            <iframe
              ref={iframeRef}
              title="Storefront preview"
              src={`${storefrontUrl}/?tenant=${encodeURIComponent(slug)}${
                previewToken ? `&sparxSitePreview=${encodeURIComponent(previewToken)}` : ''
              }`}
              className="h-[calc(100vh-280px)] w-full rounded-md border-0 bg-white"
              style={deviceWidth ? { width: deviceWidth, maxWidth: '100%' } : undefined}
            />
          </div>
          {pending ? <p className="text-xs text-[var(--color-text-muted)]">Saving…</p> : null}
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex rounded-md border border-[var(--color-border-default)] p-0.5">
      {(['light', 'dark'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={
            mode === m
              ? 'rounded bg-[var(--module-active)] px-2 py-0.5 text-xs text-white'
              : 'rounded px-2 py-0.5 text-xs text-[var(--color-text-muted)]'
          }
        >
          {m === 'light' ? '☀ Light' : '☾ Dark'}
        </button>
      ))}
    </div>
  );
}
