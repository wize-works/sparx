// @wizeworks/site-themes/brand-palette — the interchange format that connects the
// public color-palette tool (sparx.works/tools/color-palette) to the studio's
// brand importer. ONE source of truth for the shape, imported by both the
// marketing site (serialize → "Copy for sparx") and the dashboard (parse →
// paste-to-apply), so the two can never drift.
//
// A "sparx brand palette" is a tiny, versioned JSON document: a primary color
// plus an ordered list of accents, each carrying a fill and a readable content
// (foreground) color. It mirrors the tool's own model exactly — the studio maps
// these onto its three brand roles (primary / secondary / accent) on import,
// where the target roles are known. Pure and dependency-free.

export const BRAND_PALETTE_KIND = 'sparx.brand-palette';
export const BRAND_PALETTE_VERSION = 1;

export interface BrandPaletteColor {
  /** `#rrggbb` fill. */
  fill: string;
  /** `#rrggbb` text/foreground color that reads on `fill`. */
  content: string;
}

export interface SparxBrandPalette {
  sparx: typeof BRAND_PALETTE_KIND;
  version: number;
  /** The token name chosen in the tool (e.g. "brand"). Informational. */
  name?: string;
  /** Where it was generated (the tool URL). Informational. */
  source?: string;
  primary: BrandPaletteColor;
  accents: BrandPaletteColor[];
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const HEX3 = /^#[0-9a-fA-F]{3}$/;

/** Normalize any 3/6-digit hex to upper-case `#rrggbb`, or null if invalid. */
function normHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let s = v.trim();
  if (HEX3.test(s)) s = '#' + s.slice(1).replace(/./g, (c) => c + c);
  return HEX6.test(s) ? s.toUpperCase() : null;
}

/** Black or white, whichever reads better on a validated `#rrggbb` fill. Used as
 *  the content fallback when a pasted palette omits one (e.g. hand-authored). */
function readableContentOn(fill: string): string {
  const channel = (hex: string) => {
    const s = parseInt(hex, 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const l =
    0.2126 * channel(fill.slice(1, 3)) +
    0.7152 * channel(fill.slice(3, 5)) +
    0.0722 * channel(fill.slice(5, 7));
  const onBlack = (l + 0.05) / 0.05;
  const onWhite = 1.05 / (l + 0.05);
  return onBlack >= onWhite ? '#000000' : '#FFFFFF';
}

function coerceColor(raw: unknown): BrandPaletteColor | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const fill = normHex(o.fill);
  if (!fill) return null;
  return { fill, content: normHex(o.content) ?? readableContentOn(fill) };
}

export interface SerializeBrandPaletteInput {
  name?: string;
  source?: string;
  primary: BrandPaletteColor;
  accents: BrandPaletteColor[];
}

/** Produce the canonical, pretty-printed JSON a user copies from the tool. */
export function serializeBrandPalette(input: SerializeBrandPaletteInput): string {
  const palette: SparxBrandPalette = {
    sparx: BRAND_PALETTE_KIND,
    version: BRAND_PALETTE_VERSION,
    ...(input.name ? { name: input.name } : {}),
    ...(input.source ? { source: input.source } : {}),
    primary: input.primary,
    accents: input.accents,
  };
  return JSON.stringify(palette, null, 2);
}

export type ParseBrandPaletteResult =
  { ok: true; palette: SparxBrandPalette } | { ok: false; error: string };

/** Parse + validate pasted text into a palette, with friendly errors. */
export function parseBrandPalette(text: string): ParseBrandPaletteResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Paste a color palette to import.' };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      error: 'That isn’t valid JSON. Paste the whole thing the color palette tool copied for you.',
    };
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Expected a color palette object.' };
  }

  const o = raw as Record<string, unknown>;
  if (o.sparx !== BRAND_PALETTE_KIND) {
    return {
      ok: false,
      error: 'Not a color palette. Use the copy button on the color palette tool.',
    };
  }
  if (typeof o.version !== 'number' || o.version > BRAND_PALETTE_VERSION) {
    return {
      ok: false,
      error:
        'This palette was made with a newer version of the palette format. Update and try again.',
    };
  }

  const primary = coerceColor(o.primary);
  if (!primary) return { ok: false, error: 'The palette is missing a valid primary color.' };

  const accents = (Array.isArray(o.accents) ? o.accents : [])
    .map(coerceColor)
    .filter((c): c is BrandPaletteColor => c !== null);

  return {
    ok: true,
    palette: {
      sparx: BRAND_PALETTE_KIND,
      version: o.version,
      name: typeof o.name === 'string' ? o.name : undefined,
      source: typeof o.source === 'string' ? o.source : undefined,
      primary,
      accents,
    },
  };
}
