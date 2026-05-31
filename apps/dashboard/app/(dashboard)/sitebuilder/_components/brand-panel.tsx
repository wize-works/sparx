'use client';

// Brand panel — edits the single tenant-level brand record (docs/30 §6). The
// form drives a live brand board beside it (no storefront iframe: the storefront
// doesn't read brand until 1D-4, so an iframe would lie). Brand is owned above
// every module; this surface edits it but does not own it.
//
// Save is explicit (brand is deliberate identity, not a live-tweaked theme) with
// a dirty/saved indicator. The board updates instantly from local state.
//
// Responsive: form and board sit side-by-side on lg+, and stack (board below
// form) on small screens — the builder must be usable on mobile.

import * as React from 'react';
import {
  Button,
  ColorPicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sparx/ui';
import { updateBrand, type BrandPatch } from '../_lib/actions';
import type { BrandDto, BrandMediaUrls } from '../_lib/types';
import { BRAND_PREVIEW_FALLBACK, contrastRatio, rateContrast } from '../_lib/brand-preview';
import {
  BORDER_OPTIONS,
  CORNER_OPTIONS,
  DEPTH_OPTIONS,
  SIZE_OPTIONS,
  SPACING_OPTIONS,
  cleanTokens,
  cornerKeyOf,
  resolveFeel,
  sizeKeyOf,
  type BrandTokens,
} from '../_lib/brand-feel';
import { BrandImageField } from './brand-image-field';
import { BrandBoard } from './brand-board';
import { FieldControl } from './field-control';

const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'x', 'tiktok', 'youtube', 'linkedin'] as const;

// Radix Select forbids an empty-string item value, so "inherit the preset" uses
// this sentinel instead of '' and is mapped back to "clear the axis".
const INHERIT = 'default';

interface MediaState {
  id: string | null;
  url: string | null;
}

export interface BrandPanelProps {
  initial: BrandDto;
  initialMedia: BrandMediaUrls;
}

export function BrandPanel({ initial, initialMedia }: BrandPanelProps) {
  const [businessName, setBusinessName] = React.useState(initial.businessName ?? '');
  const [tagline, setTagline] = React.useState(initial.tagline ?? '');
  const [colorPrimary, setColorPrimary] = React.useState<string | null>(initial.colorPrimary);
  const [colorPrimaryForeground, setColorPrimaryForeground] = React.useState<string | null>(
    initial.colorPrimaryForeground
  );
  const [colorAccent, setColorAccent] = React.useState<string | null>(initial.colorAccent);
  const [fontHeading, setFontHeading] = React.useState<string | null>(initial.fontHeading);
  const [fontBody, setFontBody] = React.useState<string | null>(initial.fontBody);
  const [logoLight, setLogoLight] = React.useState<MediaState>({
    id: initial.logoLightMediaId,
    url: initialMedia.logoLight,
  });
  const [logoDark, setLogoDark] = React.useState<MediaState>({
    id: initial.logoDarkMediaId,
    url: initialMedia.logoDark,
  });
  const [favicon, setFavicon] = React.useState<MediaState>({
    id: initial.faviconMediaId,
    url: initialMedia.favicon,
  });
  const [socials, setSocials] = React.useState<Record<string, string>>(initial.socials ?? {});
  // Brand-owned shape/rhythm/effect (docs/33). A partial doc — unset axes inherit
  // the theme preset; set axes win.
  const [tokens, setTokens] = React.useState<BrandTokens>(initial.tokens ?? {});

  const [pending, startTransition] = React.useTransition();
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Snapshot of the last-saved state, to drive the dirty indicator.
  const snapshot = React.useCallback(
    (): BrandPatch => ({
      businessName: businessName.trim() || null,
      tagline: tagline.trim() || null,
      logoLightMediaId: logoLight.id,
      logoDarkMediaId: logoDark.id,
      faviconMediaId: favicon.id,
      colorPrimary,
      colorPrimaryForeground,
      colorAccent,
      fontHeading,
      fontBody,
      tokens: cleanTokens(tokens),
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
      fontHeading,
      fontBody,
      tokens,
      socials,
    ]
  );

  const savedRef = React.useRef(JSON.stringify(snapshot()));
  const current = JSON.stringify(snapshot());
  const dirty = current !== savedRef.current;

  function onSave() {
    setError(null);
    const patch = snapshot();
    startTransition(async () => {
      const res = await updateBrand(patch);
      if (res.ok) {
        savedRef.current = JSON.stringify(patch);
        setSavedAt(Date.now());
      } else {
        setError(res.error ?? 'Failed to save brand.');
      }
    });
  }

  const setSocial = (platform: string, value: string) =>
    setSocials((s) => ({ ...s, [platform]: value }));

  // ── Shape & feel knobs (map preset keys ↔ the brand token doc) ──────────────
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-3">
        {/* Save feedback is the whole loop on an explicit-save form — keep it in
            a live region so it's announced, not just shown. */}
        {error ? (
          <span role="alert" className="text-xs text-[var(--color-danger-text)]">
            {error}
          </span>
        ) : (
          <span role="status" aria-live="polite" className="text-xs text-[var(--color-text-muted)]">
            {dirty ? 'Unsaved changes' : savedAt ? 'Saved' : ''}
          </span>
        )}
        <Button onClick={onSave} disabled={!dirty || pending} loading={pending}>
          Save changes
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* Form */}
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

          <Section title="Colors">
            <ColorField
              label="Primary"
              value={colorPrimary}
              onChange={setColorPrimary}
              help="Your main brand color."
            />
            <ColorField
              label="On primary"
              value={colorPrimaryForeground}
              onChange={setColorPrimaryForeground}
              help="Text/icons shown on the primary color."
              contrastAgainst={colorPrimary ?? BRAND_PREVIEW_FALLBACK.primary}
            />
            <ColorField label="Accent" value={colorAccent} onChange={setColorAccent} />
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

          {/* Brand-owned shape/rhythm/effect (docs/33). Theme controls surfaces;
              these set the overall feel and apply across the storefront. */}
          <Section title="Shape & feel">
            <FeelSelect
              label="Corners"
              help="Roundness of buttons, inputs, and cards."
              value={cornerKey}
              options={CORNER_OPTIONS}
              onChange={setCorner}
            />
            <FeelSelect
              label="Border weight"
              value={borderKey}
              options={BORDER_OPTIONS}
              onChange={setBorder}
            />
            <FeelSelect
              label="Spacing"
              help="Overall density of the layout."
              value={spacingKey}
              options={SPACING_OPTIONS}
              onChange={setSpacing}
            />
            <FeelSelect
              label="Control size"
              value={sizeKey}
              options={SIZE_OPTIONS}
              onChange={setSize}
            />
            <FeelSelect
              label="Depth"
              help="Shadow strength on cards and menus."
              value={depthKey}
              options={DEPTH_OPTIONS}
              onChange={setDepth}
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

        {/* Board — sticky beside the form on desktop, stacked below on mobile */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <BrandBoard
            businessName={businessName}
            tagline={tagline}
            colorPrimary={colorPrimary}
            colorPrimaryForeground={colorPrimaryForeground}
            colorAccent={colorAccent}
            fontHeading={fontHeading}
            fontBody={fontBody}
            logoLightUrl={logoLight.url}
            logoDarkUrl={logoDark.url}
            feel={resolveFeel(tokens)}
            socials={Object.fromEntries(Object.entries(socials).filter(([, v]) => v.trim()))}
          />
        </div>
      </div>
    </div>
  );
}

// A labelled Select for one shape/rhythm/effect knob. The first item ("Theme
// default", value INHERIT) clears the axis so it inherits the preset.
function FeelSelect({
  label,
  help,
  value,
  options,
  onChange,
}: {
  label: string;
  help?: string;
  value: string;
  options: readonly { key: string; label: string }[];
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={INHERIT}>Theme default</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.key} value={o.key}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {help ? <p className="text-xs text-[var(--color-text-muted)]">{help}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  // <h2> under the page's <h1> — no skipped level (the board's labels are
  // <span>, so these are the only sub-headings).
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

// Maps a WCAG rating to a token-backed badge tone. Fail → danger, the partial
// AA-Large pass → warning, AA/AAA → success.
function contrastTone(rating: string): React.CSSProperties {
  if (rating === 'Fail')
    return { color: 'var(--color-danger-text)', backgroundColor: 'var(--color-danger-tint)' };
  if (rating === 'AA Large')
    return { color: 'var(--color-warning-text)', backgroundColor: 'var(--color-warning-tint)' };
  return { color: 'var(--color-success-text)', backgroundColor: 'var(--color-success-tint)' };
}

// A color field with a clear-to-default affordance (brand colors are optional;
// unset means "inherit the theme default"). When `contrastAgainst` is set it
// shows a live WCAG rating — a brand tool should never let an unreadable
// primary/on-primary pair ship silently.
function ColorField({
  label,
  value,
  onChange,
  help,
  contrastAgainst,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
  help?: string;
  contrastAgainst?: string;
}) {
  const ratio = contrastAgainst && value ? contrastRatio(value, contrastAgainst) : null;
  const rating = ratio === null ? null : rateContrast(ratio);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {value ? (
          <Button
            type="button"
            color="primary"
            variant="link"
            size="xs"
            onClick={() => onChange(null)}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <ColorPicker value={value ?? ''} onChange={(v) => onChange(v || null)} ariaLabel={label} />
      {ratio !== null && rating ? (
        <span
          className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
          style={contrastTone(rating)}
        >
          {ratio.toFixed(1)}:1 · {rating}
          {rating === 'Fail' ? ' — hard to read' : ''}
        </span>
      ) : null}
      {help ? <p className="text-xs text-[var(--color-text-muted)]">{help}</p> : null}
    </div>
  );
}
