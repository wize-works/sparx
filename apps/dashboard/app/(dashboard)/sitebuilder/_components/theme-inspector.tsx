'use client';

// The Theme inspector (Phase 2 §2.3) — the v2-native replacement for the v1
// customizer. It edits the Token Model v2 PRESENTATION overlay (surfaces,
// neutral, status, border, container) for the mode the canvas is showing, and
// streams the result to the live preview WITHOUT a reload:
//
//   edit → compileThemeForTenant(themeKey, brand, presentation) → buildThemeCssV2
//        → useEditorCanvas().setThemeCss(css)        ← instant, in-browser
//        → debounced updateSettings({ settings.presentation })   ← persists draft
//
// The same compile runs server-side on publish/draft read (publish-service),
// so the preview tells the truth: what you see is exactly what SSR emits. Brand
// identity (primary/accent/type/shape/rhythm/effect) is NOT here — it's owned by
// the tenant brand and edited in the Brand scope; the preview reflects it live.

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ColorPicker,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sparx/ui';
import {
  buildThemeCssV2,
  compileThemeForTenant,
  getThemePresetV2,
  type ColorTokensV2,
  type PresentationColorOverlay,
  type PresentationOverlayV2,
} from '@sparx/storefront-themes';
import { selectTheme, updateSettings } from '../_lib/actions';
import type { AppearancePolicy, BrandDto, SiteConfigDto, ThemeDto } from '../_lib/types';
import { useEditorCanvas } from './editor-shell';
import { PublishBar } from './publish-bar';

type Mode = 'light' | 'dark';
// The presentation slots the inspector edits — every key is valid on both the
// overlay (what we write) and ColorTokensV2 (where we read the preset default).
type SlotKey = keyof PresentationColorOverlay & keyof ColorTokensV2;

const SURFACE_SLOTS: { key: SlotKey; label: string }[] = [
  { key: 'base100', label: 'Page background' },
  { key: 'base200', label: 'Cards & surfaces' },
  { key: 'base300', label: 'Muted surface' },
  { key: 'baseContent', label: 'Body text' },
  { key: 'border', label: 'Borders' },
  { key: 'neutral', label: 'Neutral controls' },
];

const STATUS_SLOTS: { key: SlotKey; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'success', label: 'Success' },
  { key: 'warning', label: 'Warning' },
  { key: 'danger', label: 'Danger' },
];

const CONTAINER_WIDTHS: { value: string; label: string }[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'medium', label: 'Medium' },
  { value: 'wide', label: 'Wide' },
  { value: 'full', label: 'Full width' },
];

const POLICIES: { value: AppearancePolicy; label: string }[] = [
  { value: 'light-only', label: 'Light only' },
  { value: 'dark-only', label: 'Dark only' },
  { value: 'auto', label: 'Auto (follow device)' },
  { value: 'toggle', label: 'Shopper toggle' },
];

export interface ThemeInspectorProps {
  config: SiteConfigDto;
  themes: ThemeDto[];
  brand: BrandDto;
  isPublished: boolean;
  hasUnpublishedChanges: boolean;
}

export function ThemeInspector({
  config,
  themes,
  brand,
  isPublished,
  hasUnpublishedChanges,
}: ThemeInspectorProps) {
  const router = useRouter();
  const canvas = useEditorCanvas();
  const mode: Mode = canvas.mode;
  const [pending, startTransition] = React.useTransition();

  const [themeKey, setThemeKey] = React.useState(config.themeKey);
  const [policy, setPolicy] = React.useState<AppearancePolicy>(config.appearancePolicy);
  const [presentation, setPresentation] = React.useState<PresentationOverlayV2>(
    config.draftSettings.presentation ?? { v: 2 }
  );

  // Brand identity columns drive the v2 compile (brand-owned slots win). Read
  // from the tenant brand, never edited here.
  const brandCols = React.useMemo(
    () => ({
      colorPrimary: brand.colorPrimary,
      colorPrimaryForeground: brand.colorPrimaryForeground,
      colorAccent: brand.colorAccent,
      fontHeading: brand.fontHeading,
      fontBody: brand.fontBody,
      tokens: brand.tokens,
    }),
    [brand]
  );

  // Theme affects every page — point the persistent canvas at the homepage.
  React.useEffect(() => {
    canvas.setPreviewPath('/');
  }, [canvas]);

  const preset = getThemePresetV2(themeKey);
  const overlay: PresentationColorOverlay = presentation[mode] ?? {};
  const slotValue = (key: SlotKey): string => overlay[key] ?? preset[mode][key] ?? '';
  const containerValue = presentation.containerWidth ?? preset.shared.containerWidth;

  // Compile + stream to the live preview (no reload). The same inputs compile on
  // the server at publish/draft-read, so this matches SSR exactly.
  const pushLive = React.useCallback(
    (nextThemeKey: string, next: PresentationOverlayV2) => {
      const compiled = compileThemeForTenant({
        themeKey: nextThemeKey,
        brand: brandCols,
        presentation: next,
      });
      canvas.setThemeCss(buildThemeCssV2(compiled));
    },
    [brandCols, canvas]
  );

  // Debounced draft save — always sends the FULL settings object so the legacy
  // tokens/customCss the v1 path still reads are preserved (updateSettings
  // replaces draftSettings wholesale).
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = React.useCallback(
    (next: PresentationOverlayV2) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void updateSettings({
          settings: {
            tokens: config.draftSettings.tokens,
            customCss: config.draftSettings.customCss,
            presentation: next,
          },
        });
      }, 600);
    },
    [config.draftSettings.tokens, config.draftSettings.customCss]
  );

  const applyPresentation = (next: PresentationOverlayV2) => {
    setPresentation(next);
    pushLive(themeKey, next);
    queueSave(next);
  };

  const onSlotChange = (key: SlotKey, value: string) => {
    applyPresentation({
      ...presentation,
      v: 2,
      [mode]: { ...overlay, [key]: value },
    });
  };

  const onContainerChange = (value: string) => {
    applyPresentation({ ...presentation, v: 2, containerWidth: value });
  };

  const onSelectTheme = (key: string) => {
    setThemeKey(key);
    pushLive(key, presentation); // instant — show the new preset immediately
    startTransition(async () => {
      await selectTheme(key);
      router.refresh();
    });
  };

  const onPolicyChange = (value: AppearancePolicy) => {
    setPolicy(value);
    startTransition(() => void updateSettings({ appearancePolicy: value }));
  };

  const theme = themes.find((t) => t.key === themeKey);

  return (
    <div className="flex flex-col gap-6">
      <PublishBar isPublished={isPublished} hasUnpublishedChanges={hasUnpublishedChanges} />

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

      {/* Identity (logo, brand colour, accent, type) is brand-owned — edited once
          in Brand, reflected here live. */}
      <Panel title="Brand">
        <p className="text-xs text-[var(--color-text-muted)]">
          Your logo, brand colour, accent, and fonts come from your brand and apply across the
          storefront, email, and more. They show live in the preview.
        </p>
        <Link
          href="/sitebuilder/brand"
          className="text-xs font-medium text-[var(--module-active)] hover:underline"
        >
          Edit brand →
        </Link>
      </Panel>

      <Panel
        title="Surfaces"
        hint={`Editing ${mode === 'light' ? 'light' : 'dark'} mode — switch modes in the preview toolbar.`}
      >
        {SURFACE_SLOTS.map((s) => (
          <Swatch
            key={s.key}
            label={s.label}
            value={slotValue(s.key)}
            onChange={(v) => onSlotChange(s.key, v)}
          />
        ))}
      </Panel>

      <Panel title="Status colors">
        {STATUS_SLOTS.map((s) => (
          <Swatch
            key={s.key}
            label={s.label}
            value={slotValue(s.key)}
            onChange={(v) => onSlotChange(s.key, v)}
          />
        ))}
      </Panel>

      <Panel title="Layout">
        <div className="flex flex-col gap-1.5">
          <Label>Content width</Label>
          <Select value={containerValue} onValueChange={onContainerChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTAINER_WIDTHS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Panel>

      {pending ? <p className="text-xs text-[var(--color-text-muted)]">Saving…</p> : null}
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
        {hint ? <p className="text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Swatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm font-normal">{label}</Label>
      <ColorPicker value={value} onChange={onChange} />
    </div>
  );
}
