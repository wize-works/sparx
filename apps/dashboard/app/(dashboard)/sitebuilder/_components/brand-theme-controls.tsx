'use client';

// Column 2 of the Brand & Theme center — every knob that drives the live
// showcase, grouped by category (identity, colour, type, shape, layout) the way
// a merchant thinks, not by which store owns it. Under the hood the two owners
// stay clean (docs/33 §3.6): brand-owned fields (identity, colour, type, shape,
// rhythm, effect) persist via the brand record; presentation-owned fields
// (surfaces, status, container, appearance) persist via the site config. The
// parent (theme-center) holds the state and the debounced savers; this file is
// the form + the small per-axis mutation helpers.
//
// Colours render as a compact swatch grid (docs/33 §3.1): each named colour is a
// FILL swatch plus its text/-content swatch (the "Sx" mark, drawn entirely in the
// content colour so you read it on the fill). Content swatches default to the
// auto-derived contrast colour so they are never blank; setting one is the
// override escape hatch.

import * as React from 'react';
import { Button, Input, Label } from '@sparx/ui';
import {
  getThemePresetV2,
  type CompiledColorTokensV2,
  type ColorTokensV2,
  type PresentationColorOverlay,
  type PresentationOverlayV2,
} from '@sparx/storefront-themes';
import { X } from 'lucide-react';
import type { AppearancePolicy } from '../_lib/types';
import { contrastRatio, rateContrast } from '../_lib/brand-preview';
import {
  BORDER_OPTIONS,
  CORNER_OPTIONS,
  DEPTH_OPTIONS,
  SIZE_OPTIONS,
  SPACING_OPTIONS,
  cornerKeyOf,
  sizeKeyOf,
  type BrandTokens,
} from '../_lib/brand-feel';
import { BrandImageField } from './brand-image-field';
import { FieldControl } from './field-control';

export interface MediaState {
  id: string | null;
  url: string | null;
}

type Mode = 'light' | 'dark';
type SlotKey = keyof PresentationColorOverlay & keyof ColorTokensV2;
interface ColorPair {
  base: SlotKey;
  content: SlotKey | null;
  label: string;
}

const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'x', 'tiktok', 'youtube', 'linkedin'] as const;
const INHERIT = 'default';

// Surfaces are laid out as two stacks: the plain fills (Surface/Muted/Border) on
// the left, the fills that carry their own text colour (Page/Neutral) on the
// right. base-200/300 share base-content (shown once on Page), so they carry no
// own content swatch.
const SURFACE_COL1: ColorPair[] = [
  { base: 'base200', content: null, label: 'Surface' },
  { base: 'base300', content: null, label: 'Muted' },
  { base: 'border', content: null, label: 'Border' },
];
const SURFACE_COL2: ColorPair[] = [
  { base: 'base100', content: 'baseContent', label: 'Page' },
  { base: 'neutral', content: 'neutralContent', label: 'Neutral' },
];

const STATUS_PAIRS: ColorPair[] = [
  { base: 'info', content: 'infoContent', label: 'Info' },
  { base: 'success', content: 'successContent', label: 'Success' },
  { base: 'warning', content: 'warningContent', label: 'Warning' },
  { base: 'danger', content: 'dangerContent', label: 'Danger' },
];

const CONTAINER_WIDTHS = [
  { key: 'narrow', label: 'Narrow' },
  { key: 'medium', label: 'Medium' },
  { key: 'wide', label: 'Wide' },
  { key: 'full', label: 'Full' },
] as const;

const POLICIES: { key: AppearancePolicy; label: string }[] = [
  { key: 'light-only', label: 'Light' },
  { key: 'dark-only', label: 'Dark' },
  { key: 'auto', label: 'Auto' },
  { key: 'toggle', label: 'Toggle' },
];

export interface BrandThemeControlsProps {
  // Identity (brand-owned)
  businessName: string;
  setBusinessName: (v: string) => void;
  tagline: string;
  setTagline: (v: string) => void;
  logoLight: MediaState;
  setLogoLight: (v: MediaState) => void;
  logoDark: MediaState;
  setLogoDark: (v: MediaState) => void;
  favicon: MediaState;
  setFavicon: (v: MediaState) => void;
  colorPrimary: string | null;
  setColorPrimary: (v: string | null) => void;
  colorPrimaryForeground: string | null;
  setColorPrimaryForeground: (v: string | null) => void;
  colorAccent: string | null;
  setColorAccent: (v: string | null) => void;
  colorAccentForeground: string | null;
  setColorAccentForeground: (v: string | null) => void;
  fontHeading: string | null;
  setFontHeading: (v: string | null) => void;
  fontBody: string | null;
  setFontBody: (v: string | null) => void;
  tokens: BrandTokens;
  setTokens: React.Dispatch<React.SetStateAction<BrandTokens>>;
  socials: Record<string, string>;
  setSocial: (platform: string, value: string) => void;

  // Presentation (config-owned), edited for the mode the preview is showing
  themeKey: string;
  mode: Mode;
  // The fully-resolved colours for the active mode — used as the display value
  // for every swatch (so derived -content colours are never blank).
  compiledColors: CompiledColorTokensV2;
  presentation: PresentationOverlayV2;
  onPresentationChange: (next: PresentationOverlayV2) => void;
  policy: AppearancePolicy;
  onPolicyChange: (p: AppearancePolicy) => void;
}

export function BrandThemeControls(props: BrandThemeControlsProps) {
  const {
    businessName,
    setBusinessName,
    tagline,
    setTagline,
    logoLight,
    setLogoLight,
    logoDark,
    setLogoDark,
    favicon,
    setFavicon,
    colorPrimary,
    setColorPrimary,
    colorPrimaryForeground,
    setColorPrimaryForeground,
    colorAccent,
    setColorAccent,
    colorAccentForeground,
    setColorAccentForeground,
    fontHeading,
    setFontHeading,
    fontBody,
    setFontBody,
    tokens,
    setTokens,
    socials,
    setSocial,
    themeKey,
    mode,
    compiledColors,
    presentation,
    onPresentationChange,
    policy,
    onPolicyChange,
  } = props;

  // ── Presentation slot helpers (write into the per-mode overlay) ─────────────
  const preset = getThemePresetV2(themeKey);
  const overlay: PresentationColorOverlay = presentation[mode] ?? {};
  const onSlot = (key: SlotKey, value: string) =>
    onPresentationChange({ ...presentation, v: 2, [mode]: { ...overlay, [key]: value } });
  const containerValue = presentation.containerWidth ?? preset.shared.containerWidth;
  const onContainer = (value: string) =>
    onPresentationChange({ ...presentation, v: 2, containerWidth: value });

  // A presentation colour tile (fill + optional text swatch), reading its display
  // colours from the resolved set and writing edits into the overlay.
  const renderSwatch = (s: ColorPair) => (
    <ColorSwatch
      key={s.base}
      label={s.label}
      value=""
      color={compiledColors[s.base]}
      onChange={(v) => onSlot(s.base, v)}
      content={
        s.content
          ? { color: compiledColors[s.content], onChange: (v) => onSlot(s.content!, v) }
          : undefined
      }
    />
  );

  // ── Brand shape/rhythm/effect knobs (map preset keys ↔ token doc) ──────────
  const cornerKey = cornerKeyOf(tokens) || INHERIT;
  const borderKey = tokens.shape?.borderWidth ?? INHERIT;
  const spacingKey = tokens.rhythm?.spaceBase ?? INHERIT;
  const sizeKey = sizeKeyOf(tokens) || INHERIT;
  const depthKey = tokens.effect?.depth != null ? String(tokens.effect.depth) : INHERIT;

  const setCorner = (key: string) =>
    setTokens((t) => {
      const o = CORNER_OPTIONS.find((c) => c.key === key);
      const borderWidth = t.shape?.borderWidth;
      return {
        ...t,
        shape: o
          ? { ...t.shape, radiusSelector: o.selector, radiusField: o.field, radiusBox: o.box }
          : borderWidth != null
            ? { borderWidth }
            : undefined,
      };
    });
  const setBorder = (key: string) =>
    setTokens((t) => {
      const next = { ...t.shape };
      if (key === INHERIT) delete next.borderWidth;
      else next.borderWidth = key;
      return { ...t, shape: Object.keys(next).length ? next : undefined };
    });
  const setSpacing = (key: string) =>
    setTokens((t) => {
      const next = { ...t.rhythm };
      if (key === INHERIT) delete next.spaceBase;
      else next.spaceBase = key;
      return { ...t, rhythm: Object.keys(next).length ? next : undefined };
    });
  const setSize = (key: string) =>
    setTokens((t) => {
      const o = SIZE_OPTIONS.find((s) => s.key === key);
      const next = { ...t.rhythm };
      if (o) {
        next.sizeField = o.field;
        next.sizeSelector = o.selector;
      } else {
        delete next.sizeField;
        delete next.sizeSelector;
      }
      return { ...t, rhythm: Object.keys(next).length ? next : undefined };
    });
  const setDepth = (key: string) =>
    setTokens((t) => ({ ...t, effect: key === INHERIT ? undefined : { depth: Number(key) } }));

  const modeLabel = mode === 'light' ? 'light' : 'dark';

  // On-primary readability — surfaced compactly under the brand swatches.
  const onPrimaryRatio =
    colorPrimary && colorPrimaryForeground
      ? contrastRatio(colorPrimaryForeground, colorPrimary)
      : null;
  const onPrimaryRating = onPrimaryRatio === null ? null : rateContrast(onPrimaryRatio);
  const lowContrast = onPrimaryRating === 'Fail' || onPrimaryRating === 'AA Large';

  return (
    <div className="flex flex-col gap-6">
      <Section title="Identity">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-name">Business name</Label>
          <Input
            id="brand-name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Acme Diesel"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brand-tagline">Tagline</Label>
          <Input
            id="brand-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Parts that keep you running"
          />
        </div>
      </Section>

      <Section title="Logo & favicon">
        <BrandImageField
          label="Logo (light backgrounds)"
          value={logoLight.id}
          previewUrl={logoLight.url}
          onChange={(id, url) => setLogoLight({ id, url })}
          help="Shown on light surfaces."
        />
        <BrandImageField
          label="Logo (dark backgrounds)"
          value={logoDark.id}
          previewUrl={logoDark.url}
          onChange={(id, url) => setLogoDark({ id, url })}
          help="A light/reversed logo for dark surfaces. Falls back to the light logo."
          dark
        />
        <BrandImageField
          label="Favicon"
          value={favicon.id}
          previewUrl={favicon.url}
          onChange={(id, url) => setFavicon({ id, url })}
          help="Square icon for browser tabs."
        />
      </Section>

      {/* Brand-owned colour identity — applies across storefront, email, and CMS. */}
      <Section title="Brand colors" hint="The Sx mark previews the text colour on each fill.">
        <div className="grid grid-cols-2 gap-2.5">
          <ColorSwatch
            label="Primary"
            value={colorPrimary ?? ''}
            color={colorPrimary ?? compiledColors.primary}
            onChange={setColorPrimary}
            onClear={() => setColorPrimary(null)}
            warn={onPrimaryRating === 'Fail'}
            content={{
              color: colorPrimaryForeground ?? compiledColors.primaryContent,
              onChange: setColorPrimaryForeground,
            }}
          />
          <ColorSwatch
            label="Accent"
            value={colorAccent ?? ''}
            color={colorAccent ?? compiledColors.accent}
            onChange={setColorAccent}
            onClear={() => setColorAccent(null)}
            content={{
              color: colorAccentForeground ?? compiledColors.accentContent,
              onChange: setColorAccentForeground,
            }}
          />
        </div>
        {lowContrast && onPrimaryRatio !== null ? (
          <p className="text-xs text-[var(--color-warning-text)]">
            On-primary text is {onPrimaryRating === 'Fail' ? 'hard to read' : 'a little low'} on
            primary ({onPrimaryRatio.toFixed(1)}:1). Aim for 4.5:1 or higher.
          </p>
        ) : null}
      </Section>

      {/* Presentation-owned surfaces, edited per mode. */}
      <Section title="Surfaces" hint={`Editing ${modeLabel} mode — switch it in the preview.`}>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-2.5">{SURFACE_COL1.map(renderSwatch)}</div>
          <div className="flex flex-col gap-2.5">{SURFACE_COL2.map(renderSwatch)}</div>
        </div>
      </Section>

      <Section title="Status colors">
        <div className="grid grid-cols-2 gap-2.5">{STATUS_PAIRS.map(renderSwatch)}</div>
      </Section>

      <Section title="Typography">
        <FieldControl
          field={{ key: 'fontHeading', label: 'Heading font', type: 'font' }}
          value={fontHeading ?? ''}
          onChange={(v) => setFontHeading((v as string) || null)}
        />
        <FieldControl
          field={{ key: 'fontBody', label: 'Body font', type: 'font' }}
          value={fontBody ?? ''}
          onChange={(v) => setFontBody((v as string) || null)}
        />
      </Section>

      {/* Brand-owned shape/rhythm/effect (docs/33). Segmented, so every option is
          visible and one tap away — no dropdowns. "Auto" clears the brand
          override and follows the theme preset. */}
      <Section title="Shape & feel">
        <Segmented
          label="Corners"
          help="Roundness of buttons, inputs, and cards."
          value={cornerKey}
          options={CORNER_OPTIONS}
          onChange={setCorner}
          includeAuto
        />
        <Segmented
          label="Border weight"
          value={borderKey}
          options={BORDER_OPTIONS}
          onChange={setBorder}
          includeAuto
        />
        <Segmented
          label="Spacing"
          help="Overall density of the layout."
          value={spacingKey}
          options={SPACING_OPTIONS}
          onChange={setSpacing}
          includeAuto
        />
        <Segmented
          label="Control size"
          value={sizeKey}
          options={SIZE_OPTIONS}
          onChange={setSize}
          includeAuto
        />
        <Segmented
          label="Depth"
          help="Shadow strength on cards and menus."
          value={depthKey}
          options={DEPTH_OPTIONS}
          onChange={setDepth}
          includeAuto
        />
      </Section>

      <Section title="Layout">
        <Segmented
          label="Content width"
          help="Maximum width of page content."
          value={containerValue}
          options={CONTAINER_WIDTHS}
          onChange={onContainer}
        />
        <Segmented
          label="Appearance"
          help="How the storefront chooses light or dark for shoppers."
          value={policy}
          options={POLICIES}
          onChange={(v) => onPolicyChange(v as AppearancePolicy)}
        />
      </Section>

      <Section title="Social links">
        {SOCIAL_PLATFORMS.map((p) => (
          <div key={p} className="flex flex-col gap-1.5">
            <Label htmlFor={`brand-social-${p}`} className="capitalize">
              {p}
            </Label>
            <Input
              id={`brand-social-${p}`}
              type="url"
              inputMode="url"
              autoComplete="off"
              value={socials[p] ?? ''}
              onChange={(e) => setSocial(p, e.target.value)}
              placeholder={`https://${p === 'x' ? 'x.com' : `${p}.com`}/yourbrand`}
            />
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({
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
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
        {hint ? <p className="text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

// A named-colour tile: a FILL swatch and (optionally) its text/-content swatch,
// with the name under. `value` is the stored fill ('' = inherit) and drives the
// clear affordance; `color` is the resolved colour the block shows.
function ColorSwatch({
  label,
  value,
  color,
  onChange,
  onClear,
  warn,
  content,
}: {
  label: string;
  value: string;
  color: string;
  onChange: (color: string) => void;
  onClear?: () => void;
  warn?: boolean;
  content?: { color: string; onChange: (color: string) => void };
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex w-full gap-0.5">
        <SwatchInput fill={color} onChange={onChange} ariaLabel={label} warn={warn} />
        {content ? (
          <SwatchInput
            fill={color}
            ink={content.color}
            onChange={content.onChange}
            ariaLabel={`${label} text`}
          />
        ) : null}
        {onClear && value ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${label}`}
            className="absolute -top-1.5 -right-1.5 rounded-full border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-0.5 shadow-sm"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        ) : null}
      </div>
      <span className="text-center text-[11px] leading-tight text-[var(--color-text-secondary)]">
        {label}
      </span>
    </div>
  );
}

// One clickable swatch backed by the OS colour picker. With `ink`, it renders
// the "Sx" mark in that colour over the fill (previewing the text colour) and
// edits the -content colour; otherwise it edits the fill.
function SwatchInput({
  fill,
  ink,
  onChange,
  ariaLabel,
  warn,
}: {
  fill: string;
  ink?: string;
  onChange: (color: string) => void;
  ariaLabel: string;
  warn?: boolean;
}) {
  return (
    <label
      className={`relative flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-center overflow-hidden rounded-md border ${
        warn
          ? 'border-[var(--color-danger-text)] ring-1 ring-[var(--color-danger-text)]'
          : 'border-[var(--color-border-default)]'
      }`}
      style={{ backgroundColor: fill }}
    >
      {ink ? (
        <span className="text-base leading-none font-bold" style={{ color: ink }} aria-hidden>
          Sx
        </span>
      ) : null}
      <input
        type="color"
        value={toInputHex(ink ?? fill)}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

// Coerce any stored colour to the `#rrggbb` the native picker requires.
function toInputHex(v: string): string {
  const s = v.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return '#' + s.slice(1).replace(/./g, (ch) => ch + ch);
  return '#000000';
}

// A segmented control — the inline, all-options-visible replacement for a feel
// dropdown. Built from the sanctioned Button toggle pattern (soft = selected,
// ghost = not), wrapped in a bordered track so the set reads as one control. It
// wraps to a second row when the options don't fit, so it stays clean at any
// count or column width. `includeAuto` prepends an "Auto" chip mapping to
// INHERIT (clear the override → follow the theme preset).
function Segmented({
  label,
  help,
  value,
  options,
  onChange,
  includeAuto = false,
}: {
  label: string;
  help?: string;
  value: string;
  options: readonly { key: string; label: string }[];
  onChange: (key: string) => void;
  includeAuto?: boolean;
}) {
  const items = includeAuto ? [{ key: INHERIT, label: 'Auto' }, ...options] : options;
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-1 rounded-md border border-[var(--color-border-default)] p-1"
      >
        {items.map((o) => {
          const active = value === o.key;
          return (
            <Button
              key={o.key}
              type="button"
              size="xs"
              role="radio"
              aria-checked={active}
              color={active ? 'primary' : 'neutral'}
              variant={active ? 'soft' : 'ghost'}
              onClick={() => onChange(o.key)}
            >
              {o.label}
            </Button>
          );
        })}
      </div>
      {help ? <p className="text-xs text-[var(--color-text-muted)]">{help}</p> : null}
    </div>
  );
}
