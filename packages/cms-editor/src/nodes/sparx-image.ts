// Image with focal-point + alt-text attributes.
//
// Extends @tiptap/extension-image so we keep its parse/render plumbing but
// add three attrs the storefront cropper needs:
//
//   focalPointX, focalPointY  — 0..1 normalized; defaults 0.5/0.5
//   caption                   — optional figcaption text
//
// `alt` is already on the base Image; we surface it as required (the editor
// UI nags if empty). MediaAsset id is stored as `data-asset-id` so server-
// side renders can resolve the latest variant URL even when CDN paths change.

import Image from '@tiptap/extension-image';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sparxImage: {
      setSparxImage: (attrs: {
        src: string;
        alt?: string;
        caption?: string;
        assetId?: string;
        focalPointX?: number;
        focalPointY?: number;
      }) => ReturnType;
    };
  }
}

export interface SparxImageAttrs {
  src: string;
  alt: string | null;
  caption: string | null;
  assetId: string | null;
  focalPointX: number;
  focalPointY: number;
}

function clamp01(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export const SparxImage = Image.extend({
  name: 'sparxImage',
  draggable: true,
  selectable: true,
  inline: false,
  group: 'block',

  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-caption'),
        renderHTML: (attrs) => (attrs.caption ? { 'data-caption': attrs.caption as string } : {}),
      },
      assetId: {
        default: null as string | null,
        parseHTML: (el) => el.getAttribute('data-asset-id'),
        renderHTML: (attrs) => (attrs.assetId ? { 'data-asset-id': attrs.assetId as string } : {}),
      },
      focalPointX: {
        default: 0.5,
        parseHTML: (el) => clamp01(el.getAttribute('data-focal-x')),
        renderHTML: (attrs) => ({ 'data-focal-x': String(clamp01(attrs.focalPointX)) }),
      },
      focalPointY: {
        default: 0.5,
        parseHTML: (el) => clamp01(el.getAttribute('data-focal-y')),
        renderHTML: (attrs) => ({ 'data-focal-y': String(clamp01(attrs.focalPointY)) }),
      },
    };
  },

  addCommands() {
    return {
      ...(this.parent?.() ?? {}),
      setSparxImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              src: attrs.src,
              alt: attrs.alt ?? null,
              caption: attrs.caption ?? null,
              assetId: attrs.assetId ?? null,
              focalPointX: clamp01(attrs.focalPointX ?? 0.5),
              focalPointY: clamp01(attrs.focalPointY ?? 0.5),
            },
          }),
    };
  },
});
