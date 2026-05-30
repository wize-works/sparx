'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, Plus, Trash } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
  Input,
  Label,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  useConfirm,
} from '@sparx/ui';

import {
  deleteFitmentAction,
  listFitmentCategoriesAction,
  listFitmentItemsAction,
  listFitmentVariantsAction,
  setProductFitmentAction,
} from '../../../fitment-actions';

interface FitmentRow {
  id: string;
  domainId: string;
  domainSlug: string;
  categoryId: string;
  categoryName: string;
  itemId: string | null;
  itemName: string | null;
  variantId: string | null;
  variantName: string | null;
  rangeMin: number | null;
  rangeMax: number | null;
  notes: string | null;
}

interface DomainOption {
  id: string;
  slug: string;
  displayName: string;
  labels: { l1: string; l2?: string; l3?: string; range?: string };
  rangeUnit: string | null;
}

interface Props {
  productId: string;
  productTitle: string;
  fitments: FitmentRow[];
  domains: DomainOption[];
}

// Per-product fitment editor. Shows applicability rules in a table;
// adds new rules via a domain-aware inline form. Pick a domain first
// (Vehicle / Pet / Device / ...); the form then asks for that domain's
// category/item/variant/range with the right labels (Make/Model/Engine/
// Year vs. Species/Breed/Weight vs. Brand/Model). Each row is one rule;
// rules combine OR on the storefront so a single product can fit many
// compatibility windows.

export function FitmentPanel({ productId, productTitle, fitments, domains }: Props) {
  return (
    <Stack gap={4}>
      <Card>
        <CardHeader>
          <Stack direction="row" align="center" gap={2}>
            <Boxes className="h-4 w-4 text-[var(--module-active)]" />
            <Heading level={3}>Fitment rules</Heading>
            <Badge variant="outline">
              {fitments.length} rule{fitments.length === 1 ? '' : 's'}
            </Badge>
          </Stack>
          <CardDescription>
            Each row is one compatibility rule for {productTitle}. Narrower rows win on the
            storefront — match runs OR across rows. A brake pad that fits both the 6.7L Power Stroke
            2011-2016 and the 7.3L 1999-2003 is two rows here; a dog harness fitting Labs 40-80 lb
            and Goldens 50-90 lb is also two.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {fitments.length === 0 ? (
            <Stack
              gap={2}
              align="center"
              className="border-t border-[var(--color-border-default)] py-10 text-center"
            >
              <Boxes className="h-5 w-5 text-[var(--color-text-muted)]" />
              <Text size="sm" variant="muted">
                No fitment rules yet. Add one below so storefront filters can find this product.
              </Text>
            </Stack>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Variant</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fitments.map((row) => (
                  <FitmentRowEditor
                    key={row.id}
                    row={row}
                    productId={productId}
                    domains={domains}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Stack direction="row" align="center" gap={2}>
            <Plus className="h-4 w-4 text-[var(--module-active)]" />
            <Heading level={3}>Add fitment rule</Heading>
          </Stack>
          <CardDescription>
            Pick a domain, then narrow as far as the rule needs. Leave fields blank for wildcards —
            a rule with just the category fits every item in that category.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {domains.length === 0 ? (
            <Text size="sm" variant="muted">
              No fitment domains configured. Add one in <strong>Commerce → Fitment</strong> first.
            </Text>
          ) : (
            <NewFitmentForm productId={productId} fitments={fitments} domains={domains} />
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

function FitmentRowEditor({
  row,
  productId,
  domains,
}: {
  row: FitmentRow;
  productId: string;
  domains: DomainOption[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const domain = domains.find((d) => d.id === row.domainId);

  async function onDelete() {
    const label = `${row.categoryName}${row.itemName ? ' / ' + row.itemName : ''}`;
    const ok = await confirm({
      title: `Remove fitment rule for ${label}?`,
      description:
        'This product will no longer appear when shoppers filter by this compatibility. Other fitment rules on this product are unaffected.',
      confirmLabel: 'Remove rule',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteFitmentAction(productId, row.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  const rangeLabel = formatRange(row.rangeMin, row.rangeMax, domain?.rangeUnit ?? null);

  return (
    <TableRow>
      <TableCell>
        <Text size="sm">{domain?.displayName ?? row.domainSlug}</Text>
      </TableCell>
      <TableCell>
        <Text size="sm" weight="medium">
          {row.categoryName}
        </Text>
      </TableCell>
      <TableCell>
        <Text size="sm">{row.itemName ?? '—'}</Text>
      </TableCell>
      <TableCell>
        <Text size="sm">{row.variantName ?? '—'}</Text>
      </TableCell>
      <TableCell>
        <Text size="sm">{rangeLabel}</Text>
      </TableCell>
      <TableCell>
        <Text size="xs" variant="muted">
          {row.notes ?? '—'}
        </Text>
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void onDelete()}
          disabled={pending}
          leftIcon={<Trash className="h-3.5 w-3.5" />}
        >
          Remove
        </Button>
        {error && (
          <Text size="xs" variant="danger" className="mt-1">
            {error}
          </Text>
        )}
      </TableCell>
    </TableRow>
  );
}

interface NewFormProps {
  productId: string;
  fitments: FitmentRow[];
  domains: DomainOption[];
}

function NewFitmentForm({ productId, fitments, domains }: NewFormProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [domainId, setDomainId] = React.useState<string>(domains[0]?.id ?? '');
  const domain = domains.find((d) => d.id === domainId);

  const [categoryOptions, setCategoryOptions] = React.useState<{ id: string; name: string }[]>([]);
  const [categoryId, setCategoryId] = React.useState<string>('');

  const [itemOptions, setItemOptions] = React.useState<{ id: string; name: string }[]>([]);
  const [itemId, setItemId] = React.useState<string>('');

  const [variantOptions, setVariantOptions] = React.useState<{ id: string; name: string }[]>([]);

  React.useEffect(() => {
    setCategoryId('');
    setCategoryOptions([]);
    setItemOptions([]);
    setVariantOptions([]);
    if (!domainId) return;
    void (async () => {
      const result = await listFitmentCategoriesAction(domainId);
      if (result.ok) {
        setCategoryOptions(result.data.map((c) => ({ id: c.id, name: c.name })));
      }
    })();
  }, [domainId]);

  React.useEffect(() => {
    setItemId('');
    setItemOptions([]);
    setVariantOptions([]);
    if (!categoryId || !domain?.labels.l2) return;
    void (async () => {
      const result = await listFitmentItemsAction(categoryId);
      if (result.ok) {
        setItemOptions(result.data.map((i) => ({ id: i.id, name: i.name })));
      }
    })();
  }, [categoryId, domain?.labels.l2]);

  React.useEffect(() => {
    setVariantOptions([]);
    if (!itemId || !domain?.labels.l3) return;
    void (async () => {
      const result = await listFitmentVariantsAction(itemId);
      if (result.ok) {
        setVariantOptions(result.data.map((v) => ({ id: v.id, name: v.name })));
      }
    })();
  }, [itemId, domain?.labels.l3]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const variantId = stringField(form.get('variantId'));
    const rangeMinRaw = stringField(form.get('rangeMin')).trim();
    const rangeMaxRaw = stringField(form.get('rangeMax')).trim();
    const notes = stringField(form.get('notes')).trim();

    if (!domainId) {
      setError('Pick a domain first.');
      return;
    }
    if (!categoryId) {
      setError(`Pick a ${domain?.labels.l1.toLowerCase() ?? 'category'} first.`);
      return;
    }

    const rangeMin = rangeMinRaw ? Number.parseFloat(rangeMinRaw) : undefined;
    const rangeMax = rangeMaxRaw ? Number.parseFloat(rangeMaxRaw) : undefined;
    if (rangeMin !== undefined && rangeMax !== undefined && rangeMin > rangeMax) {
      setError('Range min must be ≤ range max.');
      return;
    }

    const newRow = {
      domainId,
      categoryId,
      ...(itemId ? { itemId } : {}),
      ...(variantId ? { variantId } : {}),
      ...(Number.isFinite(rangeMin) ? { rangeMin } : {}),
      ...(Number.isFinite(rangeMax) ? { rangeMax } : {}),
      ...(notes ? { notes } : {}),
    };

    // Replace-all semantics: build the next list = existing rows + new row.
    const next = [
      ...fitments.map((f) => ({
        domainId: f.domainId,
        categoryId: f.categoryId,
        ...(f.itemId ? { itemId: f.itemId } : {}),
        ...(f.variantId ? { variantId: f.variantId } : {}),
        ...(f.rangeMin !== null ? { rangeMin: f.rangeMin } : {}),
        ...(f.rangeMax !== null ? { rangeMax: f.rangeMax } : {}),
        ...(f.notes ? { notes: f.notes } : {}),
      })),
      newRow,
    ];

    startTransition(async () => {
      const result = await setProductFitmentAction(productId, next);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      (e.target as HTMLFormElement).reset();
      setCategoryId('');
      setItemId('');
      router.refresh();
    });
  }

  if (!domain) {
    return (
      <Text size="sm" variant="muted">
        Pick a domain to start.
      </Text>
    );
  }

  const rangeLabel = domain.labels.range
    ? `${domain.labels.range} (${rangeUnitLabel(domain.rangeUnit)})`
    : null;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={3}>
        <Stack direction="row" gap={3} wrap>
          <Stack gap={1} className="min-w-[160px] flex-1">
            <Label htmlFor="fit-domain">Domain</Label>
            <select
              id="fit-domain"
              value={domainId}
              onChange={(e) => setDomainId(e.target.value)}
              required
              className="flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            >
              {domains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName}
                </option>
              ))}
            </select>
          </Stack>

          <Stack gap={1} className="min-w-[160px] flex-1">
            <Label htmlFor="fit-category">{domain.labels.l1}</Label>
            <select
              id="fit-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              disabled={categoryOptions.length === 0}
              className="flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
            >
              <option value="">— Pick a {domain.labels.l1.toLowerCase()} —</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Stack>

          {domain.labels.l2 && (
            <Stack gap={1} className="min-w-[160px] flex-1">
              <Label htmlFor="fit-item">{domain.labels.l2} (optional)</Label>
              <select
                id="fit-item"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
                disabled={!categoryId || itemOptions.length === 0}
                className="flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
              >
                <option value="">— Any {domain.labels.l2.toLowerCase()} —</option>
                {itemOptions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Stack>
          )}

          {domain.labels.l3 && (
            <Stack gap={1} className="min-w-[160px] flex-1">
              <Label htmlFor="fit-variant">{domain.labels.l3} (optional)</Label>
              <select
                id="fit-variant"
                name="variantId"
                disabled={!itemId || variantOptions.length === 0}
                defaultValue=""
                className="flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
              >
                <option value="">— Any {domain.labels.l3.toLowerCase()} —</option>
                {variantOptions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Stack>
          )}
        </Stack>

        {rangeLabel && (
          <Stack direction="row" gap={3} wrap>
            <Stack gap={1} className="w-32">
              <Label htmlFor="fit-range-min">{domain.labels.range} from</Label>
              <Input
                id="fit-range-min"
                name="rangeMin"
                type="number"
                inputMode="decimal"
                placeholder={examplePlaceholder(domain.rangeUnit, 'min')}
              />
            </Stack>
            <Stack gap={1} className="w-32">
              <Label htmlFor="fit-range-max">{domain.labels.range} to</Label>
              <Input
                id="fit-range-max"
                name="rangeMax"
                type="number"
                inputMode="decimal"
                placeholder={examplePlaceholder(domain.rangeUnit, 'max')}
              />
            </Stack>
            <Stack gap={1} className="min-w-[200px] flex-1">
              <Label htmlFor="fit-notes">Notes</Label>
              <Input
                id="fit-notes"
                name="notes"
                placeholder="e.g. requires harness adapter, fleet-only"
              />
            </Stack>
          </Stack>
        )}

        {!rangeLabel && (
          <Stack gap={1} className="min-w-[200px]">
            <Label htmlFor="fit-notes">Notes</Label>
            <Input
              id="fit-notes"
              name="notes"
              placeholder="Free-form note shown alongside the rule"
            />
          </Stack>
        )}

        {error && (
          <Text size="sm" variant="danger" role="alert" aria-live="polite">
            {error}
          </Text>
        )}

        <Stack direction="row" justify="end">
          <Button
            type="submit"
            variant="module"
            disabled={pending}
            loading={pending}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Add rule
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}

function formatRange(min: number | null, max: number | null, rangeUnit: string | null): string {
  if (min === null && max === null) return 'any';
  const u = rangeUnit ? ` ${rangeUnitLabel(rangeUnit)}` : '';
  if (min !== null && max !== null) {
    return min === max ? `${min}${u}` : `${min}–${max}${u}`;
  }
  if (min !== null) return `${min}+${u}`;
  return `≤${max!}${u}`;
}

function rangeUnitLabel(unit: string | null): string {
  if (!unit) return '';
  switch (unit) {
    case 'year':
      return '';
    case 'lb':
      return 'lb';
    case 'kg':
      return 'kg';
    case 'month':
      return 'mo';
    case 'us_shoe':
      return 'US';
    case 'eu_shoe':
      return 'EU';
    case 'mm':
      return 'mm';
    case 'in':
      return 'in';
    default:
      return unit;
  }
}

function examplePlaceholder(unit: string | null, end: 'min' | 'max'): string {
  switch (unit) {
    case 'year':
      return end === 'min' ? '2011' : '2016';
    case 'lb':
      return end === 'min' ? '40' : '80';
    case 'kg':
      return end === 'min' ? '18' : '36';
    case 'month':
      return end === 'min' ? '6' : '24';
    case 'us_shoe':
      return end === 'min' ? '8' : '11';
    default:
      return '';
  }
}

function stringField(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
