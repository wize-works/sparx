// Reference — inline mention of a sibling content entry.
//
// Wraps @tiptap/extension-mention with `@` as the trigger char and stores
// `{ entryId, typeKey, label }`. The suggestion popover is hand-driven via
// the host editor's `referenceSearch` callback so the cms-editor package
// stays free of any api-rest fetch logic (the dashboard supplies search;
// other consumers can supply their own).
//
// At render time the serializer emits `<a data-ref-entry="…" href="…">`
// with the link resolved against the type's url pattern.

import Mention from '@tiptap/extension-mention';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sparxReference: {
      setReference: (attrs: ReferenceAttrs) => ReturnType;
    };
  }
}

export interface ReferenceAttrs {
  entryId: string;
  typeKey: string;
  label: string;
}

export const Reference = Mention.extend({
  name: 'sparxReference',
  inline: true,
  group: 'inline',
  atom: true,

  addAttributes() {
    return {
      entryId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-ref-entry') ?? '',
        renderHTML: (attrs) => ({ 'data-ref-entry': attrs.entryId as string }),
      },
      typeKey: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-ref-type') ?? '',
        renderHTML: (attrs) => ({ 'data-ref-type': attrs.typeKey as string }),
      },
      label: {
        default: '',
        parseHTML: (el) => el.textContent ?? '',
        renderHTML: () => ({}),
      },
    };
  },

  renderText({ node }) {
    return `@${(node.attrs as ReferenceAttrs).label || '…'}`;
  },

  parseHTML() {
    return [{ tag: 'span[data-sparx-reference]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      {
        ...HTMLAttributes,
        'data-sparx-reference': 'true',
        class: 'sparx-reference',
      },
      `@${(node.attrs as ReferenceAttrs).label || ''}`,
    ];
  },

  addCommands() {
    return {
      setReference:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs,
          }),
    };
  },
});

// ReferenceSearch is what the host editor wires up via the Suggestion API.
// We keep it as a type only — the actual suggestion plugin is created in
// extensions.ts so the consumer can plug in their fetcher.
export interface ReferenceSearchResult {
  entryId: string;
  typeKey: string;
  label: string;
  hint?: string;
}

export type ReferenceSearchFn = (query: string) => Promise<ReferenceSearchResult[]>;
