// JSON → HTML serializer for the CMS doc shape.
//
// Hand-rolled to avoid pulling jsdom + tiptap's renderer into server bundles.
// Walks the node tree and emits sanitised HTML for our fixed extension set
// (see ./extensions.ts). Anything outside the allowed node/mark allowlist is
// dropped silently — better a missing element than an XSS surface.
//
// Used by:
//   - api-rest when a client requests `Accept: text/html` or `?format=html`
//   - apps/web for SSR of blog/page entries
//   - migration tooling that needs HTML snapshots for legacy storefronts
//
// The allowlist mirrors what `cmsEditorExtensions()` registers. Adding a
// node/mark requires landing both the extension and a renderer here.

import {
  detectProvider,
  isAllowedEmbedProvider,
  type EmbedAttrs,
  type CalloutVariant,
} from './nodes';

const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const ALLOWED_IMG_PROTOCOLS = new Set(['http:', 'https:', 'data:']);
const ALLOWED_LANGUAGES = new Set([
  'bash',
  'css',
  'diff',
  'go',
  'graphql',
  'html',
  'java',
  'javascript',
  'json',
  'jsx',
  'markdown',
  'php',
  'plaintext',
  'python',
  'ruby',
  'rust',
  'shell',
  'sql',
  'svelte',
  'swift',
  'tsx',
  'typescript',
  'vue',
  'xml',
  'yaml',
]);

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface Node {
  type: string;
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
  content?: Node[];
}

interface DocNode {
  type: 'doc';
  content?: Node[];
}

export interface SerializeOptions {
  /** Wrap output in <article>…</article>. Defaults to false. */
  wrap?: boolean;
  /**
   * Override how internal references resolve to URLs. Defaults to
   * `/${typeKey}/${entryId}` (just enough to be a working link in tests
   * and apps/web). The dashboard supplies a resolver that uses the
   * content type's `urlPattern` so the link points at the real page.
   */
  resolveReference?: (entryId: string, typeKey: string) => string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const url = new URL(raw, 'https://placeholder.invalid/');
    if (raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('?')) {
      return raw;
    }
    if (!ALLOWED_LINK_PROTOCOLS.has(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function safeImgSrc(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const url = new URL(raw, 'https://placeholder.invalid/');
    if (raw.startsWith('/')) return raw;
    if (!ALLOWED_IMG_PROTOCOLS.has(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function applyMarks(text: string, marks: Mark[] | undefined): string {
  if (!marks?.length) return text;
  let out = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        out = `<strong>${out}</strong>`;
        break;
      case 'italic':
        out = `<em>${out}</em>`;
        break;
      case 'strike':
        out = `<s>${out}</s>`;
        break;
      case 'code':
        out = `<code>${out}</code>`;
        break;
      case 'link': {
        const href = safeHref(mark.attrs?.href);
        if (!href) break;
        out = `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${out}</a>`;
        break;
      }
      default:
        // Unknown mark — drop silently.
        break;
    }
  }
  return out;
}

function clamp01(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// ─── embed → iframe ────────────────────────────────────────────────────────

interface EmbedRenderResult {
  src: string;
  title: string;
  allow: string;
}

function embedToIframe(provider: EmbedAttrs['provider'], url: string): EmbedRenderResult | null {
  if (!isAllowedEmbedProvider(provider)) return null;
  try {
    const parsed = new URL(url);
    switch (provider) {
      case 'youtube': {
        // Handle both youtube.com/watch?v=ID and youtu.be/ID.
        let id: string | null = null;
        if (parsed.hostname === 'youtu.be') {
          id = parsed.pathname.replace(/^\//, '');
        } else if (parsed.pathname === '/watch') {
          id = parsed.searchParams.get('v');
        } else if (parsed.pathname.startsWith('/embed/')) {
          id = parsed.pathname.replace('/embed/', '');
        }
        if (!id || !/^[a-zA-Z0-9_-]{6,15}$/.test(id)) return null;
        return {
          src: `https://www.youtube-nocookie.com/embed/${id}`,
          title: 'YouTube video',
          allow:
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
        };
      }
      case 'vimeo': {
        const id = parsed.pathname.replace(/^\//, '').split('/')[0];
        if (!id || !/^[0-9]+$/.test(id)) return null;
        return {
          src: `https://player.vimeo.com/video/${id}`,
          title: 'Vimeo video',
          allow: 'autoplay; fullscreen; picture-in-picture',
        };
      }
      case 'loom': {
        const id = parsed.pathname.split('/').pop() ?? '';
        if (!id || !/^[a-f0-9]{20,40}$/.test(id)) return null;
        return {
          src: `https://www.loom.com/embed/${id}`,
          title: 'Loom video',
          allow: 'autoplay; fullscreen',
        };
      }
      case 'spotify': {
        // open.spotify.com/{type}/{id} → embed.spotify.com/embed/{type}/{id}
        if (!/^\/(track|album|playlist|episode|show)\//.test(parsed.pathname)) return null;
        return {
          src: `https://open.spotify.com/embed${parsed.pathname}`,
          title: 'Spotify',
          allow: 'encrypted-media',
        };
      }
      case 'twitter': {
        // No first-party embed without script — fall back to a sanitized
        // link block. The serializer dropping it gracefully is the right call.
        return null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ─── node renderers ────────────────────────────────────────────────────────

function renderNode(node: Node, ctx: SerializeContext): string {
  if (node.type === 'text') {
    const text = typeof node.text === 'string' ? escapeHtml(node.text) : '';
    return applyMarks(text, node.marks);
  }

  const inner = (node.content ?? []).map((c) => renderNode(c, ctx)).join('');

  switch (node.type) {
    case 'paragraph':
      return `<p>${inner}</p>`;
    case 'heading': {
      const level = Number(node.attrs?.level);
      const safeLevel = level >= 1 && level <= 6 ? level : 2;
      return `<h${safeLevel}>${inner}</h${safeLevel}>`;
    }
    case 'bulletList':
      return `<ul>${inner}</ul>`;
    case 'orderedList':
      return `<ol>${inner}</ol>`;
    case 'listItem':
      return `<li>${inner}</li>`;
    case 'blockquote':
      return `<blockquote>${inner}</blockquote>`;
    case 'codeBlock': {
      const rawLang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      const lang = ALLOWED_LANGUAGES.has(rawLang) ? rawLang : '';
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      return `<pre><code${cls}>${inner}</code></pre>`;
    }
    case 'horizontalRule':
      return '<hr />';
    case 'hardBreak':
      return '<br />';

    // ─── tables ────────────────────────────────────────────────────────
    case 'table':
      return `<div class="sparx-table-wrap"><table class="sparx-table">${inner}</table></div>`;
    case 'tableRow':
      return `<tr>${inner}</tr>`;
    case 'tableHeader': {
      const colspan = Number(node.attrs?.colspan);
      const rowspan = Number(node.attrs?.rowspan);
      const cs = colspan && colspan > 1 ? ` colspan="${colspan}"` : '';
      const rs = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : '';
      return `<th${cs}${rs}>${inner}</th>`;
    }
    case 'tableCell': {
      const colspan = Number(node.attrs?.colspan);
      const rowspan = Number(node.attrs?.rowspan);
      const cs = colspan && colspan > 1 ? ` colspan="${colspan}"` : '';
      const rs = rowspan && rowspan > 1 ? ` rowspan="${rowspan}"` : '';
      return `<td${cs}${rs}>${inner}</td>`;
    }

    // ─── callout ───────────────────────────────────────────────────────
    case 'callout': {
      const variant = node.attrs?.variant as CalloutVariant | undefined;
      const safe =
        variant && ['info', 'success', 'warning', 'danger'].includes(variant) ? variant : 'info';
      return `<aside role="note" class="sparx-callout sparx-callout--${safe}" data-variant="${safe}">${inner}</aside>`;
    }

    // ─── embed ─────────────────────────────────────────────────────────
    case 'embed': {
      const provider =
        (node.attrs?.provider as EmbedAttrs['provider']) ??
        detectProvider((node.attrs?.url as string | undefined) ?? '');
      const url = typeof node.attrs?.url === 'string' ? node.attrs.url : '';
      if (!url) return '';
      // Unknown providers are dropped outright — we never emit a link to
      // an arbitrary URL stored in a content body, only to vetted ones.
      if (!isAllowedEmbedProvider(provider)) return '';
      const rendered = embedToIframe(provider, url);
      if (!rendered) {
        // Allowed provider but URL didn't parse to a known embed shape
        // (e.g. Twitter, which we don't iframe). Emit a plain anchor.
        const href = safeHref(url);
        if (!href) return '';
        return `<p class="sparx-embed-fallback"><a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(href)}</a></p>`;
      }
      return (
        `<figure class="sparx-embed sparx-embed--${provider}">` +
        `<iframe src="${escapeHtml(rendered.src)}" title="${escapeHtml(rendered.title)}" ` +
        `loading="lazy" referrerpolicy="strict-origin-when-cross-origin" ` +
        `allow="${escapeHtml(rendered.allow)}" allowfullscreen frameborder="0"></iframe>` +
        `</figure>`
      );
    }

    // ─── image ─────────────────────────────────────────────────────────
    case 'sparxImage':
    case 'image': {
      const src = safeImgSrc(node.attrs?.src);
      if (!src) return '';
      const alt = typeof node.attrs?.alt === 'string' ? escapeHtml(node.attrs.alt as string) : '';
      const caption =
        typeof node.attrs?.caption === 'string' ? escapeHtml(node.attrs.caption as string) : '';
      const focalX = clamp01(node.attrs?.focalPointX ?? 0.5);
      const focalY = clamp01(node.attrs?.focalPointY ?? 0.5);
      const assetId =
        typeof node.attrs?.assetId === 'string'
          ? ` data-asset-id="${escapeHtml(node.attrs.assetId as string)}"`
          : '';
      const figureClass = 'sparx-image';
      const imgEl =
        `<img src="${escapeHtml(src)}" alt="${alt}" loading="lazy"` +
        ` style="object-position:${(focalX * 100).toFixed(1)}% ${(focalY * 100).toFixed(1)}%"` +
        `${assetId} />`;
      return caption
        ? `<figure class="${figureClass}">${imgEl}<figcaption>${caption}</figcaption></figure>`
        : `<figure class="${figureClass}">${imgEl}</figure>`;
    }

    // ─── inline reference ──────────────────────────────────────────────
    case 'sparxReference': {
      const entryId = typeof node.attrs?.entryId === 'string' ? node.attrs.entryId : '';
      const typeKey = typeof node.attrs?.typeKey === 'string' ? node.attrs.typeKey : '';
      const label = typeof node.attrs?.label === 'string' ? node.attrs.label : '';
      if (!entryId || !typeKey) return escapeHtml(label);
      const href = ctx.resolveReference(entryId, typeKey);
      const safe = safeHref(href);
      const text = `@${escapeHtml(label)}`;
      if (!safe) return text;
      return `<a href="${escapeHtml(safe)}" data-sparx-reference="true" data-ref-entry="${escapeHtml(entryId)}" data-ref-type="${escapeHtml(typeKey)}">${text}</a>`;
    }

    default:
      // Unknown block — drop silently. We do NOT pass through inner HTML
      // for unknown wrappers because that would allow an attacker who can
      // write to body JSONB to smuggle arbitrary structure.
      return '';
  }
}

interface SerializeContext {
  resolveReference: (entryId: string, typeKey: string) => string;
}

export function renderDocToHtml(doc: unknown, opts: SerializeOptions = {}): string {
  if (!isDocLike(doc)) return '';
  const ctx: SerializeContext = {
    resolveReference: opts.resolveReference ?? ((id, type) => `/${type}/${id}`),
  };
  const inner = (doc.content ?? []).map((n) => renderNode(n, ctx)).join('');
  return opts.wrap ? `<article>${inner}</article>` : inner;
}

function isDocLike(value: unknown): value is DocNode {
  return typeof value === 'object' && value !== null && (value as { type?: string }).type === 'doc';
}

export { ALLOWED_LANGUAGES as ALLOWED_CODE_LANGUAGES };
