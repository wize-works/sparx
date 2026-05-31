'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, ChevronDown, ChevronRight, Plus } from 'lucide-react';

import { Badge, Button, Input, Label, Stack, Text } from '@sparx/ui';

import {
  createFitmentCategoryAction,
  createFitmentItemAction,
  createFitmentVariantAction,
  listFitmentCategoriesAction,
  listFitmentItemsAction,
  listFitmentVariantsAction,
} from '../../fitment-actions';

interface DomainLabels {
  l1: string;
  l2?: string;
  l3?: string;
  range?: string;
}

interface DomainRow {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  iconKey: string | null;
  labels: DomainLabels;
  rangeUnit: string | null;
  isGlobal: boolean;
  categoryCount: number;
}

interface CategoryRow {
  id: string;
  domainId: string;
  name: string;
  slug: string;
  isGlobal: boolean;
  itemCount: number;
}

interface ItemRow {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  isGlobal: boolean;
  variantCount: number;
}

interface VariantRow {
  id: string;
  itemId: string;
  name: string;
  slug: string;
  attributes: Record<string, unknown>;
  isGlobal: boolean;
}

interface Props {
  domains: DomainRow[];
}

// Lazy-loaded fitment tree: expanding a domain fetches its categories;
// expanding a category fetches its items; expanding an item fetches its
// variants. Avoids fanning out a single huge query on page-load (a
// fully seeded vehicle dictionary can be 1000+ items + 5000+ variants)
// while letting merchants browse incrementally. Labels (Make/Model/
// Engine, Brand/Model, Species/Breed) come from the domain so the same
// component renders the right vocabulary per vertical.

export function FitmentReferenceEditor({ domains }: Props) {
  return (
    <Stack gap={2}>
      {domains.map((domain) => (
        <DomainRowComponent key={domain.id} domain={domain} />
      ))}
    </Stack>
  );
}

function DomainRowComponent({ domain }: { domain: DomainRow }) {
  const [expanded, setExpanded] = React.useState(false);
  const [categories, setCategories] = React.useState<CategoryRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && categories === null) {
      setLoading(true);
      try {
        const result = await listFitmentCategoriesAction(domain.id);
        if (result.ok) setCategories(result.data);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <Stack
      gap={0}
      className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)]"
    >
      <Stack direction="row" align="center" gap={2} className="p-3">
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={expanded ? `Collapse ${domain.displayName}` : `Expand ${domain.displayName}`}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Boxes className="h-4 w-4 text-[var(--color-text-muted)]" />
        <Stack gap={0} className="flex-1">
          <Text size="sm" weight="medium">
            {domain.displayName}
          </Text>
          <Text size="xs" variant="muted">
            {labelChain(domain.labels)}
            {domain.rangeUnit ? ` · narrow by ${domain.labels.range ?? domain.rangeUnit}` : ''}
          </Text>
        </Stack>
        <Badge color={domain.isGlobal ? 'outline' : 'module'} className="text-xs">
          {domain.isGlobal ? 'global' : 'tenant'}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {domain.categoryCount} {plural(domain.labels.l1.toLowerCase(), domain.categoryCount)}
        </Badge>
      </Stack>
      {expanded && (
        <Stack gap={1} className="px-3 pb-3 pl-8">
          {loading && (
            <Text size="xs" variant="muted">
              Loading {domain.labels.l1.toLowerCase()}s…
            </Text>
          )}
          {!loading && categories?.length === 0 && (
            <Text size="xs" variant="muted">
              No {domain.labels.l1.toLowerCase()}s yet.
            </Text>
          )}
          {categories?.map((c) => (
            <CategoryRowComponent
              key={c.id}
              category={c}
              labels={domain.labels}
              rangeUnit={domain.rangeUnit}
            />
          ))}
          <NewCategoryForm
            domainId={domain.id}
            label={domain.labels.l1}
            onAdded={() => setCategories(null)}
          />
        </Stack>
      )}
    </Stack>
  );
}

function CategoryRowComponent({
  category,
  labels,
  rangeUnit,
}: {
  category: CategoryRow;
  labels: DomainLabels;
  rangeUnit: string | null;
}) {
  const hasL2 = Boolean(labels.l2);
  const [expanded, setExpanded] = React.useState(false);
  const [items, setItems] = React.useState<ItemRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function toggle() {
    if (!hasL2) return; // Domain has only L1 (e.g. Apparel sizes); no children to load.
    const next = !expanded;
    setExpanded(next);
    if (next && items === null) {
      setLoading(true);
      try {
        const result = await listFitmentItemsAction(category.id);
        if (result.ok) setItems(result.data);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <Stack gap={0} className="border-b border-[var(--color-border-default)] last:border-b-0">
      <Stack direction="row" align="center" gap={2} className="py-2">
        {hasL2 ? (
          <button
            type="button"
            onClick={() => void toggle()}
            aria-label={expanded ? `Collapse ${category.name}` : `Expand ${category.name}`}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="inline-block h-4 w-4" />
        )}
        <Text size="sm" weight="medium" className="flex-1">
          {category.name}
        </Text>
        <Text size="xs" variant="muted">
          /{category.slug}
        </Text>
        <Badge color={category.isGlobal ? 'outline' : 'module'} className="text-xs">
          {category.isGlobal ? 'global' : 'tenant'}
        </Badge>
        {hasL2 && (
          <Badge variant="outline" className="text-xs">
            {category.itemCount} {plural((labels.l2 ?? 'item').toLowerCase(), category.itemCount)}
          </Badge>
        )}
      </Stack>
      {expanded && (
        <Stack gap={1} className="pb-2 pl-8">
          {loading && (
            <Text size="xs" variant="muted">
              Loading {(labels.l2 ?? 'items').toLowerCase()}…
            </Text>
          )}
          {!loading && items?.length === 0 && (
            <Text size="xs" variant="muted">
              No {(labels.l2 ?? 'items').toLowerCase()} yet.
            </Text>
          )}
          {items?.map((item) => (
            <ItemRowComponent key={item.id} item={item} labels={labels} rangeUnit={rangeUnit} />
          ))}
          {labels.l2 && (
            <NewItemForm
              categoryId={category.id}
              label={labels.l2}
              onAdded={() => setItems(null)}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}

function ItemRowComponent({
  item,
  labels,
  rangeUnit,
}: {
  item: ItemRow;
  labels: DomainLabels;
  rangeUnit: string | null;
}) {
  const hasL3 = Boolean(labels.l3);
  const [expanded, setExpanded] = React.useState(false);
  const [variants, setVariants] = React.useState<VariantRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function toggle() {
    if (!hasL3) return;
    const next = !expanded;
    setExpanded(next);
    if (next && variants === null) {
      setLoading(true);
      try {
        const result = await listFitmentVariantsAction(item.id);
        if (result.ok) setVariants(result.data);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <Stack gap={0}>
      <Stack direction="row" align="center" gap={2}>
        {hasL3 ? (
          <button
            type="button"
            onClick={() => void toggle()}
            aria-label={expanded ? `Collapse ${item.name}` : `Expand ${item.name}`}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="inline-block h-3.5 w-3.5" />
        )}
        <Text size="sm" className="flex-1">
          {item.name}
        </Text>
        <Text size="xs" variant="muted">
          /{item.slug}
        </Text>
        <Badge color={item.isGlobal ? 'outline' : 'module'} className="text-xs">
          {item.isGlobal ? 'global' : 'tenant'}
        </Badge>
        {hasL3 && (
          <Badge variant="outline" className="text-xs">
            {item.variantCount} {plural((labels.l3 ?? 'variant').toLowerCase(), item.variantCount)}
          </Badge>
        )}
      </Stack>
      {expanded && (
        <Stack gap={1} className="pb-2 pl-6">
          {loading && (
            <Text size="xs" variant="muted">
              Loading {(labels.l3 ?? 'variants').toLowerCase()}…
            </Text>
          )}
          {!loading && variants?.length === 0 && (
            <Text size="xs" variant="muted">
              No {(labels.l3 ?? 'variants').toLowerCase()} yet.
            </Text>
          )}
          {variants?.map((v) => (
            <Stack key={v.id} direction="row" align="center" gap={2}>
              <Text size="xs" className="flex-1">
                {v.name}
              </Text>
              {summarizeAttributes(v.attributes, rangeUnit).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              <Badge color={v.isGlobal ? 'outline' : 'module'} className="text-xs">
                {v.isGlobal ? 'global' : 'tenant'}
              </Badge>
            </Stack>
          ))}
          {labels.l3 && (
            <NewVariantForm itemId={item.id} label={labels.l3} onAdded={() => setVariants(null)} />
          )}
        </Stack>
      )}
    </Stack>
  );
}

function NewCategoryForm({
  domainId,
  label,
  onAdded,
}: {
  domainId: string;
  label: string;
  onAdded: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = stringField(form.get('name')).trim();
    const slug = stringField(form.get('slug')).trim().toLowerCase();
    if (!name || !slug) {
      setError('Name and slug are required.');
      return;
    }
    startTransition(async () => {
      const result = await createFitmentCategoryAction({ domainId, name, slug });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      (e.target as HTMLFormElement).reset();
      setOpen(false);
      onAdded();
      router.refresh();
    });
  }

  return (
    <Stack
      gap={2}
      className="rounded border border-dashed border-[var(--color-border-default)] p-2"
    >
      <Stack direction="row" align="center" justify="between">
        <Text size="xs" variant="muted">
          Add a tenant {label.toLowerCase()}
        </Text>
        <Button
          type="button"
          color="neutral"
          variant={open ? 'ghost' : 'outline'}
          size="sm"
          onClick={() => setOpen((v) => !v)}
          leftIcon={<Plus className="h-3.5 w-3.5" />}
        >
          {open ? 'Cancel' : `New ${label.toLowerCase()}`}
        </Button>
      </Stack>
      {open && (
        <form onSubmit={onSubmit} noValidate>
          <Stack direction="row" gap={2} align="end" wrap>
            <Stack gap={1} className="min-w-[180px] flex-1">
              <Label htmlFor={`cat-name-${domainId}`}>{label} name</Label>
              <Input id={`cat-name-${domainId}`} name="name" required />
            </Stack>
            <Stack gap={1} className="min-w-[140px] flex-1">
              <Label htmlFor={`cat-slug-${domainId}`}>Slug</Label>
              <Input id={`cat-slug-${domainId}`} name="slug" required />
            </Stack>
            <Button type="submit" color="module" disabled={pending} loading={pending}>
              Add
            </Button>
          </Stack>
          {error && (
            <Text size="xs" variant="danger" className="mt-2" role="alert">
              {error}
            </Text>
          )}
        </form>
      )}
    </Stack>
  );
}

function NewItemForm({
  categoryId,
  label,
  onAdded,
}: {
  categoryId: string;
  label: string;
  onAdded: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = stringField(form.get('name')).trim();
    const slug = stringField(form.get('slug')).trim().toLowerCase();
    if (!name || !slug) {
      setError('Name and slug are required.');
      return;
    }
    startTransition(async () => {
      const result = await createFitmentItemAction({ categoryId, name, slug });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      (e.target as HTMLFormElement).reset();
      onAdded();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded border border-dashed border-[var(--color-border-default)] p-2"
    >
      <Stack direction="row" gap={2} align="end" wrap>
        <Stack gap={1} className="min-w-[180px] flex-1">
          <Label htmlFor={`item-name-${categoryId}`}>{label} name</Label>
          <Input id={`item-name-${categoryId}`} name="name" required size="sm" />
        </Stack>
        <Stack gap={1} className="min-w-[140px] flex-1">
          <Label htmlFor={`item-slug-${categoryId}`}>Slug</Label>
          <Input id={`item-slug-${categoryId}`} name="slug" required size="sm" />
        </Stack>
        <Button type="submit" variant="outline" size="sm" disabled={pending} loading={pending}>
          Add {label.toLowerCase()}
        </Button>
      </Stack>
      {error && (
        <Text size="xs" variant="danger" className="mt-2" role="alert">
          {error}
        </Text>
      )}
    </form>
  );
}

function NewVariantForm({
  itemId,
  label,
  onAdded,
}: {
  itemId: string;
  label: string;
  onAdded: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = stringField(form.get('name')).trim();
    const slug = stringField(form.get('slug')).trim().toLowerCase();
    if (!name || !slug) {
      setError('Name and slug are required.');
      return;
    }
    startTransition(async () => {
      const result = await createFitmentVariantAction({ itemId, name, slug });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      (e.target as HTMLFormElement).reset();
      onAdded();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded border border-dashed border-[var(--color-border-default)] p-2"
    >
      <Stack direction="row" gap={2} align="end" wrap>
        <Stack gap={1} className="min-w-[180px] flex-1">
          <Label htmlFor={`var-name-${itemId}`}>{label} name</Label>
          <Input id={`var-name-${itemId}`} name="name" required size="sm" />
        </Stack>
        <Stack gap={1} className="min-w-[140px] flex-1">
          <Label htmlFor={`var-slug-${itemId}`}>Slug</Label>
          <Input id={`var-slug-${itemId}`} name="slug" required size="sm" />
        </Stack>
        <Button type="submit" variant="outline" size="sm" disabled={pending} loading={pending}>
          Add {label.toLowerCase()}
        </Button>
      </Stack>
      {error && (
        <Text size="xs" variant="danger" className="mt-2" role="alert">
          {error}
        </Text>
      )}
    </form>
  );
}

function stringField(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

function labelChain(labels: DomainLabels): string {
  const parts = [labels.l1, labels.l2, labels.l3].filter(Boolean);
  return parts.join(' → ');
}

function plural(word: string, n: number): string {
  return n === 1 ? word : `${word}s`;
}

// Summarize variant attributes for display. Generic — picks the most
// useful keys for the rangeUnit + falls back to listing what's present.
// Vehicle: fuelType, cylinders, displacementCc; pet: weightLb, age;
// device: storageGb, screenSizeIn. We don't enforce a schema here — the
// merchant defines attribute keys per domain.
function summarizeAttributes(attrs: Record<string, unknown>, rangeUnit: string | null): string[] {
  const tags: string[] = [];
  // Vehicle engine attributes — special-cased because the seed data uses these.
  if (typeof attrs.displacementCc === 'number') {
    tags.push(`${(attrs.displacementCc / 1000).toFixed(1)}L`);
  }
  if (typeof attrs.cylinders === 'number') {
    tags.push(`${attrs.cylinders}-cyl`);
  }
  if (typeof attrs.fuelType === 'string') {
    tags.push(attrs.fuelType);
  }
  if (typeof attrs.aspiration === 'string' && attrs.aspiration !== 'natural') {
    tags.push(attrs.aspiration);
  }
  // Generic numeric tags for non-vehicle domains.
  for (const [k, v] of Object.entries(attrs)) {
    if (
      ['displacementCc', 'cylinders', 'fuelType', 'aspiration'].includes(k) ||
      v === null ||
      v === undefined
    ) {
      continue;
    }
    if (typeof v === 'number' || typeof v === 'string') {
      tags.push(`${k}: ${String(v)}`);
    }
  }
  // Suppress rangeUnit for now — variants don't carry their own range;
  // the product's fitment row narrows by range.
  void rangeUnit;
  return tags;
}
