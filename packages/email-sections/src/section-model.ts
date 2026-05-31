// The email body model — an ordered list of section instances (docs/31 §5).
//
// Two coercion entry points:
//   normalizeBody(raw) — never throws; coerces ANY stored shape (new section
//     list, a legacy bare CmsDoc, or empty) into an EmailBody. Used on read so
//     render / editor-load is always safe, and unknown future section types
//     round-trip rather than being dropped.
//   parseBody(raw)     — strict; validates + defaults every section's config and
//     rejects unknown types. Used on write (API input).

import { z } from 'zod';
import { EmailSectionTypeEnum, parseSectionConfig, sectionTier } from './registry';
import type { SectionTier } from './registry';

export interface EmailSectionInstance {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface EmailBody {
  version: 1;
  sections: EmailSectionInstance[];
}

export const EMPTY_BODY: EmailBody = { version: 1, sections: [] };

// Stable id for the single section a legacy CmsDoc body migrates into.
const LEGACY_SECTION_ID = 'sec_main';

const SectionInstanceLoose = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(63),
  config: z.record(z.string(), z.unknown()).default({}),
});

const BodyShape = z.object({
  version: z.literal(1).default(1),
  sections: z.array(SectionInstanceLoose).default([]),
});

const StrictSectionInstance = z.object({
  id: z.string().min(1).max(64),
  type: EmailSectionTypeEnum,
  config: z.record(z.string(), z.unknown()).default({}),
});

function looksLikeBody(raw: unknown): raw is { version?: number; sections: unknown[] } {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as { sections?: unknown }).sections)
  );
}

function looksLikeCmsDoc(raw: unknown): raw is Record<string, unknown> {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    typeof (raw as { type?: unknown }).type === 'string' &&
    !Array.isArray((raw as { sections?: unknown }).sections)
  );
}

/**
 * Coerce any stored body into the section-list shape. Never throws. A legacy
 * bare CmsDoc becomes a single `rich-text` section (lossless); an empty / null
 * body becomes EMPTY_BODY; a section-list passes through (loosely validated).
 */
export function normalizeBody(raw: unknown): EmailBody {
  if (looksLikeBody(raw)) {
    const parsed = BodyShape.safeParse(raw);
    if (parsed.success) return { version: 1, sections: parsed.data.sections };
    return EMPTY_BODY;
  }
  if (looksLikeCmsDoc(raw)) {
    return {
      version: 1,
      sections: [{ id: LEGACY_SECTION_ID, type: 'rich-text', config: { doc: raw } }],
    };
  }
  return EMPTY_BODY;
}

/**
 * Strictly validate + default a body for persistence. Every section's config is
 * parsed against its schema; unknown section types throw ZodError. Callers map
 * that to their transport's validation envelope.
 */
export function parseBody(raw: unknown): EmailBody {
  const base = looksLikeBody(raw) ? raw : looksLikeCmsDoc(raw) ? normalizeBody(raw) : EMPTY_BODY;
  const shell = z
    .object({
      version: z.literal(1).default(1),
      sections: z.array(StrictSectionInstance).default([]),
    })
    .parse(base);
  const sections = shell.sections.map((s) => ({
    id: s.id,
    type: s.type,
    config: parseSectionConfig(s.type, s.config),
  }));
  return { version: 1, sections };
}

/** True when the body contains at least one section of the given tier. */
export function bodyHasTier(body: EmailBody, tier: SectionTier): boolean {
  return body.sections.some((s) => sectionTier(s.type) === tier);
}

/** True when rendering must run per recipient (any personalized section). */
export function bodyIsPersonalized(body: EmailBody): boolean {
  return bodyHasTier(body, 'personalized');
}
