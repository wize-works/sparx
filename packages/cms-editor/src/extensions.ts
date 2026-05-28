// TipTap extension set shared by every CMS editor instance.
//
// Centralising the extension list here means:
//   - The dashboard <ContentBlockEditor> + any future editor (storefront
//     inline edit, customer support reply composer) produce identical doc
//     shapes.
//   - The serializer in ./serialize.ts can confidently switch on a fixed
//     set of node + mark types.
//
// StarterKit covers paragraph / heading / lists / blockquote / codeBlock /
// horizontalRule / bold / italic / strike / code / history; we layer Link
// + Placeholder on top. Image / callout / embed / table arrive in Phase 3
// alongside the media pipeline.

import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

export interface CmsEditorExtensionsOptions {
  placeholder?: string;
}

export function cmsEditorExtensions(opts: CmsEditorExtensionsOptions = {}) {
  return [
    StarterKit.configure({
      // StarterKit ships an opinionated Link in newer versions; we replace
      // it below with our own configured one so the wire shape stays under
      // our control.
      link: false,
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-[var(--sparx-primary)] underline underline-offset-2',
        rel: 'noopener noreferrer',
      },
    }),
    Placeholder.configure({
      placeholder: opts.placeholder ?? 'Start writing…',
    }),
  ];
}

// The canonical empty doc — useful as a default value for forms. Returned
// by a function (not exported `as const`) so each caller gets a fresh
// mutable copy TipTap can ingest without TypeScript flagging readonly
// arrays.
export function emptyDoc(): { type: 'doc'; content: unknown[] } {
  return { type: 'doc', content: [] };
}

// Legacy constant kept for ergonomic imports — note it returns a new object
// each access so TipTap's internal mutation doesn't leak across editors.
export const EMPTY_DOC = emptyDoc();
