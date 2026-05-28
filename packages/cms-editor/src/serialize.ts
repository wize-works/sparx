// JSON → HTML serializer for the CMS doc shape.
//
// Hand-rolled to avoid pulling jsdom + tiptap's renderer into server bundles.
// Walks the node tree and emits sanitised HTML for our fixed extension set
// (see ./extensions.ts). Anything outside the allowed node/mark allowlist is
// dropped silently — better a missing element than an XSS surface.
//
// Used by:
//   - api-rest when a client requests `Accept: text/html` or `?format=html`
//   - apps/web (Phase 4) for SSR of blog/page entries
//
// The allowlist mirrors what `cmsEditorExtensions()` registers. Adding a
// node/mark requires landing both the extension and a renderer here.

const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

// A single node shape carries both text + element fields as optionals; the
// renderer dispatches on `type` and reads only the fields that apply.
// Splitting into a discriminated union would be more correct, but the
// runtime data is JSONB straight from Postgres and is never proven to fit a
// discriminated shape at the type level. Pragmatic loose shape wins here.
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
  // Reject javascript: / data: / vbscript: URLs outright. We allow relative
  // URLs (no protocol) and the explicit set above.
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

function renderNode(node: Node): string {
  if (node.type === 'text') {
    const text = typeof node.text === 'string' ? escapeHtml(node.text) : '';
    return applyMarks(text, node.marks);
  }

  const inner = (node.content ?? []).map(renderNode).join('');

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
      const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      return `<pre><code${cls}>${inner}</code></pre>`;
    }
    case 'horizontalRule':
      return '<hr />';
    case 'hardBreak':
      return '<br />';
    default:
      // Unknown block — drop silently.
      return '';
  }
}

export interface SerializeOptions {
  /** Wrap output in <article>…</article>. Defaults to false. */
  wrap?: boolean;
}

export function renderDocToHtml(doc: unknown, opts: SerializeOptions = {}): string {
  if (!isDocLike(doc)) return '';
  const inner = (doc.content ?? []).map(renderNode).join('');
  return opts.wrap ? `<article>${inner}</article>` : inner;
}

function isDocLike(value: unknown): value is DocNode {
  return typeof value === 'object' && value !== null && (value as { type?: string }).type === 'doc';
}
