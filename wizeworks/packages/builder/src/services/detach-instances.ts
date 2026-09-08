// Deleting a saved piece must not delete work from pages nobody was looking at.
//
// An instance is a node that says `instanceOf: <symbolId>` and carries no content
// of its own — the design is drawn from the master at render time. So removing the
// master used to leave every placement pointing at nothing: the page kept a node
// that rendered as "This saved design is no longer available", and the design the
// author had built was simply gone from pages they were not looking at.
//
// The console has always PROMISED otherwise. Its delete confirm says the placements
// "stay exactly as they look now — they just stop following this piece", and the
// data layer's own comment says the same. Neither delete path did it. This is that
// behaviour, so the sentence becomes true.
//
// Detaching INLINES the master where the instance stood. Fresh ids, because the same
// piece may be placed twice on one page and two subtrees sharing ids is the exact
// state that silently disables drag-reorder and trips React's duplicate-key guard.

import type { Prisma } from '@wizeworks/db';
import { ensureUniqueIds } from '@wizeworks/silica-catalog';
import type { Node as SilicaNode } from '@wizeworks/silicaui-html';

interface Instance {
  instanceOf?: string;
  class?: string;
  children?: unknown[];
}

/**
 * Replace every instance of `symbolId` in `root` with the master's design.
 *
 * Returns the rewritten tree, or undefined when the tree holds no such instance —
 * so a caller can skip the write entirely rather than churning every page on the
 * site to change none of them.
 */
export function detachInstances(
  root: SilicaNode | null | undefined,
  symbolId: string,
  master: SilicaNode
): SilicaNode | undefined {
  // A page that has never been saved has no tree at all — four of them on the
  // development site. Reading through one is how a delete that should have detached
  // two placements threw instead and rolled the whole thing back.
  if (!root || typeof root !== 'object') return undefined;
  let touched = false;

  const rewrite = (node: SilicaNode): SilicaNode => {
    const candidate = node as unknown as Instance;

    if (candidate.instanceOf === symbolId) {
      touched = true;
      // The instance's own class travels with the design it was standing in for —
      // it is the spacing and placement the author gave THIS copy, and dropping it
      // would move the block on the page as a side effect of a delete.
      // Ids STRIPPED before minting, not merely healed. `ensureUniqueIds` keeps an
      // id that is already there — correct when repairing one tree, wrong here: the
      // same piece placed twice would inline the master's ids twice and put two
      // nodes with one id on a single page, which is the state that silently
      // disables drag-reorder and trips React's duplicate-key guard.
      const inlined = ensureUniqueIds(stripIds(structuredClone(master))) as unknown as Instance;
      const merged = mergeClasses(candidate.class, inlined.class);
      return { ...(inlined as unknown as SilicaNode), ...(merged ? { class: merged } : {}) };
    }

    const children = candidate.children;
    if (!Array.isArray(children) || children.length === 0) return node;

    const next = children.map((child) =>
      child && typeof child === 'object' ? rewrite(child as SilicaNode) : child
    );
    return { ...node, children: next } as SilicaNode;
  };

  const result = rewrite(root);
  return touched ? result : undefined;
}

/**
 * The instance's own classes plus the master's, each kept once.
 *
 * Save-as-piece leaves the instance wearing the very classes it just handed to
 * the master, so a plain join wrote every one of them twice — a detached section
 * came back as `bg-base-100 @container px-6 py-16 text-center bg-base-100
 * @container px-6 py-16 text-center`. Harmless to render and not harmless to
 * live with: each save-and-delete round doubles it again, and the author opens
 * the class field on a block she never touched.
 *
 * Order is the instance's first, because a later utility wins in Tailwind and the
 * instance's classes are the ones this copy was given deliberately.
 */
function mergeClasses(instance: string | undefined, master: string | undefined): string {
  const seen = new Set<string>();
  for (const word of `${master ?? ''} ${instance ?? ''}`.split(/\s+/)) {
    if (word) seen.add(word);
  }
  return [...seen].join(' ');
}

/** A copy with every id removed, ready to be given fresh ones. */
function stripIds(node: SilicaNode): SilicaNode {
  const target = node as unknown as Instance & { id?: string };
  delete target.id;
  const children = target.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === 'object') stripIds(child as SilicaNode);
    }
  }
  return node;
}

/** True when this tree places the symbol at all — the cheap check before a rewrite. */
export function placesInstance(root: unknown, symbolId: string): boolean {
  if (!root || typeof root !== 'object') return false;
  const node = root as Instance;
  if (node.instanceOf === symbolId) return true;
  const children = node.children;
  if (!Array.isArray(children)) return false;
  return children.some((child) => placesInstance(child, symbolId));
}

/** Prisma refuses `undefined` as a JSON column value, so writes are built conditionally. */
function asJson(node: SilicaNode): Prisma.InputJsonValue {
  return node as unknown as Prisma.InputJsonValue;
}

/**
 * Inline a piece into every page and layout that places it.
 *
 * Draft AND published trees. A published page still showing a piece is the one a
 * VISITOR is looking at, so leaving it pointing at a deleted master would break the
 * live site rather than the author's copy of it.
 *
 * `propertyId` scopes this to ONE site, for a site-owned piece. Omit it for a piece
 * from the tenant LIBRARY, which is shared with every site the business owns — RLS
 * already bounds the scan to the tenant, and detaching one site's copies while
 * leaving another's dangling is the half-done state this exists to prevent.
 */
export async function detachEverywhereTx(
  tx: Prisma.TransactionClient,
  symbolId: string,
  master: SilicaNode,
  propertyId?: string
): Promise<void> {
  const where = propertyId ? { propertyId } : {};

  const pages = await tx.builderPage.findMany({
    where,
    select: { id: true, silicaDraftTree: true, silicaPublishedTree: true },
  });
  for (const page of pages) {
    const draft = detachInstances(page.silicaDraftTree as unknown as SilicaNode, symbolId, master);
    const published = detachInstances(
      page.silicaPublishedTree as unknown as SilicaNode,
      symbolId,
      master
    );
    if (!draft && !published) continue;
    await tx.builderPage.update({
      where: { id: page.id },
      data: {
        ...(draft ? { silicaDraftTree: asJson(draft) } : {}),
        ...(published ? { silicaPublishedTree: asJson(published) } : {}),
      },
    });
  }

  const layouts = await tx.builderLayout.findMany({
    where,
    select: { id: true, silicaDraftTree: true, silicaPublishedTree: true },
  });
  for (const layout of layouts) {
    const draft = detachInstances(
      layout.silicaDraftTree as unknown as SilicaNode,
      symbolId,
      master
    );
    const published = detachInstances(
      layout.silicaPublishedTree as unknown as SilicaNode,
      symbolId,
      master
    );
    if (!draft && !published) continue;
    await tx.builderLayout.update({
      where: { id: layout.id },
      data: {
        ...(draft ? { silicaDraftTree: asJson(draft) } : {}),
        ...(published ? { silicaPublishedTree: asJson(published) } : {}),
      },
    });
  }
}
