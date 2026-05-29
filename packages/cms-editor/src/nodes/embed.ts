// Embed — an iframe-ish block backed by an allowlist of providers. The doc
// stores `{ provider, url, html? }`. At render time the serializer either
// emits a sanitized provider-specific iframe (YouTube, Vimeo, Loom, Spotify)
// or skips silently — never trusting raw `html` from input.
//
// `html` is only populated when the dashboard editor preflights an
// oEmbed/iframely lookup and the response matches the allowlist. The
// serializer always re-validates the URL before emitting markup; the saved
// `html` is treated as a hint for client-side preview only.

import { Node, mergeAttributes } from '@tiptap/core';

export type EmbedProvider = 'youtube' | 'vimeo' | 'loom' | 'spotify' | 'twitter' | 'unknown';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      setEmbed: (attrs: { provider: EmbedProvider; url: string; html?: string }) => ReturnType;
      unsetEmbed: () => ReturnType;
    };
  }
}

export interface EmbedAttrs {
  provider: EmbedProvider;
  url: string;
  html: string | null;
}

const ALLOWED_PROVIDERS: ReadonlySet<EmbedProvider> = new Set([
  'youtube',
  'vimeo',
  'loom',
  'spotify',
  'twitter',
]);

export function detectProvider(url: string): EmbedProvider {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube';
    if (host.includes('vimeo.com')) return 'vimeo';
    if (host.includes('loom.com')) return 'loom';
    if (host.includes('spotify.com')) return 'spotify';
    if (host.includes('twitter.com') || host === 'x.com' || host.endsWith('.x.com'))
      return 'twitter';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function isAllowedEmbedProvider(p: EmbedProvider): boolean {
  return ALLOWED_PROVIDERS.has(p);
}

export const Embed = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      provider: {
        default: 'unknown' as EmbedProvider,
        parseHTML: (el): EmbedProvider =>
          (el.getAttribute('data-provider') as EmbedProvider) ?? 'unknown',
        renderHTML: (attrs) => ({ 'data-provider': attrs.provider }),
      },
      url: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-url') ?? '',
        renderHTML: (attrs) => ({ 'data-url': attrs.url }),
      },
      html: {
        default: null as string | null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-embed]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        'data-embed': 'true',
        class: 'sparx-embed',
      }),
      ['div', { class: 'sparx-embed__placeholder' }, 0],
    ];
  },

  addCommands() {
    return {
      setEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { provider: attrs.provider, url: attrs.url, html: attrs.html ?? null },
          }),
      unsetEmbed:
        () =>
        ({ commands }) =>
          commands.deleteSelection(),
    };
  },
});
