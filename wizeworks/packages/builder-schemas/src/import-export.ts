// Portable import/export documents for the Builder (docs/47). A page or site
// layout serializes to a small, versioned, self-describing JSON document that
// round-trips through the editor's Export/Import, the REST endpoints, and the
// MCP server. The same `validate` powers all three transports.
//
// Design for AGENTS as a first-class author: import accepts either a full
// document OR a bare node tree, auto-fills missing ids, and guarantees id
// uniqueness — so a model can emit a tree without bookkeeping and still get a
// valid, importable page. Structure is validated strictly against
// BuilderNodeSchema; unknown node `type`s are allowed (forward-compat — the
// renderer simply skips a leaf it doesn't know).

import { z } from 'zod';
import { BuilderNodeSchema, type BuilderNode } from './node';
import { BuilderPageKind, PageSeoShape, PageSlugInput } from './page';

/** The document format tag. Bump the version when the envelope shape changes
 *  (the node tree itself is versioned by the schema, not here). */
export const BUILDER_DOC_FORMAT = 'sparx.builder/v1';

// ── Document envelopes ───────────────────────────────────────────────────────

export const BuilderPageDocumentSchema = z.object({
  format: z.literal(BUILDER_DOC_FORMAT),
  type: z.literal('page'),
  name: z.string().min(1).max(255),
  kind: BuilderPageKind.default('singleton'),
  slug: PageSlugInput,
  recordType: z.string().max(63).nullish(),
  // Optional SEO the envelope carries inline (title/description/canonical/og/
  // noindex) so an MCP or Import author sets page meta without a second call.
  ...PageSeoShape,
  tree: BuilderNodeSchema,
});
export type BuilderPageDocument = z.infer<typeof BuilderPageDocumentSchema>;

export const BuilderLayoutDocumentSchema = z.object({
  format: z.literal(BUILDER_DOC_FORMAT),
  type: z.literal('layout'),
  name: z.string().min(1).max(255),
  tree: BuilderNodeSchema,
});
export type BuilderLayoutDocument = z.infer<typeof BuilderLayoutDocumentSchema>;

export const BuilderEmailDocumentSchema = z.object({
  format: z.literal(BUILDER_DOC_FORMAT),
  type: z.literal('email'),
  name: z.string().min(1).max(255),
  subject: z.string().max(255).optional(),
  preheader: z.string().max(255).nullish(),
  tree: BuilderNodeSchema,
});
export type BuilderEmailDocument = z.infer<typeof BuilderEmailDocumentSchema>;

// ── Export builders ──────────────────────────────────────────────────────────

export function toPageDocument(input: {
  name: string;
  kind: z.infer<typeof BuilderPageKind>;
  slug?: string | null;
  recordType?: string | null;
  tree: BuilderNode;
}): BuilderPageDocument {
  return {
    format: BUILDER_DOC_FORMAT,
    type: 'page',
    name: input.name,
    kind: input.kind,
    slug: input.slug ?? null,
    recordType: input.recordType ?? null,
    tree: input.tree,
  };
}

export function toLayoutDocument(input: {
  name: string;
  tree: BuilderNode;
}): BuilderLayoutDocument {
  return { format: BUILDER_DOC_FORMAT, type: 'layout', name: input.name, tree: input.tree };
}

export function toEmailDocument(input: {
  name: string;
  subject?: string;
  preheader?: string | null;
  tree: BuilderNode;
}): BuilderEmailDocument {
  return {
    format: BUILDER_DOC_FORMAT,
    type: 'email',
    name: input.name,
    subject: input.subject ?? '',
    preheader: input.preheader ?? null,
    tree: input.tree,
  };
}

// ── Id hygiene (import robustness) ───────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Make a RAW (pre-validation) node tree forgiving for hand/agent-authored JSON:
 *  fill a missing/blank `id` and default `props` to `{}`, so a terse author can
 *  emit just `{ type, class?, children? }`. Operates structurally on unknown
 *  input; a non-node value passes through for zod to reject precisely. Invalid
 *  field VALUES are preserved (not silently fixed) so zod still flags them with a
 *  clear message. */
function normalizeRaw(raw: unknown, counter: { n: number }): unknown {
  if (!isPlainObject(raw)) return raw;
  const node = raw;
  if (typeof node.type !== 'string') return raw;
  const out: Record<string, unknown> = { ...node };

  if (typeof out.id !== 'string' || out.id.trim() === '') {
    counter.n += 1;
    out.id = `${node.type.toLowerCase()}-${counter.n}`;
  }
  if (!isPlainObject(node.props)) out.props = {};
  if (Array.isArray(node.children)) {
    out.children = node.children.map((c) => normalizeRaw(c, counter));
  }
  return out;
}

/** Re-id any DUPLICATE ids (keeping the first occurrence) so the tree is safe
 *  for React keys + editor selection. Returns a new tree. */
export function ensureUniqueIds(tree: BuilderNode): BuilderNode {
  const seen = new Set<string>();
  let counter = 0;
  const fresh = (type: string): string => {
    let id: string;
    do {
      counter += 1;
      id = `${type.toLowerCase()}-${counter}`;
    } while (seen.has(id));
    return id;
  };
  const visit = (node: BuilderNode): BuilderNode => {
    const id = node.id && !seen.has(node.id) ? node.id : fresh(node.type);
    seen.add(id);
    const children = node.children?.map(visit);
    return children ? { ...node, id, children } : { ...node, id };
  };
  return visit(tree);
}

// ── Parse / validate ─────────────────────────────────────────────────────────

export type ImportParse<TMeta> =
  { ok: true; tree: BuilderNode; meta: TMeta } | { ok: false; error: string };

export interface PageImportMeta {
  name?: string;
  kind?: z.infer<typeof BuilderPageKind>;
  slug?: string | null;
  recordType?: string | null;
  // SEO carried on the envelope. `undefined` means "not present" (a caller MUST
  // leave the stored value untouched on update); `null`/'' means "clear it".
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonical?: string | null;
  ogImage?: string | null;
  noindex?: boolean;
}
export interface LayoutImportMeta {
  name?: string;
}
export interface EmailImportMeta {
  name?: string;
  subject?: string;
  preheader?: string | null;
}

function coerce(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return Symbol.for('sparx.builder.badjson');
  }
}

function friendly(err: z.ZodError): string {
  const first = err.issues.slice(0, 3).map((i) => {
    const path = i.path.join('.') || '(root)';
    return `${path}: ${i.message}`;
  });
  return first.join('; ') + (err.issues.length > 3 ? ` (+${err.issues.length - 3} more)` : '');
}

function looksLikeNode(v: unknown): boolean {
  // A node only needs a string `type`; box/props/id are filled by normalizeRaw,
  // so a terse agent-authored node (just type + children) still counts.
  return isPlainObject(v) && typeof v.type === 'string';
}

/** Validate a raw import (JSON string, document object, or bare node tree) for a
 *  PAGE. Auto-fills ids, validates the tree, dedupes ids, and pulls page meta
 *  from the envelope when present. */
export function parsePageImport(raw: unknown): ImportParse<PageImportMeta> {
  const data = coerce(raw);
  if (typeof data === 'symbol') return { ok: false, error: 'Not valid JSON.' };

  // Envelope form: { format, type:'page', name, kind, slug?, tree }.
  if (data && typeof data === 'object' && !Array.isArray(data) && 'format' in data) {
    const withIds = {
      ...(data as Record<string, unknown>),
      tree: normalizeRaw((data as Record<string, unknown>).tree, { n: 0 }),
    };
    const parsed = BuilderPageDocumentSchema.safeParse(withIds);
    if (!parsed.success) return { ok: false, error: friendly(parsed.error) };
    return {
      ok: true,
      tree: ensureUniqueIds(parsed.data.tree),
      meta: {
        name: parsed.data.name,
        kind: parsed.data.kind,
        slug: parsed.data.slug ?? null,
        recordType: parsed.data.recordType ?? null,
        // Pass SEO through AS-IS (do not coalesce to null): a field the envelope
        // omitted stays `undefined` so an update leaves the stored value alone,
        // while an explicit null/'' clears it at the service boundary.
        seoTitle: parsed.data.seoTitle,
        seoDescription: parsed.data.seoDescription,
        canonical: parsed.data.canonical,
        ogImage: parsed.data.ogImage,
        noindex: parsed.data.noindex,
      },
    };
  }

  // Bare tree form: just a node.
  if (looksLikeNode(data)) {
    const parsed = BuilderNodeSchema.safeParse(normalizeRaw(data, { n: 0 }));
    if (!parsed.success) return { ok: false, error: friendly(parsed.error) };
    return { ok: true, tree: ensureUniqueIds(parsed.data), meta: {} };
  }

  return {
    ok: false,
    error: 'Expected a Builder page document (with "format" + "tree") or a bare node tree.',
  };
}

/** Validate a raw import for a site LAYOUT (same rules as page; layout meta). */
export function parseLayoutImport(raw: unknown): ImportParse<LayoutImportMeta> {
  const data = coerce(raw);
  if (typeof data === 'symbol') return { ok: false, error: 'Not valid JSON.' };

  if (data && typeof data === 'object' && !Array.isArray(data) && 'format' in data) {
    const withIds = {
      ...(data as Record<string, unknown>),
      tree: normalizeRaw((data as Record<string, unknown>).tree, { n: 0 }),
    };
    const parsed = BuilderLayoutDocumentSchema.safeParse(withIds);
    if (!parsed.success) return { ok: false, error: friendly(parsed.error) };
    return { ok: true, tree: ensureUniqueIds(parsed.data.tree), meta: { name: parsed.data.name } };
  }

  if (looksLikeNode(data)) {
    const parsed = BuilderNodeSchema.safeParse(normalizeRaw(data, { n: 0 }));
    if (!parsed.success) return { ok: false, error: friendly(parsed.error) };
    return { ok: true, tree: ensureUniqueIds(parsed.data), meta: {} };
  }

  return {
    ok: false,
    error: 'Expected a Builder layout document (with "format" + "tree") or a bare node tree.',
  };
}

/** Validate a raw import for an EMAIL (same rules as page/layout; email meta). */
export function parseEmailImport(raw: unknown): ImportParse<EmailImportMeta> {
  const data = coerce(raw);
  if (typeof data === 'symbol') return { ok: false, error: 'Not valid JSON.' };

  if (data && typeof data === 'object' && !Array.isArray(data) && 'format' in data) {
    const withIds = {
      ...(data as Record<string, unknown>),
      tree: normalizeRaw((data as Record<string, unknown>).tree, { n: 0 }),
    };
    const parsed = BuilderEmailDocumentSchema.safeParse(withIds);
    if (!parsed.success) return { ok: false, error: friendly(parsed.error) };
    return {
      ok: true,
      tree: ensureUniqueIds(parsed.data.tree),
      meta: {
        name: parsed.data.name,
        subject: parsed.data.subject,
        preheader: parsed.data.preheader ?? null,
      },
    };
  }

  if (looksLikeNode(data)) {
    const parsed = BuilderNodeSchema.safeParse(normalizeRaw(data, { n: 0 }));
    if (!parsed.success) return { ok: false, error: friendly(parsed.error) };
    return { ok: true, tree: ensureUniqueIds(parsed.data), meta: {} };
  }

  return {
    ok: false,
    error: 'Expected a Builder email document (with "format" + "tree") or a bare node tree.',
  };
}
