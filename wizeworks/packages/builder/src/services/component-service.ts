// componentService — tenant-authored components (docs/53).
//
// A tenant component is a DECLARATIVE, versioned node subtree (vs. system
// components, which are in-code). Identity lives in BuilderComponent; the
// editable content lives in immutable BuilderComponentVersion snapshots so a
// page placement can PIN a version and opt into upgrades. Editing the tree /
// propSpec creates a NEW version and bumps `latestVersion`.
//
// Trees are validated against @wizeworks/builder-schemas on every write. Tenant-
// scoped via withTenant() — a callsite that forgets it sees nothing (FORCE RLS).
// One service, many transports: REST mounts these; MCP / Server Actions reuse
// them unchanged.

import {
  CreateComponentInput,
  UpdateComponentInput,
  checkNestingGraph,
  collectComponentRefs,
  expandCustomNodes,
  repinComponentRefs,
  validateComponentTree,
  type BuilderNode,
  type ComponentDto,
  type ComponentSummaryDto,
  type ComponentSurface,
  type ComponentGroup,
  type ComponentUsageDto,
  type ComponentVersionDto,
  type PropSpec,
  type SilicaNode,
  type SilicaPieceDto,
} from '@wizeworks/builder-schemas';
import type { BuilderComponent, BuilderComponentVersion, Prisma } from '@wizeworks/db';
import { withTenant } from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';
import { detachEverywhereTx, placesInstance } from './detach-instances';
import { BuilderNotFoundError, BuilderValidationError } from '../errors';

/** The symbol id a tenant library piece is materialized under in a silica tree.
 *  The console derives the same string (`saved-pieces.ts`); it is the contract that
 *  lets a page reference a shared master without minting a per-site id for it. */
function tenantSymbolId(key: string): string {
  return `tenant:${key}`;
}

const asJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

function surfacesOf(row: BuilderComponent): ComponentSurface[] {
  const s = row.surfaces as unknown;
  return Array.isArray(s) && s.length > 0 ? (s as ComponentSurface[]) : ['page'];
}

/** A stored tree column → the DTO field. Both columns are nullable since the silica
 *  cutover, and Prisma types a Json column's null as `JsonValue`, so the check is
 *  explicit rather than a cast that would quietly turn SQL NULL into an object. */
function treeOrNull<T>(value: unknown): T | null {
  return value == null ? null : (value as T);
}

/** `placeable` needs the LATEST version, which the summary row does not carry — so
 *  every caller of `toSummary` has to supply it. Passing it in rather than
 *  defaulting it is deliberate: a default of `false` would silently mark a real
 *  piece unusable, and a default of `true` would offer an editor for a legacy tree
 *  nothing can open. Neither is a safe guess, so the type makes it a decision. */
function toSummary(row: BuilderComponent, placeable: boolean): ComponentSummaryDto {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    group: row.group as ComponentGroup,
    icon: row.icon,
    description: row.description,
    surfaces: surfacesOf(row),
    latestVersion: row.latestVersion,
    placeable,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDto(row: BuilderComponent, version: BuilderComponentVersion): ComponentDto {
  const silicaTree = treeOrNull<SilicaNode>(version.silicaTree);
  return {
    ...toSummary(row, silicaTree !== null),
    tree: treeOrNull<BuilderNode>(version.tree),
    silicaTree,
    propSpec: (version.propSpec as unknown as PropSpec[]) ?? [],
  };
}

function toVersionDto(v: BuilderComponentVersion): ComponentVersionDto {
  return {
    version: v.version,
    tree: treeOrNull<BuilderNode>(v.tree),
    silicaTree: treeOrNull<SilicaNode>(v.silicaTree),
    propSpec: (v.propSpec as unknown as PropSpec[]) ?? [],
    createdAt: v.createdAt.toISOString(),
  };
}

/** The latest version per component id, from a flat version list. */
function latestByComponent(
  versions: BuilderComponentVersion[]
): Map<string, BuilderComponentVersion> {
  const latest = new Map<string, BuilderComponentVersion>();
  for (const v of versions) {
    const cur = latest.get(v.componentId);
    if (!cur || v.version > cur.version) latest.set(v.componentId, v);
  }
  return latest;
}

/** The dependency graph (key → its direct component references, from each
 *  component's latest version) for every component EXCEPT `excludeKey` — what the
 *  nesting cycle/depth check walks. Built from the DB; the schema-level check is
 *  pure and DB-free, so the graph is assembled here. */
async function buildRefGraph(
  tx: Prisma.TransactionClient,
  excludeKey: string
): Promise<Map<string, string[]>> {
  const comps = await tx.builderComponent.findMany({ where: { key: { not: excludeKey } } });
  const graph = new Map<string, string[]>();
  if (comps.length === 0) return graph;
  const versions = await tx.builderComponentVersion.findMany({
    where: { componentId: { in: comps.map((c) => c.id) } },
  });
  const latest = latestByComponent(versions);
  for (const c of comps) {
    const legacy = treeOrNull<BuilderNode>(latest.get(c.id)?.tree);
    // A silica-authored piece contributes no edges: `custom:<key>` nesting is a
    // legacy-tree concept (`collectComponentRefs` walks `props[REF_KEY]`), and a
    // silica piece nests by holding a symbol INSTANCE, which silica's own
    // self-nesting guard already refuses. Reading a silica tree with the legacy
    // walker would find nothing and report it as "no references" — the same answer
    // by accident, which is worth not relying on.
    graph.set(c.key, legacy ? [...new Set(collectComponentRefs(legacy).map((r) => r.key))] : []);
  }
  return graph;
}

/** Validate a component's tree + propSpec, raising a BuilderValidationError on any
 *  issue. Nesting (custom-in-custom, docs/53 4a) is allowed but bounded: every
 *  referenced component must exist, and the reference graph must stay acyclic and
 *  within the depth limit (`checkNestingGraph`). Runs inside the caller's tx so it
 *  reads a consistent component set. */
async function assertValidComponent(
  tx: Prisma.TransactionClient,
  key: string,
  tree: BuilderNode | null,
  propSpec: PropSpec[]
): Promise<void> {
  // A silica-only piece has no legacy tree to validate. `validateComponentTree` and
  // the nesting graph are both legacy-format machinery; silica's own engine owns the
  // equivalent guarantees for a silica master (its class policy on write, its
  // self-nesting refusal on instance insert). Running the legacy validator over a
  // silica tree would reject every one of them for having no `type`.
  if (!tree) return;
  const issues = validateComponentTree(tree, propSpec, { forbidNestedCustom: false });
  const refKeys = [...new Set(collectComponentRefs(tree).map((r) => r.key))];
  if (refKeys.length > 0) {
    const graph = await buildRefGraph(tx, key);
    for (const r of refKeys) {
      if (r !== key && !graph.has(r)) {
        issues.push({
          path: 'root',
          message: `References a component that doesn’t exist ("custom:${r}").`,
        });
      }
    }
    issues.push(...checkNestingGraph(key, refKeys, graph));
  }
  if (issues.length > 0) {
    throw new BuilderValidationError(
      'This component has validation problems.',
      issues.map((i) => ({ field: i.path, message: i.message }))
    );
  }
}

/** List the tenant's components (no tree) — the catalog rows. Ordered by group
 *  then name so the catalog reads stably. */
export function list(ctx: ServiceContext): Promise<ComponentSummaryDto[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.builderComponent.findMany({
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });
    if (rows.length === 0) return [];
    // `placeable` is a fact about the latest VERSION, so the list can no longer be a
    // single-table read. Selected down to the two columns that decide it rather than
    // reusing `listFull` — the list renders rows, and shipping every piece's whole
    // design tree to draw a badge is a payload nobody asked for.
    const versions = await tx.builderComponentVersion.findMany({
      where: { componentId: { in: rows.map((r) => r.id) } },
      select: { componentId: true, version: true, silicaTree: true },
    });
    const placeable = new Map<string, boolean>();
    for (const v of versions) {
      if (rows.find((r) => r.id === v.componentId)?.latestVersion === v.version) {
        placeable.set(v.componentId, v.silicaTree != null);
      }
    }
    return rows.map((row) => toSummary(row, placeable.get(row.id) ?? false));
  });
}

/** Every component WITH its latest version's content — what the Builder editor
 *  needs to expand `custom:*` placements live on the canvas (docs/53 P-B). One
 *  extra query over `list`; the page editor calls this, the catalog uses `list`. */
export function listFull(ctx: ServiceContext): Promise<ComponentDto[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.builderComponent.findMany({
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });
    if (rows.length === 0) return [];
    const versions = await tx.builderComponentVersion.findMany({
      where: { componentId: { in: rows.map((r) => r.id) } },
    });
    const latest = latestByComponent(versions);
    return rows
      .map((row) => {
        const v = latest.get(row.id);
        return v ? toDto(row, v) : null;
      })
      .filter((d): d is ComponentDto => d !== null);
  });
}

/** Every PLACEABLE piece, as the studio's palette needs it: identity + the silica
 *  master. Legacy-only pieces are dropped, not returned with a null tree — the
 *  studio would have nothing to insert for one, and a palette row that cannot be
 *  placed is worse than an absent one.
 *
 *  Its own read rather than a filter over `listFull` because that carries the legacy
 *  `tree` too, which for a mixed library means shipping the studio a payload of dead
 *  format it has no code to read. */
export function listSilica(ctx: ServiceContext): Promise<SilicaPieceDto[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.builderComponent.findMany({
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });
    if (rows.length === 0) return [];
    const versions = await tx.builderComponentVersion.findMany({
      where: { componentId: { in: rows.map((r) => r.id) } },
      select: { componentId: true, version: true, silicaTree: true },
    });
    const latest = new Map<string, unknown>();
    for (const v of versions) {
      if (rows.find((r) => r.id === v.componentId)?.latestVersion === v.version) {
        latest.set(v.componentId, v.silicaTree);
      }
    }
    const out: SilicaPieceDto[] = [];
    for (const row of rows) {
      const root = treeOrNull<SilicaNode>(latest.get(row.id));
      if (!root) continue;
      out.push({
        key: row.key,
        name: row.name,
        group: row.group as ComponentGroup,
        icon: row.icon,
        description: row.description,
        version: row.latestVersion,
        root,
      });
    }
    return out;
  });
}

/** One component with its LATEST version's content (what the editor edits). */
export function get(ctx: ServiceContext, key: string): Promise<ComponentDto> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.builderComponent.findFirst({ where: { key } });
    if (!row) throw new BuilderNotFoundError('BuilderComponent', key);
    const version = await tx.builderComponentVersion.findFirst({
      where: { componentId: row.id, version: row.latestVersion },
    });
    if (!version)
      throw new BuilderNotFoundError('BuilderComponentVersion', `${key}@${row.latestVersion}`);
    return toDto(row, version);
  });
}

/** All versions of a component, newest first — the version history / upgrade UI. */
export function listVersions(ctx: ServiceContext, key: string): Promise<ComponentVersionDto[]> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.builderComponent.findFirst({ where: { key }, select: { id: true } });
    if (!row) throw new BuilderNotFoundError('BuilderComponent', key);
    const versions = await tx.builderComponentVersion.findMany({
      where: { componentId: row.id },
      orderBy: { version: 'desc' },
    });
    return versions.map(toVersionDto);
  });
}

/** One specific version of a component — what a pinned placement renders. */
export function getVersion(
  ctx: ServiceContext,
  key: string,
  version: number
): Promise<ComponentVersionDto> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.builderComponent.findFirst({ where: { key }, select: { id: true } });
    if (!row) throw new BuilderNotFoundError('BuilderComponent', key);
    const v = await tx.builderComponentVersion.findFirst({
      where: { componentId: row.id, version },
    });
    if (!v) throw new BuilderNotFoundError('BuilderComponentVersion', `${key}@${version}`);
    return toVersionDto(v);
  });
}

/** Create a component + its version 1. The key is unique per tenant. */
export async function create(ctx: ServiceContext, rawInput: unknown): Promise<ComponentDto> {
  const input = CreateComponentInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const collision = await tx.builderComponent.findFirst({
      where: { key: input.key },
      select: { id: true },
    });
    if (collision) {
      throw new BuilderValidationError(`A component with key "${input.key}" already exists.`, [
        { field: 'key', message: 'Choose a different key.' },
      ]);
    }
    // Nesting/cycle/depth check needs the tenant's component graph (tx-scoped).
    // A silica-only piece short-circuits inside (legacy-format machinery).
    await assertValidComponent(tx, input.key, input.tree ?? null, input.propSpec);
    const component = await tx.builderComponent.create({
      data: {
        tenantId: ctx.tenantId,
        key: input.key,
        name: input.name,
        group: input.group,
        icon: input.icon,
        description: input.description ?? null,
        surfaces: asJson(input.surfaces),
        latestVersion: 1,
      },
    });
    const version = await tx.builderComponentVersion.create({
      data: {
        tenantId: ctx.tenantId,
        componentId: component.id,
        version: 1,
        // Prisma's `null` for a Json column means SQL NULL only via `Prisma.DbNull`;
        // a bare `null` writes the JSON literal `null`, which reads back as a
        // present-but-null tree and would make `placeable` true for a piece with no
        // design. Omitting the key entirely is the unambiguous way to say "absent".
        ...(input.tree !== undefined ? { tree: asJson(input.tree) } : {}),
        ...(input.silicaTree !== undefined ? { silicaTree: asJson(input.silicaTree) } : {}),
        propSpec: asJson(input.propSpec),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'builder.component.created',
      entityType: 'BuilderComponent',
      entityId: component.id,
      diff: { before: null, after: { key: component.key, name: component.name } },
    });
    return toDto(component, version);
  });
}

/** Update a component. Identity fields (name/group/icon/description/surfaces)
 *  update in place; providing `tree` or `propSpec` creates a NEW version
 *  (carrying forward the unchanged half) and bumps `latestVersion`. */
export async function update(
  ctx: ServiceContext,
  key: string,
  rawInput: unknown
): Promise<ComponentDto> {
  const input = UpdateComponentInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const existing = await tx.builderComponent.findFirst({ where: { key } });
    if (!existing) throw new BuilderNotFoundError('BuilderComponent', key);
    const current = await tx.builderComponentVersion.findFirst({
      where: { componentId: existing.id, version: existing.latestVersion },
    });
    if (!current) {
      throw new BuilderNotFoundError('BuilderComponentVersion', `${key}@${existing.latestVersion}`);
    }

    // Identity patch (in place).
    const identity: Prisma.BuilderComponentUpdateInput = {};
    if (input.name !== undefined) identity.name = input.name;
    if (input.group !== undefined) identity.group = input.group;
    if (input.icon !== undefined) identity.icon = input.icon;
    if (input.description !== undefined) identity.description = input.description ?? null;
    if (input.surfaces !== undefined) identity.surfaces = asJson(input.surfaces);

    // A content change → a new version snapshot. Carry forward the unchanged half —
    // including the OTHER tree column. A silica edit to a piece that also has a
    // legacy tree must not drop the legacy one (it is what any surviving legacy
    // placement still renders), and vice versa.
    const contentChanged =
      input.tree !== undefined || input.silicaTree !== undefined || input.propSpec !== undefined;
    let versionRow = current;
    if (contentChanged) {
      const nextTree = input.tree ?? treeOrNull<BuilderNode>(current.tree);
      const nextSilica = input.silicaTree ?? treeOrNull<SilicaNode>(current.silicaTree);
      const nextPropSpec = input.propSpec ?? (current.propSpec as unknown as PropSpec[]) ?? [];
      await assertValidComponent(tx, key, nextTree, nextPropSpec);
      const nextVersion = existing.latestVersion + 1;
      versionRow = await tx.builderComponentVersion.create({
        data: {
          tenantId: ctx.tenantId,
          componentId: existing.id,
          version: nextVersion,
          ...(nextTree !== null ? { tree: asJson(nextTree) } : {}),
          ...(nextSilica !== null ? { silicaTree: asJson(nextSilica) } : {}),
          propSpec: asJson(nextPropSpec),
        },
      });
      identity.latestVersion = nextVersion;
    }

    const updated = await tx.builderComponent.update({
      where: { id: existing.id },
      data: identity,
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'builder.component.updated',
      entityType: 'BuilderComponent',
      entityId: existing.id,
      diff: {
        before: { version: existing.latestVersion },
        after: { version: updated.latestVersion, name: updated.name },
      },
    });
    return toDto(updated, versionRow);
  });
}

/** Expand every `custom:<key>` placement in `draft` into concrete primitives for
 *  publish (docs/53 §3): each placement → its PINNED version's tree with instance
 *  slots filled, so the storefront renderer never sees a `custom:*` type. Shared
 *  by pageService.publish + layoutService.publish; runs inside their transaction.
 *  A placement that no longer resolves (deleted component) is dropped. */
export async function expandTreeForPublish(
  tx: Prisma.TransactionClient,
  draft: BuilderNode
): Promise<BuilderNode> {
  if (collectComponentRefs(draft).length === 0) return draft;
  // Load ALL components + versions, not just the draft's top-level refs: a
  // component's own tree may reference OTHER components (nesting, docs/53 4a), and
  // those nested keys never appear in the page draft. Tenant component sets are
  // small, so one pair of queries covers the whole graph the recursive expander
  // may reach.
  const comps = await tx.builderComponent.findMany();
  if (comps.length === 0) return draft;
  const byKey = new Map(comps.map((c) => [c.key, c]));
  const versionRows = await tx.builderComponentVersion.findMany({
    where: { componentId: { in: comps.map((c) => c.id) } },
  });
  const byKeyVer = new Map<string, BuilderComponentVersion>();
  for (const v of versionRows) {
    const comp = comps.find((c) => c.id === v.componentId);
    if (comp) byKeyVer.set(`${comp.key}@${v.version}`, v);
  }
  return expandCustomNodes(draft, (key, version) => {
    const comp = byKey.get(key);
    if (!comp) return null;
    const row = byKeyVer.get(`${key}@${version ?? comp.latestVersion}`);
    if (!row) return null;
    const tree = treeOrNull<BuilderNode>(row.tree);
    // A silica-authored piece has no legacy tree, and this expander is the LEGACY
    // publish path (`custom:*` placements in a `BuilderNode` page). Returning null
    // drops the placement, which is what a legacy page holding a reference to a
    // silica-only piece should do — there is nothing in that version it could
    // render, and emitting a `custom:*` node the storefront cannot resolve would
    // ship a hole instead of an absence.
    return tree ? { tree, propSpec: (row.propSpec as unknown as PropSpec[]) ?? [] } : null;
  });
}

/**
 * Where a component is placed (docs/53 §6): the pages + layouts whose draft OR
 * published tree holds it, in EITHER placement system.
 *
 * TWO SYSTEMS, AND IT ONLY EVER SAW ONE. A legacy placement is `custom:<key>` in
 * a `BuilderNode` tree; a silica placement is `instanceOf: tenant:<key>` in a
 * `silicaDraftTree` / `silicaPublishedTree`. This scanned only the legacy columns
 * for the legacy shape, so every piece the surviving editor creates reported
 * "not used yet" forever — and the console believed it. A clothing maker saved
 * her contact form as a piece, and its own page said it was on none of her pages
 * and offered a delete whose confirm told her "nothing your visitors see will
 * change" (issue 393). `placesInstance` was already exported next door for the
 * detach path; nothing called it from here.
 *
 * `blocking` is the second number, and it is not the same question. A legacy
 * reference cannot be inlined, so it refuses a delete. A silica instance detaches
 * — the page keeps the design and stops following the master. Answering both with
 * one count is how a screen refuses a delete the server would happily allow.
 *
 * Scans within the caller's transaction so it shares the publish/delete
 * consistency snapshot.
 */
async function scanUsages(tx: Prisma.TransactionClient, key: string): Promise<ComponentUsageDto> {
  const symbolId = tenantSymbolId(key);
  const refsFor = (tree: unknown): { key: string; version: number | null }[] =>
    collectComponentRefs(tree as BuilderNode).filter((r) => r.key === key);
  const usesKey = (tree: unknown): boolean => refsFor(tree).length > 0;
  const [pages, layouts] = [
    await tx.builderPage.findMany({
      select: {
        id: true,
        name: true,
        draftTree: true,
        publishedTree: true,
        silicaDraftTree: true,
        silicaPublishedTree: true,
      },
    }),
    await tx.builderLayout.findMany({
      select: {
        id: true,
        name: true,
        draftTree: true,
        publishedTree: true,
        silicaDraftTree: true,
        silicaPublishedTree: true,
      },
    }),
  ];

  /** A legacy reference, which refuses a delete. */
  const blocks = (row: { draftTree: unknown; publishedTree: unknown }): boolean =>
    usesKey(row.draftTree) || (row.publishedTree != null && usesKey(row.publishedTree));

  /** A silica instance, which detaches on delete. */
  const places = (row: { silicaDraftTree: unknown; silicaPublishedTree: unknown }): boolean =>
    placesInstance(row.silicaDraftTree, symbolId) ||
    placesInstance(row.silicaPublishedTree, symbolId);

  const pageHits = pages.filter((p) => blocks(p) || places(p));
  const layoutHits = layouts.filter((l) => blocks(l) || places(l));
  const blocking = pages.filter((p) => blocks(p)).length + layouts.filter((l) => blocks(l)).length;

  // Pinned versions across every DRAFT placement (what an upgrade would re-pin) —
  // lets the detail page tell whether a bulk upgrade would actually move anything.
  // Legacy only: a silica instance pins no version, it follows the master.
  const pinned = new Set<number>();
  for (const p of pages)
    for (const r of refsFor(p.draftTree)) if (r.version != null) pinned.add(r.version);
  for (const l of layouts)
    for (const r of refsFor(l.draftTree)) if (r.version != null) pinned.add(r.version);
  return {
    pages: pageHits.map((p) => ({ id: p.id, name: p.name })),
    layouts: layoutHits.map((l) => ({ id: l.id, name: l.name })),
    total: pageHits.length + layoutHits.length,
    blocking,
    pinnedVersions: [...pinned].sort((a, b) => a - b),
  };
}

/** Where-used for one component (its own transaction). 404 if the key is unknown. */
export function usages(ctx: ServiceContext, key: string): Promise<ComponentUsageDto> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.builderComponent.findFirst({ where: { key }, select: { id: true } });
    if (!row) throw new BuilderNotFoundError('BuilderComponent', key);
    return scanUsages(tx, key);
  });
}

/** Re-pin EVERY draft placement of `key` to `toVersion` (default: the latest) —
 *  the bulk "update all placements" upgrade (docs/53 §6 / P-E). Mirrors the
 *  per-placement re-pin the inspector does, applied across all draft pages +
 *  layouts in one transaction; the change goes live on each surface's next
 *  publish (parity with single-placement upgrade). Returns how many pages/layouts
 *  changed (a re-pin that matches the current pin is skipped). */
export async function upgradeAllPlacements(
  ctx: ServiceContext,
  key: string,
  toVersion?: number
): Promise<{ version: number; pages: number; layouts: number; total: number }> {
  return withTenant(ctx, async (tx) => {
    const comp = await tx.builderComponent.findFirst({ where: { key } });
    if (!comp) throw new BuilderNotFoundError('BuilderComponent', key);
    const version = toVersion ?? comp.latestVersion;
    const exists = await tx.builderComponentVersion.findFirst({
      where: { componentId: comp.id, version },
      select: { id: true },
    });
    if (!exists) {
      throw new BuilderValidationError(`Version ${version} doesn’t exist for this component.`, [
        { field: 'version', message: 'Choose an existing version.' },
      ]);
    }

    let pages = 0;
    const pageRows = await tx.builderPage.findMany({ select: { id: true, draftTree: true } });
    for (const p of pageRows) {
      const { tree, changed } = repinComponentRefs(
        p.draftTree as unknown as BuilderNode,
        key,
        version
      );
      if (changed) {
        await tx.builderPage.update({ where: { id: p.id }, data: { draftTree: asJson(tree) } });
        pages += 1;
      }
    }

    let layouts = 0;
    const layoutRows = await tx.builderLayout.findMany({ select: { id: true, draftTree: true } });
    for (const l of layoutRows) {
      const { tree, changed } = repinComponentRefs(
        l.draftTree as unknown as BuilderNode,
        key,
        version
      );
      if (changed) {
        await tx.builderLayout.update({ where: { id: l.id }, data: { draftTree: asJson(tree) } });
        layouts += 1;
      }
    }

    if (pages + layouts > 0) {
      await writeAuditLog({
        tx,
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        actorType: 'user',
        action: 'builder.component.placements_upgraded',
        entityType: 'BuilderComponent',
        entityId: comp.id,
        diff: { after: { version, pages, layouts } },
      });
    }
    return { version, pages, layouts, total: pages + layouts };
  });
}

/** Delete a component and all its versions (cascade). BLOCKS when the component
 *  is still placed on any page/layout (docs/53 §6) — deleting a live placement
 *  would orphan it (publish-expand drops unresolved refs), so the caller must
 *  remove the placements first. The dashboard surfaces where-used before asking. */
export async function remove(ctx: ServiceContext, key: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const existing = await tx.builderComponent.findFirst({ where: { key } });
    if (!existing) throw new BuilderNotFoundError('BuilderComponent', key);
    // Two placement systems, and they are deleted differently on purpose.
    //
    // A LEGACY placement (`custom:<key>` in a BuilderNode tree) is a reference the
    // renderer resolves at draw time and cannot be inlined here, so it still blocks.
    // `blocking`, NOT `total`. The scan sees both systems now, so guarding on the
    // combined count would refuse every delete of a placed silica piece — the exact
    // case the detach below exists to serve.
    const used = await scanUsages(tx, key);
    if (used.blocking > 0) {
      throw new BuilderValidationError(
        'This component is still placed on pages or layouts. Remove those placements before deleting it.',
        [
          {
            field: 'key',
            message: `In use in ${used.blocking} place${used.blocking === 1 ? '' : 's'}.`,
          },
        ]
      );
    }

    // A SILICA instance can be inlined, so it DETACHES — the page keeps the design
    // and simply stops following the master, which is what the console's delete
    // confirm has always promised.
    const version = await tx.builderComponentVersion.findFirst({
      where: { componentId: existing.id, version: existing.latestVersion },
      select: { silicaTree: true },
    });
    if (version?.silicaTree != null) {
      // No propertyId: a library piece is shared with every site the business owns.
      await detachEverywhereTx(
        tx,
        tenantSymbolId(key),
        version.silicaTree as unknown as SilicaNode
      );
    }

    await tx.builderComponent.delete({ where: { id: existing.id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'builder.component.deleted',
      entityType: 'BuilderComponent',
      entityId: existing.id,
      diff: { before: { key: existing.key, name: existing.name }, after: null },
    });
  });
}
