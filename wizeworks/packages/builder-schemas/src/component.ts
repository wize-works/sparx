// Tenant components — the persisted contract for user-authored components
// (docs/53). A tenant component is a DECLARATIVE, versioned, parameterized node
// subtree (vs. system components, which are in-code and carry a renderLeaf
// function). It renders by EXPANSION through the trusted registry renderers, so
// it can be stored, validated, and versioned as plain data — never user code.
//
// Zod-only (no DB, no React), like the rest of @wizeworks/builder-schemas: safe to
// import from the editor's client components AND the server service layer.

import { z } from 'zod';
import { BuilderNodeSchema, type BuilderNode } from './node';
import { SilicaTreeInput, type SilicaNode } from './site-sync';

// ── Group + surfaces (mirror the dashboard registry's PaletteGroup / EditorSurface) ──

export const ComponentGroup = z.enum(['layout', 'content', 'data']);
export type ComponentGroup = z.infer<typeof ComponentGroup>;

export const ComponentSurface = z.enum(['page', 'site', 'email']);
export type ComponentSurface = z.infer<typeof ComponentSurface>;

// ── Component key + the `custom:` placement namespace ─────────────────────────

/** The placement type for a tenant component is `custom:<key>`. The node `type`
 *  column caps at 63 chars, and `custom:` is 7, so the key caps at 56. */
export const CUSTOM_PREFIX = 'custom:';
export const COMPONENT_KEY_MAX = 56;

export const ComponentKey = z
  .string()
  .min(1)
  .max(COMPONENT_KEY_MAX)
  .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers, and underscores.');
export type ComponentKey = z.infer<typeof ComponentKey>;

/** The placement `type` for a tenant component (`custom:<key>`). */
export function customType(key: string): string {
  return `${CUSTOM_PREFIX}${key}`;
}
export function isCustomType(type: string): boolean {
  return type.startsWith(CUSTOM_PREFIX);
}
/** The component key behind a `custom:<key>` placement type, or null. */
export function customKeyOf(type: string): string | null {
  return isCustomType(type) ? type.slice(CUSTOM_PREFIX.length) : null;
}

// ── PropSpec — the instance-fillable slots (docs/53 §5) ───────────────────────

export const PropKind = z.enum(['text', 'richtext', 'url', 'image', 'number', 'boolean']);
export type PropKind = z.infer<typeof PropKind>;

export const PropSpecSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z][a-zA-Z0-9_]*$/, 'Prop keys are camelCase starting with a lowercase letter.'),
  label: z.string().min(1).max(120),
  kind: PropKind,
  /** A default value used when an instance leaves the slot empty. */
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export type PropSpec = z.infer<typeof PropSpecSchema>;

export const PropSpecListSchema = z.array(PropSpecSchema).max(50);

// ── propSpec → zod (docs/53 §5) ───────────────────────────────────────────────
// The instance-config validator a component's propSpec derives (mirrors the
// legacy fieldSpecToZod): each declared slot maps to a Zod type by kind, so an
// instance's filled values can be validated + coerced into the shape the
// component expects. Enforced at expand (publish bakes coerced values into the
// published tree), so a published placement can never carry a slot value in a
// shape the component rejects.

/** The Zod type one slot kind validates/coerces to. */
function zodForKind(kind: PropKind): z.ZodType {
  switch (kind) {
    case 'number':
      return z.coerce.number();
    case 'boolean':
      // Real booleans (the Switch control) pass; a stringified "true"/"false"
      // coerces. Avoids z.coerce.boolean's footgun (any non-empty string → true).
      return z.preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean());
    case 'text':
    case 'richtext':
    case 'url':
    case 'image':
    default:
      return z.string();
  }
}

/** The object validator for a component's filled instance props (every slot
 *  optional — an empty slot falls back to the component's default). */
export function propSpecToZod(propSpec: PropSpec[]): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const p of propSpec) shape[p.key] = zodForKind(p.kind).optional();
  return z.object(shape);
}

/** Coerce an instance's filled props to their declared kinds, dropping any value
 *  that can't validate (so a single bad value falls back to the component default
 *  rather than blanking the whole component). Empty / absent slots are left as-is
 *  for the expander to resolve from the default. Undeclared keys pass through. */
export function coerceInstanceProps(
  propSpec: PropSpec[],
  props: Record<string, unknown>
): Record<string, unknown> {
  if (propSpec.length === 0) return props;
  const out: Record<string, unknown> = { ...props };
  for (const p of propSpec) {
    const raw = props[p.key];
    if (raw === undefined || raw === null || raw === '') continue;
    const parsed = zodForKind(p.kind).safeParse(raw);
    if (parsed.success && parsed.data !== undefined) out[p.key] = parsed.data;
    else delete out[p.key];
  }
  return out;
}

// ── The `{ $prop: key }` slot sentinel ────────────────────────────────────────
// A node prop value inside a component tree may be a slot reference instead of a
// literal; the expander replaces it with the instance's value for that prop.

export const PROP_SLOT_KEY = '$prop';
export interface PropSlot {
  $prop: string;
}
export function isPropSlot(v: unknown): v is PropSlot {
  return (
    typeof v === 'object' && v !== null && typeof (v as { $prop?: unknown }).$prop === 'string'
  );
}

// ── The `$bind:<key>` binding slot (docs/53 §5, 4b) ───────────────────────────
// The binding analog of a `{ $prop }` slot: a node's `binding.path` may be a
// `$bind:<key>` sentinel instead of a real data path. The author declares it in
// the component editor; each placement maps the slot to a real path under
// `props.$ref.bindings`, and the expander substitutes it. Encoding the slot in
// the path string (vs. a new binding shape) keeps the BuilderNode schema — and
// therefore the storefront renderer — untouched: published trees only ever carry
// concrete `{ path }` bindings (or none), never a `$bind:*` sentinel.

export const BIND_SLOT_PREFIX = '$bind:';
/** The binding path that marks a node's data binding as instance-fillable. */
export function makeBindSlotPath(key: string): string {
  return `${BIND_SLOT_PREFIX}${key}`;
}
export function isBindSlotPath(path: string | undefined | null): boolean {
  return typeof path === 'string' && path.startsWith(BIND_SLOT_PREFIX);
}
/** The slot key behind a `$bind:<key>` binding path, or null. */
export function bindSlotKey(path: string | undefined | null): string | null {
  return isBindSlotPath(path) ? path!.slice(BIND_SLOT_PREFIX.length) : null;
}

// ── The instance `$ref` (carried on a placement node's props) ─────────────────
// A `custom:<key>` placement stores its pinned version + instance prop values
// under `props.$ref`; the rest of `props` are the instance's slot values.

export const REF_KEY = '$ref';
export const ComponentRefSchema = z.object({
  /** The pinned component version this placement renders. */
  version: z.number().int().min(1),
  /** Per-instance binding overrides (docs/53 §5, 4b): a map of the component's
   *  binding-slot keys (the `$bind:<key>` sentinels authored on its nodes) → the
   *  data path each resolves to for THIS placement. Omitted ⇒ every slot falls
   *  back to static. Optional so existing placements (version-only) stay valid. */
  bindings: z.record(z.string(), z.string()).optional(),
});
export type ComponentRef = z.infer<typeof ComponentRefSchema>;

/** Read the `$ref` off a placement node's props, or null if absent/malformed. */
export function readComponentRef(props: Record<string, unknown>): ComponentRef | null {
  const parsed = ComponentRefSchema.safeParse(props[REF_KEY]);
  return parsed.success ? parsed.data : null;
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

/** A single immutable version of a component.
 *
 *  TWO tree fields, and a version carries at least one. `tree` is the RETIRED
 *  `.bx-*` builder's node format, present only on rows authored before the silica
 *  cutover — the surviving editor cannot open one. `silicaTree` is the placeable
 *  master the silica studio reads and writes. See the
 *  `20270123000000_builder_component_silica_tree` migration for why legacy trees are
 *  kept rather than converted. */
export interface ComponentVersionDto {
  version: number;
  tree: BuilderNode | null;
  silicaTree: SilicaNode | null;
  propSpec: PropSpec[];
  createdAt: string;
}

/** One component, including its LATEST version's content (what the editor edits).
 *  Older versions are fetched on demand for the version history / upgrade UI. */
export interface ComponentDto {
  id: string;
  key: string;
  name: string;
  group: ComponentGroup;
  icon: string;
  description: string | null;
  surfaces: ComponentSurface[];
  latestVersion: number;
  /** The legacy `.bx-*` tree, or null. Present only on pre-cutover rows; nothing
   *  can open one. `placeable` below is what a caller should branch on. */
  tree: BuilderNode | null;
  /** The silica master — what the studio materializes as a `tenant:<key>` symbol. */
  silicaTree: SilicaNode | null;
  propSpec: PropSpec[];
  createdAt: string;
  updatedAt: string;
}

/** One placeable saved piece, as the silica studio consumes it.
 *
 *  The studio materializes each of these into `Site.symbols` under the id
 *  `tenant:<key>`, which hands the whole thing to silica's own component system —
 *  the Components board lists it, inserting one creates a live INSTANCE, editing the
 *  master propagates to every instance, and `enterSymbol` opens it. That is why this
 *  carries `root` and not a rendered preview: silica needs the editable tree.
 *
 *  `version` travels so the studio can tell a stale materialized symbol from a
 *  current one without diffing trees. */
export interface SilicaPieceDto {
  key: string;
  name: string;
  group: ComponentGroup;
  icon: string;
  description: string | null;
  version: number;
  root: SilicaNode;
}

/** Where a component is placed — the delete-impact / where-used read (docs/53
 *  §6). A page/layout appears if EITHER its draft or published tree references the
 *  component, so deleting it can't silently break the live site. */
export interface ComponentUsageDto {
  pages: { id: string; name: string }[];
  layouts: { id: string; name: string }[];
  total: number;
  /**
   * How many of those placements would REFUSE a delete.
   *
   * Two placement systems answer "what happens if I delete this" differently. A
   * legacy `custom:<key>` reference is resolved at draw time and cannot be
   * inlined, so it blocks. A silica `instanceOf` placement DETACHES — the page
   * keeps the design exactly as it looks and simply stops following the master.
   *
   * `total` and this are therefore different numbers on purpose: the first says
   * where the piece is, the second says what stands in the way. Reporting one as
   * the other is how a screen ends up refusing a delete the server would allow,
   * or offering one it would refuse.
   */
  blocking: number;
  /** The distinct versions this component is pinned to across all placements
   *  (docs/53 P-E). Lets the detail page tell whether a bulk "update all
   *  placements" would actually move anything (any value below `latestVersion`). */
  pinnedVersions: number[];
}

/** A component without its tree — the list/catalog row. */
export interface ComponentSummaryDto {
  id: string;
  key: string;
  name: string;
  group: ComponentGroup;
  icon: string;
  description: string | null;
  surfaces: ComponentSurface[];
  latestVersion: number;
  /** Whether the surviving editor can actually open and place this piece — i.e.
   *  whether its latest version carries a silica tree.
   *
   *  On the SUMMARY on purpose, even though it is derived from the version the
   *  summary does not carry. Without it the list has no way to tell a placeable
   *  piece from a legacy one, so it would offer "Edit design" on every row and let
   *  a third of them open an editor that renders nothing — which is the defect
   *  this whole slice exists to close, reproduced one screen earlier. */
  placeable: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Service inputs (parsed at the service boundary, never by the DB) ──────────

/** Create a component. Exactly one tree field is expected in practice — every new
 *  piece comes from the silica studio and sends `silicaTree` — but `tree` stays
 *  accepted so the legacy fixtures and the marketplace ingest path keep working
 *  until they are retired. At least one is required; neither would store a version
 *  no editor could ever open. */
export const CreateComponentInput = z
  .object({
    key: ComponentKey,
    name: z.string().min(1).max(120),
    group: ComponentGroup.default('content'),
    icon: z.string().max(64).default('box'),
    description: z.string().max(500).nullish(),
    surfaces: z.array(ComponentSurface).min(1).default(['page']),
    tree: BuilderNodeSchema.optional(),
    silicaTree: SilicaTreeInput.optional(),
    propSpec: PropSpecListSchema.default([]),
  })
  .refine((v) => v.tree !== undefined || v.silicaTree !== undefined, {
    message: 'A piece needs a design — provide silicaTree.',
    path: ['silicaTree'],
  });
export type CreateComponentInput = z.infer<typeof CreateComponentInput>;

/** Patch a component. Providing `tree`, `silicaTree` or `propSpec` creates a NEW
 *  version (the service bumps `latestVersion`); the identity fields update in place. */
export const UpdateComponentInput = z
  .object({
    name: z.string().min(1).max(120).optional(),
    group: ComponentGroup.optional(),
    icon: z.string().max(64).optional(),
    description: z.string().max(500).nullish(),
    surfaces: z.array(ComponentSurface).min(1).optional(),
    tree: BuilderNodeSchema.optional(),
    silicaTree: SilicaTreeInput.optional(),
    propSpec: PropSpecListSchema.optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'Provide at least one field to update.',
  });
export type UpdateComponentInput = z.infer<typeof UpdateComponentInput>;

// ── Tree validation (docs/53 §7) ──────────────────────────────────────────────
// Structural validation beyond the BuilderNodeSchema parse: type resolution,
// nesting, no nested custom (v1), and prop-slot resolution. The system/tenant
// type predicates are injected by the caller — @wizeworks/builder-schemas is
// React-free and can't import the dashboard registry, so the service supplies a
// server-safe known-type set + acceptsChildren map.

export interface ComponentValidationOptions {
  /** True if a node `type` is renderable (a system type or an existing tenant
   *  component). When omitted, type existence is not checked. */
  isKnownType?: (type: string) => boolean;
  /** True if a node `type` may hold children. When omitted, nesting isn't checked. */
  acceptsChildren?: (type: string) => boolean;
  /** Forbid `custom:*` nodes inside a component tree — v1 has no nesting, which
   *  sidesteps the cycle problem entirely (docs/53 §7). Default true. */
  forbidNestedCustom?: boolean;
}

export interface ComponentValidationIssue {
  path: string;
  message: string;
}

/** Validate a component's tree + propSpec. Returns [] when valid. */
export function validateComponentTree(
  tree: BuilderNode,
  propSpec: PropSpec[],
  opts: ComponentValidationOptions = {}
): ComponentValidationIssue[] {
  const { isKnownType, acceptsChildren, forbidNestedCustom = true } = opts;
  const propKeys = new Set(propSpec.map((p) => p.key));
  const issues: ComponentValidationIssue[] = [];

  const walk = (node: BuilderNode, path: string): void => {
    if (forbidNestedCustom && isCustomType(node.type)) {
      issues.push({
        path,
        message: `Components can't contain other components yet ("${node.type}").`,
      });
    } else if (isKnownType && !isKnownType(node.type)) {
      issues.push({ path, message: `Unknown component type "${node.type}".` });
    }

    if (acceptsChildren && (node.children?.length ?? 0) > 0 && !acceptsChildren(node.type)) {
      issues.push({ path, message: `"${node.type}" can't contain children.` });
    }

    // Prop slots must name a declared propSpec entry.
    for (const [key, value] of Object.entries(node.props)) {
      if (isPropSlot(value) && !propKeys.has(value.$prop)) {
        issues.push({
          path: `${path}.props.${key}`,
          message: `Slot references undeclared prop "${value.$prop}".`,
        });
      }
    }

    (node.children ?? []).forEach((child, i) => walk(child, `${path}.children[${i}]`));
  };

  walk(tree, 'root');
  return issues;
}

// ── Nesting safety (docs/53 4a + §7) ──────────────────────────────────────────
// v1 forbade custom-in-custom entirely to sidestep cycles. Nesting is now
// allowed, bounded by two rules the SERVICE enforces (it owns the dependency
// graph; this module is DB-free): no reference cycle, and a maximum nesting
// depth. Both are checked here against a graph the service builds from every
// component's latest tree.

/** The deepest a tenant component may nest other components. Bounds expansion
 *  (and is the canvas/publish safety net even if a cycle ever slipped through). */
export const MAX_COMPONENT_NESTING = 5;

/** Validate that saving component `key` with direct references `candidateRefs`
 *  introduces neither a reference cycle nor a chain deeper than `maxDepth`.
 *  `graph` maps every OTHER component's key → its own direct references (from its
 *  latest version). Returns [] when the nesting is safe. Pure — the service loads
 *  the graph and calls this. */
export function checkNestingGraph(
  key: string,
  candidateRefs: string[],
  graph: ReadonlyMap<string, string[]>,
  maxDepth: number = MAX_COMPONENT_NESTING
): ComponentValidationIssue[] {
  const issues: ComponentValidationIssue[] = [];
  const seen = new Set<string>();
  const add = (message: string): void => {
    if (seen.has(message)) return;
    seen.add(message);
    issues.push({ path: 'root', message });
  };
  // The candidate's edges replace `key`'s in the live graph.
  const edgesOf = (k: string): string[] => (k === key ? candidateRefs : (graph.get(k) ?? []));
  const stack = new Set<string>();
  let deepest = 0;
  const dfs = (k: string, depth: number): void => {
    deepest = Math.max(deepest, depth);
    // Hard stop so a stray pre-existing cycle (shouldn't exist) can't run away.
    if (depth > maxDepth + 1) return;
    stack.add(k);
    for (const next of edgesOf(k)) {
      if (next === key || stack.has(next)) {
        add(`Components can’t reference each other in a loop ("${next}").`);
        continue;
      }
      dfs(next, depth + 1);
    }
    stack.delete(k);
  };
  dfs(key, 0);
  if (deepest > maxDepth) {
    add(`Components can be nested at most ${maxDepth} levels deep.`);
  }
  return issues;
}

/** Every `custom:<key>` placement found in a tree (with its pinned version) —
 *  powers where-used analysis (delete impact) and publish-time expansion. */
export function collectComponentRefs(
  tree: BuilderNode
): { type: string; key: string; version: number | null }[] {
  const out: { type: string; key: string; version: number | null }[] = [];
  const walk = (node: BuilderNode): void => {
    const key = customKeyOf(node.type);
    if (key) {
      out.push({ type: node.type, key, version: readComponentRef(node.props)?.version ?? null });
    }
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  return out;
}

/** The distinct binding slots a component declares — every `$bind:<key>` found on
 *  a node's binding, deduped by key (the first node's name labels it). Drives the
 *  placement inspector's per-instance binding-override form (docs/53 4b). Derived
 *  from the tree, so there's no separate spec to keep in sync (a new column would
 *  mean a migration; the sentinel + this scan stay migration-free). */
export function collectBindingSlots(tree: BuilderNode): { key: string; label: string }[] {
  const labels = new Map<string, string>();
  const walk = (node: BuilderNode): void => {
    const k = bindSlotKey(node.binding?.path);
    if (k && !labels.has(k)) labels.set(k, node.name ?? k);
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  return [...labels.entries()].map(([key, label]) => ({ key, label }));
}

/** Re-pin every `custom:<key>` placement in `tree` to `version` (the bulk-upgrade
 *  primitive, docs/53 §6 / P-E), preserving each placement's instance props +
 *  binding overrides. Returns the rewritten tree and whether anything changed, so
 *  the caller can skip a no-op write. Pure. */
export function repinComponentRefs(
  tree: BuilderNode,
  key: string,
  version: number
): { tree: BuilderNode; changed: boolean } {
  let changed = false;
  const walk = (node: BuilderNode): BuilderNode => {
    let next = node;
    if (customKeyOf(node.type) === key) {
      const ref = readComponentRef(node.props);
      if (ref?.version !== version) {
        next = { ...node, props: { ...node.props, [REF_KEY]: { ...(ref ?? {}), version } } };
        changed = true;
      }
    }
    const kids = next.children;
    if (kids) {
      const mapped = kids.map(walk);
      if (mapped.some((c, i) => c !== kids[i])) next = { ...next, children: mapped };
    }
    return next;
  };
  return { tree: walk(tree), changed };
}

// ── Placement + expansion (docs/53 §3, P-B) ───────────────────────────────────
// A page references a tenant component by a `custom:<key>` PLACEMENT node that
// pins a version under `props.$ref`; its other props are the instance's slot
// values. The editor expands the placement live for preview; publish expands it
// into concrete primitives so the storefront renderer never sees a `custom:*`
// type. Both call the same pure expander here.

/** A fresh placement node for component `key`, pinned to `version`. The caller
 *  supplies the id (the editor's makeId / a server id) — this module is id-gen
 *  free so it stays pure + SSR-safe. Instance prop values arrive later (P-D); a
 *  fresh placement carries only the version pin. */
export function makeCustomNode(key: string, version: number, id: string): BuilderNode {
  return {
    id,
    type: customType(key),
    props: { [REF_KEY]: { version } },
  };
}

/** Fill `{ $prop: key }` slots in a component's version tree with an instance's
 *  values (coerced to the slot's kind, falling back to the propSpec default),
 *  substitute `$bind:<key>` binding slots with the instance's binding overrides
 *  (docs/53 4b), and rewrite every node id to a page-unique id derived from
 *  `idPrefix` so multiple placements of the same component never collide. Pure. A
 *  prop slot whose value resolves to nothing drops the prop key (the component's
 *  default rendering shows through); a binding slot with no override drops the
 *  binding (the node falls back to static). */
export function expandComponentTree(
  versionTree: BuilderNode,
  instanceProps: Record<string, unknown>,
  propSpec: PropSpec[],
  idPrefix: string,
  instanceBindings: Record<string, string> = {}
): BuilderNode {
  const coerced = coerceInstanceProps(propSpec, instanceProps);
  const defaults = new Map(propSpec.map((p) => [p.key, p.default]));
  const resolveSlot = (slot: PropSlot): unknown => {
    const v = coerced[slot.$prop];
    if (v !== undefined && v !== null && v !== '') return v;
    return defaults.get(slot.$prop);
  };
  const walk = (node: BuilderNode): BuilderNode => {
    const props: Record<string, unknown> = {};
    for (const [k, value] of Object.entries(node.props)) {
      if (isPropSlot(value)) {
        const filled = resolveSlot(value);
        if (filled !== undefined) props[k] = filled;
      } else {
        props[k] = value;
      }
    }
    const next: BuilderNode = { ...node, id: `${idPrefix}~${node.id}`, props };
    const slotKey = bindSlotKey(node.binding?.path);
    if (slotKey !== null) {
      const override = instanceBindings[slotKey];
      if (override) next.binding = { path: override };
      else delete next.binding;
    }
    if (node.children) next.children = node.children.map(walk);
    return next;
  };
  return walk(versionTree);
}

/** A component version resolved for expansion (its tree + the slots it declares). */
export interface ResolvedComponentVersion {
  tree: BuilderNode;
  propSpec: PropSpec[];
}

/** Replace every `custom:<key>` placement in `tree` with the expanded component
 *  subtree (the pinned version's tree, prop slots filled + binding slots resolved
 *  from the placement's props). RECURSIVE: a component may itself reference other
 *  components (nesting, docs/53 4a), so the expansion of one placement is walked
 *  again to expand any nested placements, bounded by `maxDepth` (a backstop —
 *  cycles are rejected at save). Pure — the DB lookup is the injected `resolve`
 *  (publish reads the pinned version; the editor previews the latest). A placement
 *  that can't resolve (component deleted / version missing / too deep) is DROPPED:
 *  the publish path guards deletes, so this only bites a corrupted tree, where
 *  omitting the node beats shipping a broken `custom:*` the storefront can't render. */
export function expandCustomNodes(
  tree: BuilderNode,
  resolve: (key: string, version: number | null) => ResolvedComponentVersion | null,
  maxDepth: number = MAX_COMPONENT_NESTING
): BuilderNode {
  const walk = (node: BuilderNode, depth: number): BuilderNode | null => {
    const key = customKeyOf(node.type);
    if (key) {
      if (depth >= maxDepth) return null;
      const ref = readComponentRef(node.props);
      const resolved = resolve(key, ref?.version ?? null);
      if (!resolved) return null;
      const instanceProps = { ...node.props };
      delete instanceProps[REF_KEY];
      const expanded = expandComponentTree(
        resolved.tree,
        instanceProps,
        resolved.propSpec,
        node.id,
        ref?.bindings ?? {}
      );
      // Walk the expansion so a component nested inside this one also expands.
      return walk(expanded, depth + 1);
    }
    if (!node.children) return node;
    const children = node.children
      .map((c) => walk(c, depth))
      .filter((c): c is BuilderNode => c !== null);
    return { ...node, children };
  };
  // A page root is never a custom placement (insertion always nests inside a
  // container), so the root walk only returns null on a corrupted tree — fall
  // back to the original so publish always has a tree to snapshot.
  return walk(tree, 0) ?? tree;
}
