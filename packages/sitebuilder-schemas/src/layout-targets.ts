// Layout-target registry (docs/36 §4, docs/handoffs/sitebuilder-pb-spec.md).
//
// A "layout target" is an addressable KIND of page a PageLayout can be authored
// for and assigned to — the data-driven generalization of the old fixed `scope`
// enum. Modules DECLARE their targets to Site Builder (a code-level provider, the
// §12.4 lean); Site Builder consumes the registry and stores layouts keyed by an
// opaque, namespaced target id. A new module's page kinds arrive by registering
// here — with ZERO Site Builder schema change.
//
// Grammar (doc 36 §4.2, resolved in the P-B spec §2): `<module>:<kind>[:<key>]`,
// lowercase. Static targets are one-per-kind (`commerce:product`); data-driven
// targets are one per data record — a CMS content type registers
// `cms:content-type:<contentTypeId>`, keyed by the stable id so a rename never
// re-keys layouts.

import { z } from 'zod';

/** Static = one layout-kind, declared as a constant. Data-driven = one per data
 *  record (e.g. a CMS content type), produced by a factory. */
export type TargetKind = 'static' | 'data-driven';

/** The data context a bound section resolves against on a target. A target that
 *  declares a binding can host bound sections of the same binding; a section with
 *  no binding (static) is allowed in every target. */
export type TargetBinding = 'product' | 'collection';

export interface LayoutTarget {
  /** Canonical namespaced id, e.g. `commerce:product`, `cms:content-type:<id>`. */
  id: string;
  /** Declaring module — `commerce` | `cms` | `site` | (future) `b2b`. */
  module: string;
  /** Humanized name for the editor (a PageLayout's default name when unnamed). */
  label: string;
  kind: TargetKind;
  /** Set iff the target supplies bound-section data (PDP → product, PLP → collection). */
  binding?: TargetBinding;
  /** Whether a code-defined default Page Template exists for this target (DEFAULT_TEMPLATES). */
  hasDefaultTemplate?: boolean;
}

// The near-term static catalog — today's scopes, renamed to namespaced ids.
// `site:home` stays a distinct target (the §7 home-as-content-page collapse is
// deferred to P-D). `cms:content-page` absorbs the old redundant `cms-page` +
// `custom` (both were "standalone page keyed by slug").
export const STATIC_LAYOUT_TARGETS: readonly LayoutTarget[] = [
  { id: 'site:home', module: 'site', label: 'Home', kind: 'static' },
  {
    id: 'commerce:product',
    module: 'commerce',
    label: 'Product page',
    kind: 'static',
    binding: 'product',
    hasDefaultTemplate: true,
  },
  {
    id: 'commerce:collection',
    module: 'commerce',
    label: 'Collection page',
    kind: 'static',
    binding: 'collection',
    hasDefaultTemplate: true,
  },
  { id: 'cms:content-page', module: 'cms', label: 'Page', kind: 'static' },
] as const;

const STATIC_BY_ID: ReadonlyMap<string, LayoutTarget> = new Map(
  STATIC_LAYOUT_TARGETS.map((t) => [t.id, t])
);

const CONTENT_TYPE_PREFIX = 'cms:content-type:';

/** The data-driven target id for a CMS content type (keyed by its stable id). */
export function cmsContentTypeTargetId(contentTypeId: string): string {
  return `${CONTENT_TYPE_PREFIX}${contentTypeId}`;
}

/** A data-driven layout target for a CMS content type. Called by the SB layer at
 *  runtime, fed by CMS content-type rows (no code-time CMS coupling). */
export function cmsContentTypeTarget(contentTypeId: string, label: string): LayoutTarget {
  return { id: cmsContentTypeTargetId(contentTypeId), module: 'cms', label, kind: 'data-driven' };
}

export function isContentTypeTargetId(id: string): boolean {
  return id.startsWith(CONTENT_TYPE_PREFIX) && id.length > CONTENT_TYPE_PREFIX.length;
}

/** Resolve a target descriptor by id. Static targets come from the catalog;
 *  a well-formed `cms:content-type:<id>` resolves to a generic data-driven
 *  descriptor (the real per-type label is supplied by the SB layer when it knows
 *  the content type). Unknown ids → undefined. */
export function getLayoutTarget(id: string): LayoutTarget | undefined {
  const stat = STATIC_BY_ID.get(id);
  if (stat) return stat;
  if (isContentTypeTargetId(id)) {
    return { id, module: 'cms', label: 'Content page', kind: 'data-driven' };
  }
  return undefined;
}

export function isLayoutTargetId(value: string): boolean {
  return getLayoutTarget(value) !== undefined;
}

/** Humanized default name for a (targetId, key): a named/slug page uses its key,
 *  a target's single default layout uses the target label. */
export function defaultLayoutName(targetId: string, key: string): string {
  if (key !== 'default') return key;
  return getLayoutTarget(targetId)?.label ?? key;
}

// A namespaced target id for write inputs. Validates the grammar, NOT membership
// (data-driven ids are open-ended): `<module>:<kind>[:<key>]`.
export const TargetId = z
  .string()
  .min(1)
  .max(63)
  .regex(
    /^[a-z][a-z0-9]*:[a-z0-9-]+(:[A-Za-z0-9._-]+)?$/,
    'Expected a namespaced target id, e.g. commerce:product'
  );
export type TargetId = z.infer<typeof TargetId>;
