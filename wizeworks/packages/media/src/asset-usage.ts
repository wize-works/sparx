// Where a picture is actually used — counted, never remembered (issue 381).
//
// `media_assets.usage_count` is a denormalised column that NOTHING has ever
// written. It defaults to 0 and stays 0, and three separate things trusted it:
//
//   · the library screen's "Used in" fact, which read "Not used anywhere yet"
//     over 37 of Devi's 87 pictures while they were on her live product pages
//     (2,406 across the whole database);
//   · both delete guards (`if (usageCount > 0) refuse`), which therefore could
//     never fire, so the console would let an owner delete a photograph that is
//     on a product page and say nothing;
//   · the media GC's eligibility test, which only hard-deletes rows already
//     soft-deleted — so the false counter turned the one thing standing between
//     a live photo and permanent deletion into a formality.
//
// The tests passed the whole time because they MOCK the count (`usageCount: 3`),
// proving the guard works when the number is right and never that it is.
//
// So this counts. A number computed from the rows that hold the references
// cannot drift from them, which a denormalised column maintained by hand at five
// call sites certainly would.

import type { TxClient } from '@wizeworks/db';

/** What is using an asset, and how many of each. Only the sources that can be
 *  ANSWERED are counted — see `UNCOUNTED` below, which is why `total` is a
 *  floor rather than a complete tally. */
export interface AssetUsage {
  /** CMS entries whose body references it (`content_references`, kept by
   *  `syncReferences` on every entry write). */
  content: number;
  /** Product and variant photographs (`commerce_variant_images`). */
  products: number;
  /** Customer profile photos and files attached to a customer. */
  customers: number;
  /** Author byline avatars. */
  authors: number;
  /** Staff document attachments. */
  staffDocuments: number;
  /** Receipts and bills attached to an expense. */
  expenses: number;
  /** The sum, which is what a guard and a screen both want. */
  total: number;
}

const EMPTY: AssetUsage = {
  content: 0,
  products: 0,
  customers: 0,
  authors: 0,
  staffDocuments: 0,
  expenses: 0,
  total: 0,
};

/** A builder page stores asset ids INSIDE its silica tree as plain JSON, with no
 *  reference table beside it, so it cannot be counted without scanning every
 *  tree on every read. It is deliberately out of scope here and is the reason
 *  callers must treat `total` as "at least this many" rather than "exactly".
 *
 *  Measured on Juniper Row while this was written: 1 of her 87 assets appears in
 *  a builder tree, against 40 in products and 17 in CMS bodies — so the gap is
 *  real and small. Closing it wants a reference index for builder pages, which
 *  is its own piece of work. */
export const UNCOUNTED = 'builder page trees';

/** Usage for a set of assets, as a map keyed by asset id. Assets with no
 *  references are present with zeroes rather than absent, so a caller never has
 *  to tell "not used" apart from "not asked about".
 *
 *  Seven grouped queries for the whole set, not one per asset — this runs on the
 *  media library's list route, which pages 50 at a time. */
export async function countAssetUsage(
  tx: TxClient,
  assetIds: readonly string[]
): Promise<Map<string, AssetUsage>> {
  const usage = new Map<string, AssetUsage>();
  if (assetIds.length === 0) return usage;

  const ids = [...new Set(assetIds)];
  for (const id of ids) usage.set(id, { ...EMPTY });

  const bump = (id: string | null, field: keyof Omit<AssetUsage, 'total'>, n: number) => {
    if (!id) return;
    const row = usage.get(id);
    if (!row) return;
    row[field] += n;
    row.total += n;
  };

  const [content, products, avatars, customerDocs, authors, staffDocuments, expenses] =
    await Promise.all([
      tx.contentReference.groupBy({
        by: ['toAssetId'],
        where: { toAssetId: { in: ids } },
        _count: { _all: true },
      }),
      tx.variantImage.groupBy({
        by: ['mediaAssetId'],
        where: { mediaAssetId: { in: ids } },
        _count: { _all: true },
      }),
      tx.customer.groupBy({
        by: ['avatarMediaAssetId'],
        where: { avatarMediaAssetId: { in: ids } },
        _count: { _all: true },
      }),
      tx.customerDocument.groupBy({
        by: ['mediaAssetId'],
        where: { mediaAssetId: { in: ids } },
        _count: { _all: true },
      }),
      tx.author.groupBy({
        by: ['avatarAssetId'],
        where: { avatarAssetId: { in: ids } },
        _count: { _all: true },
      }),
      tx.staffDocument.groupBy({
        by: ['assetId'],
        where: { assetId: { in: ids } },
        _count: { _all: true },
      }),
      tx.financeExpenseAttachment.groupBy({
        by: ['assetId'],
        where: { assetId: { in: ids } },
        _count: { _all: true },
      }),
    ]);

  for (const r of content) bump(r.toAssetId, 'content', r._count._all);
  for (const r of products) bump(r.mediaAssetId, 'products', r._count._all);
  for (const r of avatars) bump(r.avatarMediaAssetId, 'customers', r._count._all);
  for (const r of customerDocs) bump(r.mediaAssetId, 'customers', r._count._all);
  for (const r of authors) bump(r.avatarAssetId, 'authors', r._count._all);
  for (const r of staffDocuments) bump(r.assetId, 'staffDocuments', r._count._all);
  for (const r of expenses) bump(r.assetId, 'expenses', r._count._all);

  return usage;
}

/** Usage for one asset — the shape both delete guards want. */
export async function countOneAssetUsage(tx: TxClient, assetId: string): Promise<AssetUsage> {
  const map = await countAssetUsage(tx, [assetId]);
  return map.get(assetId) ?? { ...EMPTY };
}

/** "3 products and 1 page", for a refusal a person has to act on. An owner told
 *  only "still referenced by 4 entries" has nowhere to go; naming the KINDS tells
 *  them which screen to open to detach it. */
export function describeUsage(usage: AssetUsage): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${String(n)} ${n === 1 ? one : many}`);
  };
  add(usage.products, 'product photo', 'product photos');
  add(usage.content, 'page or article', 'pages and articles');
  add(usage.customers, 'customer record', 'customer records');
  add(usage.authors, 'author profile', 'author profiles');
  add(usage.staffDocuments, 'staff document', 'staff documents');
  add(usage.expenses, 'expense', 'expenses');
  if (parts.length === 0) return 'nothing';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)!}`;
}
