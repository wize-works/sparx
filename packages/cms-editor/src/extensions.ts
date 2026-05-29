// TipTap extension set shared by every CMS editor instance.
//
// Centralising the extension list here means:
//   - The dashboard <ContentBlockEditor> + any future editor (storefront
//     inline edit, customer support reply composer) produce identical doc
//     shapes.
//   - The serializer in ./serialize.ts can confidently switch on a fixed
//     set of node + mark types.
//
// StarterKit covers paragraph / heading / lists / blockquote / horizontal
// rule / bold / italic / strike / code / history. We layer Link + Placeholder
// + Image + Table + CodeBlockLowlight + Callout + Embed + Reference on top,
// each registered in the order they should appear in the schema. Adding a
// block here requires a matching renderer in ./serialize.ts; the test in
// ./serialize.test.ts enforces that round-trip.

import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Callout, Embed, Reference, SparxImage, type ReferenceSearchFn } from './nodes';

const lowlight = createLowlight(common);

export interface CmsEditorExtensionsOptions {
  placeholder?: string;
  /**
   * Fetcher for the @-mention popover. Receives the typed query and returns
   * up to N matching entries. Wired by the host editor (the dashboard's
   * <ContentBlockEditor> binds it to /v1/content/entries?q=…).
   */
  referenceSearch?: ReferenceSearchFn;
}

export function cmsEditorExtensions(opts: CmsEditorExtensionsOptions = {}) {
  // Mention's `suggestion` config wants a `render` function that returns a
  // {onStart, onUpdate, onKeyDown, onExit} object — typically backed by
  // tippy.js for the floating popover. To keep this package usable from
  // tests (jsdom + no DOM popover) and the dashboard (which DOES want a
  // popover) we surface the search fn here but let the host editor in
  // editor.tsx attach the visual portion via Reference's own configure.
  const ref = Reference.configure({
    suggestion: {
      char: '@',
      allowSpaces: false,
      items: async ({ query }: { query: string }): Promise<unknown[]> => {
        if (!opts.referenceSearch) return [];
        const matches = await opts.referenceSearch(query);
        return matches.slice(0, 8);
      },
    },
  });

  return [
    StarterKit.configure({
      // StarterKit ships an opinionated Link in newer versions; we replace
      // it below with our own configured one so the wire shape stays under
      // our control. Drop StarterKit's plain CodeBlock too — we use the
      // lowlight version for syntax highlighting.
      link: false,
      codeBlock: false,
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
    SparxImage,
    Table.configure({ resizable: true, lastColumnResizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    CodeBlockLowlight.configure({
      lowlight,
      defaultLanguage: null,
    }),
    Callout,
    Embed,
    ref,
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
