'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Check, GripVertical, Plus, X } from 'lucide-react';

import { Badge, Button, Input, Stack, Text } from '@sparx/ui';

import { setCollectionProductsAction } from '../../../collection-actions';

interface ProductBrief {
  id: string;
  title: string;
  handle: string;
  status: string;
  vendor: string | null;
}

interface Props {
  collectionId: string;
  type: 'manual' | 'rules';
  selectedProductIds: string[];
  allProducts: ProductBrief[];
}

// Membership editor for a single collection.
//   • Manual collections: add/remove/reorder products; submit replaces the
//     membership atomically via setProducts.
//   • Rules collections: read-only list of currently-projected products;
//     no add/remove (the indexer worker owns membership).

export function CollectionMembershipEditor({
  collectionId,
  type,
  selectedProductIds,
  allProducts,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [filter, setFilter] = React.useState('');
  const [ids, setIds] = React.useState<string[]>(selectedProductIds);

  const productsById = React.useMemo(() => {
    const map = new Map<string, ProductBrief>();
    for (const p of allProducts) map.set(p.id, p);
    return map;
  }, [allProducts]);

  const selectedRows = ids
    .map((id) => productsById.get(id))
    .filter((p): p is ProductBrief => p !== undefined);

  const remaining = allProducts
    .filter((p) => !ids.includes(p.id))
    .filter((p) =>
      filter.length === 0
        ? true
        : `${p.title} ${p.handle} ${p.vendor ?? ''}`.toLowerCase().includes(filter.toLowerCase())
    )
    .slice(0, 100);

  function add(productId: string) {
    setIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
  }
  function remove(productId: string) {
    setIds((prev) => prev.filter((id) => id !== productId));
  }
  function move(productId: string, direction: -1 | 1) {
    setIds((prev) => {
      const idx = prev.indexOf(productId);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }

  function save() {
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const result = await setCollectionProductsAction({
        collectionId,
        productIds: ids,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  if (type === 'rules') {
    return (
      <Stack gap={3}>
        {selectedRows.length === 0 ? (
          <Stack
            gap={2}
            align="center"
            className="rounded border border-dashed border-[var(--color-border-default)] p-6 text-center"
          >
            <Text size="sm" variant="muted">
              The rule hasn&apos;t projected any products yet. The indexer worker re-evaluates on
              its next tick (Phase 1.5).
            </Text>
          </Stack>
        ) : (
          <Stack gap={1}>
            {selectedRows.map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
          </Stack>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <Stack gap={2}>
        <Text size="sm" weight="medium">
          In this collection ({selectedRows.length})
        </Text>
        {selectedRows.length === 0 ? (
          <Stack
            gap={1}
            align="center"
            className="rounded border border-dashed border-[var(--color-border-default)] p-6 text-center"
          >
            <Text size="sm" variant="muted">
              Add products from the picker below.
            </Text>
          </Stack>
        ) : (
          <Stack gap={1}>
            {selectedRows.map((p, idx) => (
              <Stack
                key={p.id}
                direction="row"
                align="center"
                gap={2}
                className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2"
              >
                <GripVertical className="h-4 w-4 text-[var(--color-text-muted)]" aria-hidden />
                <Stack gap={0} className="flex-1">
                  <Text size="sm" weight="medium">
                    {p.title}
                  </Text>
                  <Text size="xs" variant="muted">
                    /{p.handle}
                    {p.vendor ? ` · ${p.vendor}` : ''}
                  </Text>
                </Stack>
                <Badge variant="outline" className="text-xs">
                  {p.status}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(p.id, -1)}
                  disabled={pending || idx === 0}
                  aria-label={`Move ${p.title} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => move(p.id, 1)}
                  disabled={pending || idx === selectedRows.length - 1}
                  aria-label={`Move ${p.title} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(p.id)}
                  disabled={pending}
                  leftIcon={<X className="h-3.5 w-3.5" />}
                  aria-label={`Remove ${p.title}`}
                >
                  Remove
                </Button>
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>

      <Stack gap={2}>
        <Text size="sm" weight="medium">
          Add products
        </Text>
        <Input
          placeholder="Filter by title, handle, or vendor"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {remaining.length === 0 ? (
          <Text size="sm" variant="muted">
            {allProducts.length === selectedRows.length
              ? 'Every product is already in this collection.'
              : 'No matches.'}
          </Text>
        ) : (
          <Stack gap={1}>
            {remaining.map((p) => (
              <Stack
                key={p.id}
                direction="row"
                align="center"
                gap={2}
                className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-3 py-2"
              >
                <Stack gap={0} className="flex-1">
                  <Text size="sm">{p.title}</Text>
                  <Text size="xs" variant="muted">
                    /{p.handle}
                    {p.vendor ? ` · ${p.vendor}` : ''}
                  </Text>
                </Stack>
                <Badge variant="outline" className="text-xs">
                  {p.status}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => add(p.id)}
                  disabled={pending}
                  leftIcon={<Plus className="h-3.5 w-3.5" />}
                >
                  Add
                </Button>
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>

      {error && (
        <Text size="sm" variant="danger" role="alert" aria-live="polite">
          {error}
        </Text>
      )}

      <Stack direction="row" justify="end" align="center" gap={2}>
        {savedAt !== null && (
          <Stack
            direction="row"
            align="center"
            gap={1}
            className="text-[var(--color-text-success)]"
          >
            <Check className="h-4 w-4" />
            <Text size="sm">Saved</Text>
          </Stack>
        )}
        <Button type="button" color="module" onClick={save} disabled={pending} loading={pending}>
          Save membership
        </Button>
      </Stack>
    </Stack>
  );
}

function ProductRow({ product }: { product: ProductBrief }) {
  return (
    <Stack
      direction="row"
      align="center"
      gap={2}
      className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2"
    >
      <Stack gap={0} className="flex-1">
        <Text size="sm" weight="medium">
          {product.title}
        </Text>
        <Text size="xs" variant="muted">
          /{product.handle}
          {product.vendor ? ` · ${product.vendor}` : ''}
        </Text>
      </Stack>
      <Badge variant="outline" className="text-xs">
        {product.status}
      </Badge>
    </Stack>
  );
}
