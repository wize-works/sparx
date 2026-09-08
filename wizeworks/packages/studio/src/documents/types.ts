// The five documents, shaped the way the store shapes them.
//
// A theme, a layout and a page are three documents with three lifecycles — three
// tables, three draft/published pairs, three `published_at` columns. They are not
// slices of one site: a page INHERITS a layout, a layout INHERITS a theme, and a
// theme is tenant-wide and reusable across sites. Modelling them as one blob is
// what forces a whole-site save and makes two open editors two rival drafts.
//
// The trees themselves stay silica's (`@wizeworks/silicaui-html`), so a document
// edited here publishes to exactly the markup the storefront already renders.

import type { Node, Theme } from '@wizeworks/silicaui-html';
import type { EmailDocument as SilicaEmailDocument } from '@wizeworks/silicaui-builder/email';

export type DocumentKind = 'theme' | 'layout' | 'page' | 'component' | 'email';

/** Which document, in a form a pane can carry in its params and a map can key on. */
export interface DocumentRef {
  kind: DocumentKind;
  id: string;
}

/** The map key for a ref. One string, so a session can hold every open document
 *  in one `Map` without nesting by kind. */
export function docKey(ref: DocumentRef): string {
  return `${ref.kind}:${ref.id}`;
}

export interface DocumentBase {
  id: string;
  name: string;
  /**
   * The server revision this draft was loaded at, sent back on save so a stale
   * write is refused rather than applied. It is NOT a version number the author
   * ever sees — history is its own surface.
   */
  rev: number;
  /** When this document was last published; null until the first publish. */
  publishedAt: string | null;
  /** The server's answer at load: does the SAVED draft differ from the published
   *  copy? Distinct from the session's own `dirty`, which is unsaved local work. */
  unpublished: boolean;
}

/** Where a theme came from — and, for `system`, why it cannot be edited. */
export type ThemeOrigin = 'system' | 'tenant' | 'marketplace';

export interface ThemeDoc extends DocumentBase {
  kind: 'theme';
  origin: ThemeOrigin;
  /** Null on a system theme: every tenant reads it and none may write it. */
  tenantId: string | null;
  /** The listing this was installed from, when `origin` is `marketplace`. */
  marketplaceThemeId: string | null;
  marketplaceVersion: string | null;
  theme: Theme;
}

export interface LayoutDoc extends DocumentBase {
  kind: 'layout';
  propertyId: string;
  /** The chrome tree. Carries exactly one Outlet, which is where the page goes. */
  root: Node;
}

/**
 * Which chrome wraps a page — three states in one field, mirroring
 * `builder_pages.frame_id`:
 *   `null`   the site's layout (what nearly every page does)
 *   `'none'` no chrome at all — the bare campaign or landing page
 *   an id    that specific layout
 */
export type FrameChoice = string | null;

/** The sentinel meaning "render this page with no chrome". */
export const NO_FRAME = 'none';

export interface PageSeo {
  title: string | null;
  description: string | null;
  canonical: string | null;
  ogImage: string | null;
  noindex: boolean;
}

export interface PageDoc extends DocumentBase {
  kind: 'page';
  propertyId: string;
  /** The route a published singleton serves at. Null for collection templates,
   *  which render per record, and for pages that are not routed. */
  slug: string | null;
  pageKind: 'singleton' | 'collection';
  /** Collection only — the content type each record fills, e.g. `commerce.product`. */
  recordType: string | null;
  recordSubtype: string | null;
  /** Collection only — the winner for `recordType` when a record names no template. */
  isDefault: boolean;
  frame: FrameChoice;
  seo: PageSeo;
  root: Node;
}

export interface ComponentDoc extends DocumentBase {
  kind: 'component';
  /** Site-scoped, matching `builder_sites.silica_draft_symbols`: a saved piece
   *  belongs to the site that uses it, not to a layout. */
  propertyId: string;
  /** The master tree. Instances across pages and the layout expand from this. */
  root: Node;
  /** The author's own note — "what it's for", in her words. The manage screen
   *  promises it appears "in this list and in the editor's Add panel", so it has
   *  to travel with the document: `symbols()` narrows a piece to what the CANVAS
   *  needs, and the Insert rail reads it back through `pieceNote`. Null when she
   *  has not written one, and absent entirely for a site-owned piece, whose store
   *  has nowhere to keep it. */
  note?: string | null;
}

export interface EmailDoc extends DocumentBase {
  kind: 'email';
  /** silica's own email document — subject, preheader and the body tree. Its node
   *  vocabulary is not the site's, which is why email runs its own session. */
  document: SilicaEmailDocument;
}

export type StudioDoc = ThemeDoc | LayoutDoc | PageDoc | ComponentDoc | EmailDoc;

/** The documents whose content is a silica node tree. Theme is the one that is not. */
export type TreeDoc = LayoutDoc | PageDoc | ComponentDoc;

export function isTreeDoc(doc: StudioDoc): doc is TreeDoc {
  return doc.kind === 'layout' || doc.kind === 'page' || doc.kind === 'component';
}

/**
 * May this document be edited at all?
 *
 * Only system themes answer false. They are shipped by the platform, shared by
 * every tenant, and have no owning tenant to write back to — so the editor offers
 * "duplicate to make it yours" rather than a disabled canvas with no explanation.
 */
export function isEditable(doc: StudioDoc): boolean {
  return !(doc.kind === 'theme' && doc.origin === 'system');
}

export function refOf(doc: StudioDoc): DocumentRef {
  return { kind: doc.kind, id: doc.id };
}
