'use client';

// What the stock list cannot show, said out loud.
//
// The list is stock POSITIONS, and a version nobody has counted does not have
// one — so it is not a row that can be filtered in or out, it is a row that does
// not exist. The list's own header comment has always said so, and it asks the
// catalog when a search comes back EMPTY. The case it missed is the partial one:
// fifteen counted versions of a twenty-version shirt returned fifteen rows,
// reported "Showing 1-15 of 15", and said nothing about the other five
// (issue 444).
//
// That matters because a version becomes stock-managed by being COUNTED, not by
// existing. An uncounted one sells WITHOUT LIMIT however its "when you run out"
// setting reads — so the five nobody mentioned were on sale, unlimited, on a
// shop whose whole premise is twelve of a size.
//
// It is a band and not a chip on purpose. A chip is something you have to know
// to press, and the whole defect is not knowing.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
} from '@wizeworks/silicaui-react';

import type { SurfaceContext } from '../../lib/surfaces/registry';
import { listCodes, type UncountedVariant } from './data';

export function StockUncountedBand({
  ctx,
  items,
  total,
  searching,
}: {
  ctx: SurfaceContext;
  /** The first few, for naming. The server sends a small window on purpose. */
  items: UncountedVariant[];
  total: number;
  /** Whether a search is narrowing the list, so the sentence can say whether
   *  this is "your shop" or "what you looked for". */
  searching: boolean;
}) {
  if (total === 0 || items.length === 0) return null;

  // One product is the ordinary case — somebody has just added a colour or a
  // size to a shirt that already sells — and it is the one where a single button
  // finishes the job. Across products there is no one place to send them, so the
  // sentence says where to look instead of a button that guesses.
  const productIds = new Set(items.map((item) => item.productId));
  const onlyProduct = productIds.size === 1 && total <= items.length ? items[0] : null;

  return (
    <Alert color="info" variant="soft">
      <AlertContent>
        <AlertTitle>
          {total === 1
            ? '1 version you sell has never been counted'
            : `${String(total)} versions you sell have never been counted`}
        </AlertTitle>
        <AlertDescription>
          {searching
            ? 'Your search matched them, but this list only holds what you have counted, so they are not below.'
            : 'This list only holds what you have counted, so they are not below.'}{' '}
          {total === 1
            ? 'Until somebody counts it, your website sells it without limit.'
            : 'Until somebody counts them, your website sells them without limit.'}{' '}
          {listCodes(
            items.map((item) => item.sku),
            total
          )}{' '}
          {onlyProduct ? '' : 'Open the product each one belongs to and choose How many you have.'}
        </AlertDescription>
      </AlertContent>
      {onlyProduct ? (
        <Button
          size="sm"
          color="info"
          variant="soft"
          onClick={(event) => {
            ctx.open(
              'commerce.product.stock',
              { productId: onlyProduct.productId },
              { target: event.shiftKey ? 'tab' : 'beside' }
            );
          }}
        >
          Count them
        </Button>
      ) : null}
    </Alert>
  );
}
