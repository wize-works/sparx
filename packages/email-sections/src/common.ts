// Shared leaf schemas reused across email section configs. Mirrors
// @sparx/sitebuilder-schemas/common so the two converge into a shared kernel
// later (docs/31 §12); kept independent here to avoid coupling email to the
// in-flight Site Builder redesign.

import { z } from 'zod';

export const Uuid = z.string().uuid();
export const OptionalUuid = z.string().uuid().optional().nullable();

export const Align = z.enum(['left', 'center', 'right']);
export type Align = z.infer<typeof Align>;

// Optional bounded URL/path (internal "/foo" or external "https://…").
export const LinkUrl = z.string().max(2048);

// A TipTap / CMS document, kept loose so this package stays zod-only and does
// not depend on @sparx/cms-editor. The `rich-text` section stores one of these
// in `config.doc`; the renderer serializes it via @sparx/cms-editor/serialize.
export const CmsDocSchema = z
  .object({
    type: z.string(),
    content: z.array(z.unknown()).optional(),
  })
  .passthrough();
export type CmsDocLike = z.infer<typeof CmsDocSchema>;

export const EMPTY_DOC: CmsDocLike = { type: 'doc', content: [] };

// How a data-bound section behaves when its data resolves empty for a given
// send / recipient. `alternate` shows the section's configured fallback
// content (e.g. best-sellers for recommendations); `hide` drops the block.
export const EmptyBehavior = z.enum(['alternate', 'hide']);
export type EmptyBehavior = z.infer<typeof EmptyBehavior>;
