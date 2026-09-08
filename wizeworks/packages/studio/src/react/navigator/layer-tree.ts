// Which nodes earn a row in the Navigator, and what each row is called.
//
// A document is full of `div`s that exist only to hold a flex or a grid. Listing
// them at the same weight as content is what makes a layer tree read like markup:
// the footer shows three nested boxes before a single word appears. "Simple"
// folds those away — the ROW is dropped and its children lift into its parent's
// list; the node itself is untouched, still on the canvas, still selectable, and
// still the parent every move resolves against.
//
// A row names the thing an author recognizes — the words the node holds, or the
// name they gave it, or what kind of thing it is in plain English. Never a tag: a
// business owner has no reason to know what an `<aside>` is.
//
// Pure. No React, no DOM, no store — which is what makes the folding rule
// testable, and it is the part with the judgement in it.

import type { Node } from '@wizeworks/silicaui-html';
import { HOST_COMPONENTS } from '@wizeworks/silica-catalog';
import { childNodes, isAddressable, isNodeChild, type AddressableNode } from '../../tree/walk';

/** A live region's name in the author's words, looked up by its component key.
 *
 *  Looked up rather than STAMPED onto the node, which is the whole point of a host
 *  core: the platform keeps improving what renders there, and the name is part of
 *  what it renders. A stamped label freezes at insert, so renaming "Reviews and
 *  ratings" in the registry would reach only sites built after the change — the
 *  exact failure host cores exist to avoid. A label the author types wins over this,
 *  because `rowLabel` checks `node.label` first. */
const HOST_LABELS: Record<string, string> = Object.fromEntries(
  HOST_COMPONENTS.map((core) => [core.key, core.label])
);

export type LayerDepth = 'simple' | 'all';

export interface LayerRow {
  id: string;
  label: string;
  /** A name from silica's bundled icon set. */
  icon: string;
  depth: number;
  hasChildren: boolean;
  locked: boolean;
  isInstance: boolean;
  /** False for chrome drawn around an editable page body. */
  editable: boolean;
}

const TAG_LABELS: Record<string, string> = {
  h1: 'Heading',
  h2: 'Heading',
  h3: 'Heading',
  h4: 'Heading',
  h5: 'Heading',
  h6: 'Heading',
  p: 'Text',
  span: 'Text',
  strong: 'Text',
  em: 'Text',
  a: 'Link',
  img: 'Picture',
  figure: 'Picture',
  section: 'Section',
  nav: 'Menu',
  header: 'Header',
  footer: 'Footer',
  main: 'Main area',
  article: 'Article',
  aside: 'Side panel',
  ul: 'List',
  ol: 'List',
  li: 'List item',
  button: 'Button',
  form: 'Form',
  input: 'Field',
  textarea: 'Field',
  select: 'Field',
  label: 'Field label',
  table: 'Table',
  video: 'Video',
  blockquote: 'Quote',
  div: 'Group',
};

const TAG_ICONS: Record<string, string> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  p: 'text',
  span: 'text',
  strong: 'text',
  em: 'text',
  a: 'link',
  img: 'image',
  figure: 'image',
  section: 'section',
  nav: 'nav',
  header: 'header',
  footer: 'footer',
  main: 'main',
  article: 'article',
  aside: 'aside',
  ul: 'list',
  ol: 'list',
  li: 'item',
  button: 'button',
  form: 'form',
  input: 'input',
  textarea: 'textarea',
  select: 'select',
  label: 'label',
  table: 'table',
  video: 'video',
  blockquote: 'quote',
};

/** The words a node holds, if it holds words rather than more nodes. */
function ownText(node: AddressableNode): string | undefined {
  const children = node.children ?? [];
  if (!children.length || children.some(isNodeChild)) return undefined;
  const text = children
    .filter((c): c is string => typeof c === 'string')
    .join(' ')
    .trim();
  return text || undefined;
}

function truncate(text: string, max = 40): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Breakpoint-prefixed utilities, with or without silica's container-query `@`. */
const HIDDEN_FROM = /^@?(sm|md|lg|xl|2xl):hidden$/;
const SHOWN_FROM =
  /^@?(sm|md|lg|xl|2xl):(flex|block|grid|inline|inline-flex|inline-block|table|contents)$/;

/**
 * Which screens a node is for, when its classes say it is for only some.
 *
 * The header stores its menu TWICE — the row for wider screens, and the panel
 * behind the hamburger — as separate nodes holding separate copies of every
 * link. Both fell through to the same tag label, so Layers showed two rows
 * called "Menu", and neither is on the canvas at the width you are previewing:
 * one is hidden by its classes, the other is a closed panel. An owner who
 * repointed a link repointed one of them, published, and left the phone menu on
 * the old destination with nothing to tell her (issue 269).
 *
 * A row an author cannot see on the canvas has to say why it is not there.
 */
function screenSuffix(cls: string | undefined): string {
  if (!cls) return '';
  const words = cls.split(/\s+/);
  const hiddenFrom = words.some((w) => HIDDEN_FROM.test(w));
  const shownFrom = words.includes('hidden') && words.some((w) => SHOWN_FROM.test(w));
  if (hiddenFrom === shownFrom) return '';
  return hiddenFrom ? ' on a phone' : ' on a bigger screen';
}

/**
 * What a row calls a node.
 *
 * `symbolName` is the master's own name, for an instance. Without it every saved
 * piece on the page reads "Saved design", so an author who named hers "Send me a
 * message" watched the name she had just typed be replaced by a category — and a
 * page holding three different pieces showed three identical rows (issue 395).
 * The name is already in the session's symbol map, which is where the canvas
 * draws the design from; only this had no way to ask for it.
 *
 * It stays optional and still falls back: a master that has not loaded, or one
 * that has been deleted, has no name to show and "Saved design" is then the
 * honest answer rather than a blank.
 */
export function rowLabel(node: AddressableNode, symbolName?: string): string {
  if (node.label) return node.label;
  if (node.instanceOf) return symbolName ?? 'Saved design';
  const text = ownText(node);
  if (text) return truncate(text);
  if (node.kind === 'component') return node.component;
  // A live region's registry name, never its key. `commerce.product-reviews` in a
  // list of rows called "Product name" and "Shipping & delivery" reads as something
  // that leaked, and it was in the Inspector's identity header too — this function
  // feeds both. An unregistered key still falls through to itself: that is a
  // half-built core rather than a naming problem, and hiding it would hide the bug.
  if (node.kind === 'host') return HOST_LABELS[node.component] ?? node.component;
  return (TAG_LABELS[node.tag.toLowerCase()] ?? 'Group') + screenSuffix(node.class);
}

export function rowIcon(node: AddressableNode): string {
  if (node.instanceOf) return 'shared';
  if (node.kind === 'host') return 'zap';
  if (node.kind === 'component') return TAG_ICONS[node.component.toLowerCase()] ?? 'box';
  const byTag = TAG_ICONS[node.tag.toLowerCase()];
  if (byTag) return byTag;
  // A bare box is more legible as what it DOES than as what it is.
  if (/\bgrid\b/.test(node.class ?? '')) return 'grid';
  if (/\bflex\b/.test(node.class ?? '')) return 'stack';
  return 'box';
}

/**
 * Is this node nothing but a wrapper holding a layout?
 *
 * Everything in the list is a reason an author would want to find it again: a
 * name they gave it, words it holds, data it draws, a behavior, a saved design,
 * a lock. Without one of those, a `div` is scaffolding.
 */
export function isLayoutWrapper(node: AddressableNode): boolean {
  if (node.kind !== 'element') return false;
  if (!['div', 'span'].includes(node.tag.toLowerCase())) return false;
  if (node.label || node.data || node.behavior || node.instanceOf || node.locked) return false;
  if (ownText(node)) return false;
  return childNodes(node).length > 0;
}

export interface LayerOptions {
  depth: LayerDepth;
  /** Ids the author may edit; null means all of them. */
  editableIds?: Set<string> | null;
  /** Symbol id → the master's name, so an instance row wears the name its author
   *  gave it rather than the word "Saved design". Omit it and rows fall back. */
  symbolNames?: Readonly<Record<string, string>>;
}

/** The rows for a tree, parents before children. */
export function layerRows(root: Node, opts: LayerOptions): LayerRow[] {
  const rows: LayerRow[] = [];
  const editableIds = opts.editableIds ?? null;

  const visit = (node: Node, depth: number): void => {
    if (!isAddressable(node)) return;
    const children = childNodes(node);

    if (opts.depth === 'simple' && isLayoutWrapper(node) && depth > 0) {
      // Folded: no row, and its children lift into this level.
      for (const child of children) visit(child, depth);
      return;
    }

    if (node.id) {
      rows.push({
        id: node.id,
        label: rowLabel(node, node.instanceOf ? opts.symbolNames?.[node.instanceOf] : undefined),
        icon: rowIcon(node),
        depth,
        hasChildren: children.length > 0,
        locked: Boolean(node.locked),
        isInstance: Boolean(node.instanceOf),
        editable: editableIds === null || editableIds.has(node.id),
      });
    }

    // An instance's expansion is not this document's tree — editing it belongs to
    // the component pane, so it gets no rows here.
    if (node.instanceOf) return;
    for (const child of children) visit(child, depth + 1);
  };

  visit(root, 0);
  return rows;
}
