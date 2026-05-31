import { z } from 'zod';
import { CmsDocSchema, EMPTY_DOC } from '../common';
import type { SectionField } from '../fields';

// The email rich-text section stores a TipTap/CMS document (edited with the
// dashboard's ContentBlockEditor) and renders via @sparx/cms-editor/serialize.
// Legacy single-doc authored bodies migrate into one of these (docs/31 §5).
export const RichTextConfig = z.object({
  doc: CmsDocSchema.default(EMPTY_DOC),
});
export type RichTextConfig = z.infer<typeof RichTextConfig>;

export const richTextFields: SectionField[] = [{ key: 'doc', label: 'Content', type: 'richtext' }];
