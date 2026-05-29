// Callout — a block container with a semantic variant ('info'|'success'|
// 'warning'|'danger') that renders as an aside in HTML. Cheap to model: one
// node, one attribute, paragraph content.
//
// Why a custom node and not blockquote-with-class? Variant carries
// presentation intent, so the editor toolbar can offer "Insert info
// callout" vs. "Insert warning callout" rather than asking the author to
// add classes by hand. The serializer maps variant → role + class so the
// public HTML is screen-reader friendly without forcing the dashboard
// editor to track ARIA attributes itself.

import { Node, mergeAttributes } from '@tiptap/core';

export type CalloutVariant = 'info' | 'success' | 'warning' | 'danger';

const VARIANTS: readonly CalloutVariant[] = ['info', 'success', 'warning', 'danger'];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (variant?: CalloutVariant) => ReturnType;
      toggleCallout: (variant?: CalloutVariant) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

export interface CalloutAttrs {
  variant: CalloutVariant;
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info' as CalloutVariant,
        parseHTML: (el): CalloutVariant => {
          const v = el.getAttribute('data-variant');
          return VARIANTS.includes(v as CalloutVariant) ? (v as CalloutVariant) : 'info';
        },
        renderHTML: (attrs: { variant?: CalloutVariant }) => ({
          'data-variant': attrs.variant ?? 'info',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'aside',
      mergeAttributes(HTMLAttributes, {
        'data-callout': 'true',
        role: 'note',
        class: `sparx-callout sparx-callout--${(HTMLAttributes['data-variant'] as string) || 'info'}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (variant = 'info') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { variant }),
      toggleCallout:
        (variant = 'info') =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name)) return commands.lift(this.name);
          return commands.wrapIn(this.name, { variant });
        },
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});

export const CALLOUT_VARIANTS = VARIANTS;
