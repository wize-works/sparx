'use client';

// Interactive PDP core. Holds the option selection, resolves the matching
// variant, and keeps the gallery, price, stock, and add-to-cart button in
// sync. Server-loaded product data comes in via props; all interactivity is
// client-side with no further fetches until "add to cart".

import { useMemo, useState } from 'react';

import { formatMoney, formatPriceRange } from '@/lib/format';
import { mediaUrl } from '@/lib/media';
import type { PublicProduct, PublicProductVariant } from '@/lib/commerce';
import { useCart } from './cart-provider';

export interface ProductDetailProps {
  product: PublicProduct;
  tenantSlug: string;
  currency: string;
  locale: string;
  showStockBelow: number;
}

// True when a variant's option assignment matches every currently-selected
// option value. Partial selections match any variant consistent so far.
function variantMatches(variant: PublicProductVariant, selected: Record<string, string>): boolean {
  const chosen = Object.values(selected);
  return chosen.every((valueId) => variant.optionValueIds.includes(valueId));
}

export function ProductDetail({
  product,
  tenantSlug,
  currency,
  locale,
  showStockBelow,
}: ProductDetailProps) {
  const { addItem } = useCart();

  // Default selection: the default variant's option values (so a single-variant
  // product is immediately purchasable).
  const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0];
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (defaultVariant) {
      for (const opt of product.options) {
        const match = opt.values.find((val) => defaultVariant.optionValueIds.includes(val.id));
        if (match) init[opt.id] = match.id;
      }
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [activeImageId, setActiveImageId] = useState<string | null>(
    product.images[0]?.id ?? null
  );

  const allSelected = product.options.length === 0 || Object.keys(selected).length === product.options.length;

  const resolvedVariant = useMemo<PublicProductVariant | null>(() => {
    if (product.variants.length === 1) return product.variants[0] ?? null;
    if (!allSelected) return null;
    return product.variants.find((v) => variantMatches(v, selected) && v.optionValueIds.length === Object.keys(selected).length) ?? null;
  }, [product.variants, selected, allSelected]);

  // Availability per option value: a value is selectable if some variant with
  // that value (consistent with other current selections) is in stock-or-orderable.
  const valueAvailable = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const opt of product.options) {
      for (const val of opt.values) {
        const trial = { ...selected, [opt.id]: val.id };
        map[val.id] = product.variants.some((v) => variantMatches(v, trial) && v.inStock);
      }
    }
    return map;
  }, [product.options, product.variants, selected]);

  // Gallery: prefer images tied to the resolved variant, then to selected
  // option values, then the full set.
  const galleryImages = useMemo(() => {
    if (resolvedVariant) {
      const byVariant = product.images.filter((img) => img.variantId === resolvedVariant.id);
      if (byVariant.length) return byVariant;
    }
    const selectedValueIds = Object.values(selected);
    const byOption = product.images.filter((img) =>
      img.optionValueIds.some((id) => selectedValueIds.includes(id))
    );
    if (byOption.length) return byOption;
    return product.images;
  }, [product.images, resolvedVariant, selected]);

  const activeImage =
    galleryImages.find((i) => i.id === activeImageId) ?? galleryImages[0] ?? null;

  const priceCents = resolvedVariant?.priceCents ?? product.priceMinCents ?? 0;
  const compareAt = resolvedVariant?.compareAtPriceCents ?? null;
  const onSale = compareAt != null && compareAt > priceCents;

  const inStock = resolvedVariant ? resolvedVariant.inStock : product.inStock;
  const available = resolvedVariant?.available ?? null;
  const lowStock = available != null && available > 0 && available <= showStockBelow;

  function selectValue(optionId: string, valueId: string) {
    setSelected((prev) => ({ ...prev, [optionId]: valueId }));
    // Switch gallery to a matching image if one exists.
    const linked = product.images.find((img) => img.optionValueIds.includes(valueId));
    if (linked) setActiveImageId(linked.id);
  }

  async function handleAdd() {
    if (!resolvedVariant || !resolvedVariant.inStock) return;
    setAdding(true);
    try {
      await addItem(resolvedVariant.id, qty);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="sf-pdp">
      {/* Gallery */}
      <div className="sf-gallery">
        <div className="sf-gallery__main">
          {activeImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- cross-origin media via api-rest redirect
            <img
              src={mediaUrl(activeImage.mediaAssetId, tenantSlug) ?? ''}
              alt={activeImage.alt ?? product.title}
            />
          ) : (
            <div className="sf-card__media--empty" style={{ height: '100%' }} aria-hidden="true">
              <span style={{ fontSize: '3rem' }}>◳</span>
            </div>
          )}
        </div>
        {galleryImages.length > 1 ? (
          <div className="sf-gallery__thumbs">
            {galleryImages.map((img) => (
              <button
                key={img.id}
                type="button"
                className="sf-thumb"
                aria-current={img.id === activeImage?.id}
                aria-label={img.alt ?? 'Product image'}
                onClick={() => setActiveImageId(img.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- cross-origin media via api-rest redirect */}
                <img src={mediaUrl(img.mediaAssetId, tenantSlug) ?? ''} alt="" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Info */}
      <div className="sf-pdp__info">
        {product.vendor ? <span className="sf-card__vendor">{product.vendor}</span> : null}
        <h1 className="sf-h1" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.25rem)' }}>
          {product.title}
        </h1>

        <div className="sf-pdp__price">
          {resolvedVariant
            ? formatMoney(priceCents, currency, locale)
            : formatPriceRange(product.priceMinCents, product.priceMaxCents, currency, locale)}
          {onSale ? (
            <span className="sf-card__compare" style={{ fontSize: '1rem' }}>
              {formatMoney(compareAt!, currency, locale)}
            </span>
          ) : null}
        </div>

        <StockLine inStock={inStock} lowStock={lowStock} available={available} />

        {/* Options */}
        {product.options.map((opt) => {
          const isSwatch = opt.displayType === 'swatch' || opt.values.some((v) => v.swatchHex);
          return (
            <div key={opt.id} className="sf-option">
              <span className="sf-option__label">
                {opt.name}
                {selected[opt.id] ? (
                  <span className="sf-muted" style={{ fontWeight: 400, marginLeft: '0.4rem' }}>
                    {opt.values.find((v) => v.id === selected[opt.id])?.value}
                  </span>
                ) : null}
              </span>
              <div className="sf-option__values">
                {opt.values.map((val) => {
                  const isSelected = selected[opt.id] === val.id;
                  const disabled = !valueAvailable[val.id];
                  return isSwatch && val.swatchHex ? (
                    <button
                      key={val.id}
                      type="button"
                      className="sf-swatch"
                      style={{ background: val.swatchHex }}
                      aria-pressed={isSelected}
                      aria-label={val.value}
                      disabled={disabled}
                      onClick={() => selectValue(opt.id, val.id)}
                    />
                  ) : (
                    <button
                      key={val.id}
                      type="button"
                      className="sf-chip"
                      aria-pressed={isSelected}
                      disabled={disabled}
                      onClick={() => selectValue(opt.id, val.id)}
                    >
                      {val.value}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Quantity + add to cart */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="sf-qty">
            <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              −
            </button>
            <input
              type="number"
              min={1}
              value={qty}
              aria-label="Quantity"
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            />
            <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => q + 1)}>
              +
            </button>
          </div>
          <button
            type="button"
            className="sf-btn sf-btn--primary sf-btn--lg"
            style={{ flex: 1, minWidth: '200px' }}
            disabled={!resolvedVariant || !inStock || adding}
            onClick={handleAdd}
          >
            {!allSelected
              ? 'Select options'
              : !inStock
                ? 'Sold out'
                : adding
                  ? 'Adding…'
                  : 'Add to cart'}
          </button>
        </div>

        {resolvedVariant?.sku ? (
          <span className="sf-muted" style={{ fontSize: '0.82rem' }}>
            SKU: {resolvedVariant.sku}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StockLine({
  inStock,
  lowStock,
  available,
}: {
  inStock: boolean;
  lowStock: boolean;
  available: number | null;
}) {
  if (!inStock) {
    return (
      <span className="sf-stock sf-stock--out">
        <span className="sf-stock__dot" />
        Out of stock
      </span>
    );
  }
  if (lowStock && available != null) {
    return (
      <span className="sf-stock sf-stock--low">
        <span className="sf-stock__dot" />
        Only {available} left
      </span>
    );
  }
  return (
    <span className="sf-stock">
      <span className="sf-stock__dot" />
      In stock
    </span>
  );
}
