'use client';

// The brand board — a live, self-contained style tile rendered purely from the
// form state. Brand has no honest storefront preview until the storefront reads
// it (1D-4), so we don't embed a storefront iframe that would lie; instead we
// show how the identity reads on its own: logo on light/dark/brand surfaces, the
// palette with hex labels, a type specimen, buttons in the brand colours, and
// socials. Dynamic brand values (colours, fonts) use inline styles by necessity
// — an arbitrary tenant hex/font can't be a Tailwind class. The chrome around
// them uses the same token classes as the rest of the module.

import * as React from 'react';
import { ImageIcon } from 'lucide-react';
import {
  BRAND_PREVIEW_FALLBACK,
  contrastRatio,
  fontStack,
  rateContrast,
} from '../_lib/brand-preview';
import { depthShadow, resolveFeel, type ResolvedFeel } from '../_lib/brand-feel';

export interface BrandBoardValues {
  businessName: string | null;
  tagline: string | null;
  colorPrimary: string | null;
  colorPrimaryForeground: string | null;
  colorAccent: string | null;
  fontHeading: string | null;
  fontBody: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  // Resolved shape/rhythm/effect for the "Applied" samples (defaults when absent).
  feel?: ResolvedFeel;
  socials: Record<string, string>;
}

// Preview-only fallbacks (shared with the form's contrast readout so the two
// can't drift) so the board never looks broken before a field is set.
const FALLBACK = BRAND_PREVIEW_FALLBACK;

export function BrandBoard(props: BrandBoardValues) {
  const primary = props.colorPrimary ?? FALLBACK.primary;
  const onPrimary = props.colorPrimaryForeground ?? FALLBACK.primaryForeground;
  const accent = props.colorAccent ?? FALLBACK.accent;
  const headingFont = fontStack(props.fontHeading, FALLBACK.heading);
  const bodyFont = fontStack(props.fontBody, FALLBACK.body);
  const trimmedName = props.businessName?.trim();
  const name = trimmedName && trimmedName.length > 0 ? trimmedName : 'Your business';
  const socials = Object.entries(props.socials).filter(([, v]) => v.trim());
  const feel = props.feel ?? resolveFeel({});
  const shadow = depthShadow(feel.depth);

  // Rate the pair the merchant will actually ship on every brand button.
  const buttonRatio = contrastRatio(onPrimary, primary);
  const buttonFails = buttonRatio !== null && rateContrast(buttonRatio) === 'Fail';

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-5">
      <BoardLabel>Brand board</BoardLabel>

      {/* Logo on three surfaces */}
      <div className="grid grid-cols-3 gap-2">
        <LogoTile
          bg="#ffffff"
          label="On light"
          logo={props.logoLightUrl}
          name={name}
          text="#0b0b0f"
        />
        <LogoTile
          bg="#0b0b0f"
          label="On dark"
          logo={props.logoDarkUrl ?? props.logoLightUrl}
          name={name}
          text="#ffffff"
        />
        <LogoTile
          bg={primary}
          label="On brand"
          logo={props.logoDarkUrl ?? props.logoLightUrl}
          name={name}
          text={onPrimary}
        />
      </div>

      {/* Name + tagline in brand type */}
      <div className="flex flex-col gap-1">
        <span
          className="text-2xl leading-tight font-semibold text-[var(--color-text-primary)]"
          style={{ fontFamily: headingFont }}
        >
          {name}
        </span>
        {props.tagline?.trim() ? (
          <span className="text-sm text-[var(--color-text-muted)]" style={{ fontFamily: bodyFont }}>
            {props.tagline}
          </span>
        ) : null}
      </div>

      {/* Palette */}
      <div className="flex flex-col gap-2">
        <BoardLabel>Palette</BoardLabel>
        <div className="grid grid-cols-3 gap-2">
          <Swatch hex={primary} name="Primary" set={Boolean(props.colorPrimary)} />
          <Swatch hex={onPrimary} name="On primary" set={Boolean(props.colorPrimaryForeground)} />
          <Swatch hex={accent} name="Accent" set={Boolean(props.colorAccent)} />
        </div>
      </div>

      {/* Type specimen */}
      <div className="flex flex-col gap-2">
        <BoardLabel>Typography</BoardLabel>
        <div className="rounded-md border border-[var(--color-border-default)] p-3">
          <div
            className="text-3xl leading-none text-[var(--color-text-primary)]"
            style={{ fontFamily: headingFont }}
          >
            Ag
          </div>
          <div
            className="mt-1 text-xs text-[var(--color-text-muted)]"
            style={{ fontFamily: headingFont }}
          >
            Heading · {props.fontHeading ?? `${FALLBACK.heading} (default)`}
          </div>
          <p
            className="mt-3 text-sm text-[var(--color-text-primary)]"
            style={{ fontFamily: bodyFont }}
          >
            The quick brown fox jumps over the lazy dog.
          </p>
          <div
            className="mt-1 text-xs text-[var(--color-text-muted)]"
            style={{ fontFamily: bodyFont }}
          >
            Body · {props.fontBody ?? `${FALLBACK.body} (default)`}
          </div>
        </div>
      </div>

      {/* Applied — brand colours + the chosen shape/feel (radius, border, depth) */}
      <div className="flex flex-col gap-2">
        <BoardLabel>Applied</BoardLabel>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium"
            style={{
              backgroundColor: primary,
              color: onPrimary,
              fontFamily: bodyFont,
              borderRadius: feel.radiusField,
              boxShadow: shadow,
            }}
          >
            Primary action
          </span>
          <span
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium"
            style={{
              borderColor: accent,
              color: accent,
              fontFamily: bodyFont,
              borderRadius: feel.radiusField,
              borderWidth: feel.borderWidth,
              borderStyle: 'solid',
            }}
          >
            Accent
          </span>
          <span
            className="inline-flex items-center px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: accent,
              color: onPrimary,
              fontFamily: bodyFont,
              borderRadius: feel.radiusSelector,
            }}
          >
            Pill
          </span>
        </div>
        <div
          className="flex flex-col gap-1 bg-[var(--color-bg-default)] p-3"
          style={{
            borderRadius: feel.radiusBox,
            borderWidth: feel.borderWidth,
            borderStyle: 'solid',
            borderColor: 'var(--color-border-default)',
            boxShadow: shadow,
          }}
        >
          <span
            className="text-sm font-medium text-[var(--color-text-primary)]"
            style={{ fontFamily: headingFont }}
          >
            Card surface
          </span>
          <span className="text-xs text-[var(--color-text-muted)]" style={{ fontFamily: bodyFont }}>
            Corners, borders, and depth follow your brand.
          </span>
        </div>
        {buttonFails ? (
          <p className="text-xs text-[var(--color-danger-text)]">
            Low contrast ({buttonRatio?.toFixed(1)}:1) — this button text may be hard to read. Aim
            for 4.5:1 or higher.
          </p>
        ) : null}
      </div>

      {/* Socials */}
      {socials.length > 0 ? (
        <div className="flex flex-col gap-2">
          <BoardLabel>Social</BoardLabel>
          <div className="flex flex-col gap-1">
            {socials.map(([platform, url]) => (
              <div key={platform} className="flex items-baseline gap-2 text-sm">
                <span className="w-24 flex-none text-[var(--color-text-muted)] capitalize">
                  {platform}
                </span>
                <span className="truncate text-[var(--color-text-primary)]">{url}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BoardLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium tracking-wide text-[var(--color-text-tertiary)] uppercase">
      {children}
    </span>
  );
}

function LogoTile({
  bg,
  label,
  logo,
  name,
  text,
}: {
  bg: string;
  label: string;
  logo: string | null;
  name: string;
  text: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex h-20 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border-default)] p-2"
        style={{ backgroundColor: bg }}
      >
        {logo ? (
          <img
            src={logo}
            alt={`${name} logo`}
            loading="lazy"
            decoding="async"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="flex items-center gap-1.5" style={{ color: text }}>
            <ImageIcon className="h-4 w-4 opacity-60" />
            <span className="truncate text-xs font-semibold">{name}</span>
          </div>
        )}
      </div>
      <span className="text-center text-[10px] text-[var(--color-text-tertiary)]">{label}</span>
    </div>
  );
}

function Swatch({ hex, name, set }: { hex: string; name: string; set: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-12 rounded-md border border-[var(--color-border-default)]"
        style={{ backgroundColor: hex }}
      />
      <div className="flex flex-col">
        <span className="text-xs font-medium text-[var(--color-text-primary)]">{name}</span>
        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
          {hex.toUpperCase()}
          {set ? '' : ' (default)'}
        </span>
      </div>
    </div>
  );
}
