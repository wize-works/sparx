// Raw HTML elements (docs/98 Pillar 1) — the universal element primitive.
//
// A raw element is an ordinary BuilderNode whose `type` encodes the HTML tag it
// renders: `el:div`, `el:section`, `el:img`, `el:svg`, … Encoding the tag IN the
// type (rather than a prop) means every existing type-string mechanism keeps
// working unchanged — `getDef`, `isContainer`, `acceptsChildren`, `leafWearsClass`,
// and both host walkers parse the `el:` prefix and behave correctly; switching a
// raw element's tag reuses the existing same-kind retype flow.
//
// This module is the SINGLE source of truth for the safe tag + attribute
// whitelists — the security boundary for raw HTML. It is React-free (Zod-only,
// like the rest of @wizeworks/builder-schemas), so the editor, the service, and BOTH
// renderers import the same allow-lists; the JSX `createElement` lives in the
// render layer, never the policy.
//
// Security posture (docs/98 §4.1): only whitelisted tags render; `script style
// object embed link meta base noscript template iframe` never do. Attributes are
// whitelisted per tag, `on*` handlers are dropped, raw `style` is never accepted
// here (background/position are sanctioned emitters, Pillar 4), and `target=_blank`
// forces `rel="noopener noreferrer"`.

export const RAW_PREFIX = 'el:';

export type RawElementGroup =
  'structure' | 'text' | 'list' | 'media' | 'table' | 'form' | 'interactive';

/** A raw element's role in the editor: a `container` arranges children (gets the
 *  Layout panel); a `leaf` renders content and may still nest inline children
 *  (`text` tags, like Button does); a `void` leaf takes no children at all. */
export type RawElementKind = 'container' | 'leaf';

export interface RawElementMeta {
  group: RawElementGroup;
  kind: RawElementKind;
  /** No children at all (img, input, br, hr, …) — rendered self-closing. */
  void?: boolean;
  /** Exposes a `text` prop (inline text when it has no element children). */
  text?: boolean;
  /** A leaf that may still nest children (every text/inline tag + media wrappers). */
  acceptsChildren?: boolean;
  /** Direct children are constrained (ul→li, table→tr, svg shapes): the canvas
   *  must NOT inject its inline selection chrome as a direct child here. */
  restrictedChildren?: boolean;
  /** Human label (palette + layers + inspector tag picker). */
  label: string;
  /** Tag-specific attribute prop-keys this element exposes, on top of GLOBAL_ATTRS. */
  attrs?: AttrKey[];
  /** Shown as a tile in the Add palette (the curated common set). Every other tag
   *  is still reachable via the inspector's same-kind tag picker (retype). */
  featured?: boolean;
}

// ── Attribute model ───────────────────────────────────────────────────────────
//
// Raw-element attributes are stored as FLAT props (props.href, props.src, …) so
// the inspector's existing prop controls author them with no new machinery. Each
// allowed prop-key maps to a React attribute name; everything else is dropped.

export type AttrKey =
  | 'id'
  | 'title'
  | 'role'
  | 'ariaLabel'
  | 'hidden'
  | 'href'
  | 'target'
  | 'rel'
  | 'src'
  | 'srcset'
  | 'alt'
  | 'width'
  | 'height'
  | 'loading'
  | 'type'
  | 'name'
  | 'value'
  | 'placeholder'
  | 'for'
  | 'checked'
  | 'disabled'
  | 'required'
  | 'controls'
  | 'autoplay'
  | 'loop'
  | 'muted'
  | 'poster'
  | 'datetime'
  | 'colspan'
  | 'rowspan'
  | 'scope'
  | 'open'
  // SVG
  | 'viewBox'
  | 'xmlns'
  | 'fill'
  | 'stroke'
  | 'strokeWidth'
  | 'strokeLinecap'
  | 'strokeLinejoin'
  | 'd'
  | 'cx'
  | 'cy'
  | 'r'
  | 'rx'
  | 'ry'
  | 'x'
  | 'y'
  | 'x1'
  | 'y1'
  | 'x2'
  | 'y2'
  | 'points'
  | 'transform'
  | 'opacity'
  | 'offset'
  | 'stopColor'
  | 'gradientUnits'
  | 'preserveAspectRatio';

/** Prop-key → React attribute name. Boolean attributes are listed in BOOL_ATTRS. */
const ATTR_NAME: Record<AttrKey, string> = {
  id: 'id',
  title: 'title',
  role: 'role',
  ariaLabel: 'aria-label',
  hidden: 'hidden',
  href: 'href',
  target: 'target',
  rel: 'rel',
  src: 'src',
  srcset: 'srcSet',
  alt: 'alt',
  width: 'width',
  height: 'height',
  loading: 'loading',
  type: 'type',
  name: 'name',
  value: 'value',
  placeholder: 'placeholder',
  for: 'htmlFor',
  checked: 'defaultChecked',
  disabled: 'disabled',
  required: 'required',
  controls: 'controls',
  autoplay: 'autoPlay',
  loop: 'loop',
  muted: 'muted',
  poster: 'poster',
  datetime: 'dateTime',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  scope: 'scope',
  open: 'open',
  viewBox: 'viewBox',
  xmlns: 'xmlns',
  fill: 'fill',
  stroke: 'stroke',
  strokeWidth: 'strokeWidth',
  strokeLinecap: 'strokeLinecap',
  strokeLinejoin: 'strokeLinejoin',
  d: 'd',
  cx: 'cx',
  cy: 'cy',
  r: 'r',
  rx: 'rx',
  ry: 'ry',
  x: 'x',
  y: 'y',
  x1: 'x1',
  y1: 'y1',
  x2: 'x2',
  y2: 'y2',
  points: 'points',
  transform: 'transform',
  opacity: 'opacity',
  offset: 'offset',
  stopColor: 'stopColor',
  gradientUnits: 'gradientUnits',
  preserveAspectRatio: 'preserveAspectRatio',
};

// Tags whose `value` must be authored as React's uncontrolled `defaultValue`.
const CONTROLLED_VALUE_TAGS = new Set<string>(['input', 'textarea', 'select']);

const BOOL_ATTRS = new Set<AttrKey>([
  'checked',
  'disabled',
  'required',
  'controls',
  'autoplay',
  'loop',
  'muted',
  'open',
  'hidden',
]);

/** Attribute keys allowed on EVERY raw element (identity + a11y + visibility).
 *  `hidden` lets a node ship closed in the SSR markup — the behavior runtime
 *  (Pillar 5) toggles it, so JS-revealed panels (menu/tabs/accordion) don't flash
 *  open before hydration; it doubles as a plain "hide element" control. */
export const GLOBAL_ATTRS: AttrKey[] = ['id', 'title', 'role', 'ariaLabel', 'hidden'];

// `href` is allowed but values are scheme-checked so a tenant can't author a
// `javascript:` / `data:` URL. (Relative + http(s) + mailto/tel + anchors only.)
const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/|#|\.\/|\.\.\/|[\w./?#=&%+-]*$)/i;

// ── The tag universe ──────────────────────────────────────────────────────────
//
// Data-as-code catalog (line-limit exempt). Derived defaults keep it terse: a tag
// listed in a group set gets that group + sensible kind/flags; per-tag detail
// (label, attrs, featured, void) is layered on top.

const STRUCTURE = [
  'div',
  'section',
  'nav',
  'header',
  'footer',
  'main',
  'aside',
  'article',
  'figure',
  'figcaption',
] as const;

const TEXT = [
  'p',
  'span',
  'a',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'small',
  'mark',
  'code',
  'pre',
  'blockquote',
  'address',
  'time',
  'abbr',
  'cite',
  'q',
  'sub',
  'sup',
  'label',
] as const;

const LIST = ['ul', 'ol', 'li', 'dl', 'dt', 'dd'] as const;
const MEDIA = ['img', 'picture', 'source', 'video', 'audio', 'svg'] as const;
const SVG_CHILD = [
  'path',
  'g',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'use',
  'symbol',
  'text',
  'tspan',
  'title',
] as const;
const TABLE = [
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'colgroup',
  'col',
] as const;
const FORM = [
  'form',
  'fieldset',
  'legend',
  'input',
  'textarea',
  'select',
  'option',
  'optgroup',
  'button',
  'datalist',
  'output',
  'progress',
  'meter',
] as const;
const INTERACTIVE = ['details', 'summary'] as const;
const VOID = ['br', 'hr', 'img', 'input', 'source', 'col', 'wbr'] as const;

export type RawTag =
  | (typeof STRUCTURE)[number]
  | (typeof TEXT)[number]
  | (typeof LIST)[number]
  | (typeof MEDIA)[number]
  | (typeof SVG_CHILD)[number]
  | (typeof TABLE)[number]
  | (typeof FORM)[number]
  | (typeof INTERACTIVE)[number]
  | (typeof VOID)[number];

const VOID_SET = new Set<string>(VOID);
const RESTRICTED = new Set<string>([
  'ul',
  'ol',
  'dl',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'colgroup',
  'select',
  'optgroup',
  'picture',
  'svg',
  'g',
  'defs',
  'linearGradient',
  'radialGradient',
]);

function groupOf(tag: string): RawElementGroup {
  if ((STRUCTURE as readonly string[]).includes(tag)) return 'structure';
  if ((TEXT as readonly string[]).includes(tag)) return 'text';
  if ((LIST as readonly string[]).includes(tag)) return 'list';
  if ((MEDIA as readonly string[]).includes(tag) || (SVG_CHILD as readonly string[]).includes(tag))
    return 'media';
  if ((TABLE as readonly string[]).includes(tag)) return 'table';
  if ((FORM as readonly string[]).includes(tag)) return 'form';
  return 'interactive';
}

// Container tags (get the Layout panel + nest children as a flow region). Text and
// most media/form leaves still nest children but aren't layout containers.
const CONTAINER_TAGS = new Set<string>([
  ...STRUCTURE,
  'ul',
  'ol',
  'dl',
  'svg',
  'g',
  'defs',
  'linearGradient',
  'radialGradient',
  'picture',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'colgroup',
  'form',
  'fieldset',
  'optgroup',
  'datalist',
  'details',
]);

// Tags that carry inline text via props.text when they have no element children.
const TEXT_TAGS = new Set<string>([
  ...TEXT,
  'li',
  'dt',
  'dd',
  'th',
  'td',
  'caption',
  'legend',
  'option',
  'button',
  'output',
  'summary',
  'text',
  'tspan',
  'title',
]);

// Per-tag attribute additions (beyond GLOBAL_ATTRS).
const TAG_ATTRS: Partial<Record<string, AttrKey[]>> = {
  a: ['href', 'target', 'rel'],
  img: ['src', 'srcset', 'alt', 'width', 'height', 'loading'],
  source: ['src', 'srcset', 'type'],
  video: ['src', 'poster', 'width', 'height', 'controls', 'autoplay', 'loop', 'muted'],
  audio: ['src', 'controls', 'autoplay', 'loop', 'muted'],
  input: ['type', 'name', 'placeholder', 'value', 'checked', 'disabled', 'required'],
  textarea: ['name', 'placeholder', 'value', 'disabled', 'required'],
  select: ['name', 'disabled', 'required'],
  option: ['value'],
  button: ['type', 'name', 'value', 'disabled'],
  output: ['for', 'name'],
  progress: ['value'],
  meter: ['value'],
  label: ['for'],
  form: ['name'],
  time: ['datetime'],
  th: ['colspan', 'rowspan', 'scope'],
  td: ['colspan', 'rowspan'],
  col: ['width'],
  details: ['open'],
  svg: [
    'viewBox',
    'xmlns',
    'fill',
    'stroke',
    'strokeWidth',
    'width',
    'height',
    'preserveAspectRatio',
  ],
  path: [
    'd',
    'fill',
    'stroke',
    'strokeWidth',
    'strokeLinecap',
    'strokeLinejoin',
    'transform',
    'opacity',
  ],
  g: ['fill', 'stroke', 'strokeWidth', 'transform', 'opacity'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth', 'opacity'],
  circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'strokeWidth', 'opacity'],
  ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth', 'opacity'],
  line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'strokeLinecap'],
  polyline: ['points', 'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin'],
  polygon: ['points', 'fill', 'stroke', 'strokeWidth'],
  linearGradient: ['x1', 'y1', 'x2', 'y2', 'gradientUnits'],
  radialGradient: ['cx', 'cy', 'r', 'gradientUnits'],
  stop: ['offset', 'stopColor'],
  use: ['href', 'x', 'y'],
  symbol: ['viewBox'],
  text: ['x', 'y', 'fill', 'transform'],
  tspan: ['x', 'y'],
};

// The curated set shown as Add-palette tiles (every other tag reachable via the
// inspector's same-kind tag picker).
const FEATURED = new Set<string>([
  'div',
  'section',
  'nav',
  'header',
  'footer',
  'main',
  'article',
  'aside',
  'figure',
  'p',
  'span',
  'a',
  'h1',
  'h2',
  'h3',
  'blockquote',
  'ul',
  'li',
  'img',
  'svg',
  'table',
  'tr',
  'td',
  'form',
  'input',
  'button',
  'label',
  'details',
  'summary',
]);

const LABELS: Partial<Record<string, string>> = {
  div: 'Div',
  a: 'Link',
  ul: 'List',
  ol: 'Ordered list',
  li: 'List item',
  img: 'Image',
  svg: 'SVG',
  p: 'Paragraph',
  td: 'Cell',
  th: 'Header cell',
  tr: 'Row',
};

const ALL_TAGS: string[] = [
  ...STRUCTURE,
  ...TEXT,
  ...LIST,
  ...MEDIA,
  ...SVG_CHILD,
  ...TABLE,
  ...FORM,
  ...INTERACTIVE,
  // VOID overlaps MEDIA (img/source) — de-duped by the Map below.
  ...VOID,
];

function metaFor(tag: string): RawElementMeta {
  const isVoid = VOID_SET.has(tag);
  const container = CONTAINER_TAGS.has(tag);
  const text = TEXT_TAGS.has(tag);
  return {
    group: groupOf(tag),
    kind: container ? 'container' : 'leaf',
    void: isVoid || undefined,
    text: text || undefined,
    acceptsChildren: !isVoid || undefined,
    restrictedChildren: RESTRICTED.has(tag) || undefined,
    label: LABELS[tag] ?? tag,
    attrs: TAG_ATTRS[tag],
    featured: FEATURED.has(tag) || undefined,
  };
}

/** The full raw-element catalog: tag → metadata. The single allow-list both
 *  renderers + the editor consult. */
export const RAW_ELEMENTS: ReadonlyMap<string, RawElementMeta> = new Map(
  Array.from(new Set(ALL_TAGS)).map((tag) => [tag, metaFor(tag)])
);

// ── Type-string helpers (the tag is encoded in `node.type`) ───────────────────

/** Is this a raw-element node type (`el:<tag>`)? */
export function isRawElementType(type: string): boolean {
  return type.startsWith(RAW_PREFIX) && RAW_ELEMENTS.has(type.slice(RAW_PREFIX.length));
}

/** The HTML tag a raw-element type renders, or null for a non-raw type. */
export function rawTagOf(type: string): string | null {
  if (!type.startsWith(RAW_PREFIX)) return null;
  const tag = type.slice(RAW_PREFIX.length);
  return RAW_ELEMENTS.has(tag) ? tag : null;
}

/** The node type for a raw tag (`div` → `el:div`). */
export function rawElementType(tag: string): string {
  return `${RAW_PREFIX}${tag}`;
}

export function rawMetaOf(type: string): RawElementMeta | null {
  const tag = rawTagOf(type);
  return tag ? (RAW_ELEMENTS.get(tag) ?? null) : null;
}

/** A raw container element (arranges children) vs a leaf/void one. */
export function isRawContainerType(type: string): boolean {
  return rawMetaOf(type)?.kind === 'container';
}

/** A raw void element (img/hr/input/…) — renders self-closing, never nests. */
export function isRawVoidType(type: string): boolean {
  return rawMetaOf(type)?.void === true;
}

/** Can the canvas inject its inline selection chrome as a direct child of this raw
 *  tag? False for restricted parents (ul/table/svg/…) + void tags, where a stray
 *  `<span>` would be invalid markup. */
export function rawTagAcceptsInlineChrome(type: string): boolean {
  const meta = rawMetaOf(type);
  if (!meta) return false;
  return !meta.void && !meta.restrictedChildren;
}

// ── Attribute sanitization (the render-time security gate) ────────────────────

/** The sanitized, React-ready attribute object for a raw element, read from its
 *  flat props against the tag's allow-list. Drops everything not whitelisted,
 *  scheme-checks URLs, coerces booleans, and forces `rel="noopener noreferrer"`
 *  on `target="_blank"`. Returns a plain object spread onto the created element. */
export function safeElementAttrs(node: {
  type: string;
  props: Record<string, unknown>;
}): Record<string, string | number | boolean> {
  const meta = rawMetaOf(node.type);
  if (!meta) return {};
  const allowed = new Set<AttrKey>([...GLOBAL_ATTRS, ...(meta.attrs ?? [])]);
  const out: Record<string, string | number | boolean> = {};
  for (const key of allowed) {
    const raw = node.props[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const attr = ATTR_NAME[key];
    if (BOOL_ATTRS.has(key)) {
      if (raw === true || raw === 'true' || raw === key) out[attr] = true;
      continue;
    }
    // Only primitive string/number attribute values are accepted; an object/array
    // is dropped (never coerced to "[object Object]").
    if (typeof raw !== 'string' && typeof raw !== 'number') continue;
    const v = raw;
    if ((key === 'href' || key === 'src') && typeof v === 'string' && !SAFE_URL.test(v)) continue;
    // A bare `value` on a form input would make it a controlled field (React warns
    // without onChange); these are presentational here, so author it as the
    // uncontrolled default instead.
    if (key === 'value' && CONTROLLED_VALUE_TAGS.has(node.type.slice(RAW_PREFIX.length))) {
      out.defaultValue = v;
      continue;
    }
    out[attr] = v;
  }
  // Anchor safety: a new-tab link must not leak the opener.
  if (out.target === '_blank') out.rel = 'noopener noreferrer';
  return out;
}

/** The inline text a raw text element renders when it has no element children. */
export function rawElementText(node: { type: string; props: Record<string, unknown> }): string {
  const meta = rawMetaOf(node.type);
  if (!meta?.text) return '';
  const t = node.props.text;
  return typeof t === 'string' ? t : '';
}

// ── HTML-import support (docs/98 §4.2) ────────────────────────────────────────
//
// One-way HTML import (parse a Tailwind fragment → Element nodes) lives in
// `html-import.ts`. It walks raw HTML, so it needs the INVERSE of the render-time
// map: an HTML attribute NAME (lowercase, as the DOM reports it) → the flat
// prop-key a node stores. Deriving this from `ATTR_NAME` keeps ONE source of
// truth — the whitelist here governs both render-out and parse-in.

/** Lowercased React/HTML attribute name → the flat prop-key for that attribute.
 *  The inverse of {@link ATTR_NAME}, lowercased so it matches how the DOM reports
 *  attribute names (`aria-label`, `viewbox`, `htmlfor`, …). Also accepts the
 *  native HTML spelling where it differs from React's (`for`). Used by the
 *  importer to map a parsed element's attributes back onto prop-keys before
 *  {@link safeElementAttrs} re-sanitizes them at render time. */
const HTML_ATTR_TO_KEY: Record<string, AttrKey> = (() => {
  const map: Record<string, AttrKey> = {};
  for (const [key, reactName] of Object.entries(ATTR_NAME) as [AttrKey, string][]) {
    map[reactName.toLowerCase()] = key;
  }
  // Native HTML spelling that differs from the React attribute name.
  map.for = 'for';
  return map;
})();

/** The prop-key an HTML attribute name maps to (`aria-label` → `ariaLabel`,
 *  `for` → `for`, `viewbox` → `viewBox`), or null if it is not a recognized
 *  attribute key at all. Case-insensitive on the incoming name. */
export function htmlAttrToPropKey(name: string): AttrKey | null {
  return HTML_ATTR_TO_KEY[name.toLowerCase()] ?? null;
}

/** The full set of prop-keys allowed on a raw element of `type` (the global
 *  identity/a11y keys plus the tag's specifics) — the allow-list the importer
 *  filters parsed attributes against. Empty for a non-raw type. */
export function allowedAttrKeysFor(type: string): Set<AttrKey> {
  const meta = rawMetaOf(type);
  if (!meta) return new Set();
  return new Set<AttrKey>([...GLOBAL_ATTRS, ...(meta.attrs ?? [])]);
}

/** Whether a raw-element type carries inline text via `props.text` (vs. only
 *  nesting element children). True for text/inline tags; false for pure
 *  containers + void tags. The importer uses this to decide whether a parsed
 *  element's text content becomes a `text` prop. */
export function rawTagCarriesText(type: string): boolean {
  return rawMetaOf(type)?.text === true;
}
