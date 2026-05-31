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
import { Button, ColorPicker, Input, Label } from '@sparx/ui';
import { updateBrand, type BrandPatch } from '../_lib/actions';
import type { BrandDto, BrandMediaUrls } from '../_lib/types';
import { BrandImageField } from './brand-image-field';
import { BrandBoard } from './brand-board';
import { FieldControl } from './field-control';

const SOCIAL_PLATFORMS = ['instagram', 'facebook', 'x', 'tiktok', 'youtube', 'linkedin'] as const;

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
      socials: Object.fromEntries(Object.entries(socials).filter(([, v]) => v.trim())) as Record<
        string,
        string
      >,
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-3">
        {error ? (
          <span className="text-xs text-[var(--color-danger-text)]">{error}</span>
        ) : dirty ? (
          <span className="text-xs text-[var(--color-text-muted)]">Unsaved changes</span>
        ) : savedAt ? (
          <span className="text-xs text-[var(--color-text-muted)]">Saved</span>
        ) : null}
        <Button variant="primary" onClick={onSave} disabled={!dirty || pending} loading={pending}>
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

          <Section title="Social links">
            {SOCIAL_PLATFORMS.map((p) => (
              <div key={p} className="flex flex-col gap-1.5">
                <Label htmlFor={`brand-social-${p}`} className="capitalize">
                  {p}
                </Label>
                <Input
                  id={`brand-social-${p}`}
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
            socials={Object.fromEntries(Object.entries(socials).filter(([, v]) => v.trim()))}
          />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
      {children}
    </section>
  );
}

// A color field with a clear-to-default affordance (brand colors are optional;
// unset means "inherit the theme default").
function ColorField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
  help?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            Clear
          </button>
        ) : null}
      </div>
      <ColorPicker value={value ?? ''} onChange={(v) => onChange(v || null)} ariaLabel={label} />
      {help ? <p className="text-xs text-[var(--color-text-muted)]">{help}</p> : null}
    </div>
  );
}
