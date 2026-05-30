'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownAZ,
  Boxes,
  ChevronDown,
  ChevronRight,
  Plus,
  Sliders,
  Star,
  X,
} from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Heading,
  Input,
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
  archiveVariantAction,
  setDefaultVariantAction,
  updateVariantAction,
} from '../../../variant-actions';

import { NewVariantForm } from './new-variant-form';
import { OptionsEditor } from './options-editor';

export interface OptionValueRow {
  id: string;
  optionId: string;
  value: string;
  swatchHex: string | null;
  swatchImageId: string | null;
  position: number;
}

export interface OptionRow {
  id: string;
  productId: string;
  name: string;
  displayType: string;
  position: number;
  values: OptionValueRow[];
}

export interface VariantRow {
  id: string;
  productId: string;
  sku: string;
  title: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  currency: string;
  inventoryPolicy: string;
  isDefault: boolean;
  optionValueIds: string[];
  imageCount: number;
  deletedAt: string | null;
}

interface Props {
  productId: string;
  productTitle: string;
  options: OptionRow[];
  variants: VariantRow[];
}

// Variants tab — two stacked sections: Options (the lattice) and
// Variants (purchasable SKUs). Each section has an inline collapsible
// editor so this works without a Dialog primitive — the dashboard
// doesn't ship one yet and adding it just for this feels premature.

export function VariantsPanel({ productId, productTitle, options, variants }: Props) {
  const router = useRouter();
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [newVariantOpen, setNewVariantOpen] = React.useState(false);

  const valuesById = React.useMemo(() => {
    const map = new Map<string, { option: OptionRow; value: OptionValueRow }>();
    for (const o of options) {
      for (const v of o.values) map.set(v.id, { option: o, value: v });
    }
    return map;
  }, [options]);

  const activeVariants = variants.filter((v) => !v.deletedAt);
  const archivedVariants = variants.filter((v) => v.deletedAt);

  return (
    <Stack gap={4}>
      <Card>
        <CardHeader>
          <Stack direction="row" align="center" justify="between" wrap gap={3}>
            <Stack gap={1}>
              <Stack direction="row" align="center" gap={2}>
                <Sliders className="h-4 w-4 text-[var(--module-active)]" />
                <Heading level={3}>Options</Heading>
                <Badge variant="outline">
                  {options.length} option{options.length === 1 ? '' : 's'}
                </Badge>
              </Stack>
              <CardDescription>
                Define the axes shoppers pick — Color, Size, Material, etc. Each variant binds to
                one value per option.
              </CardDescription>
            </Stack>
            <Button
              variant="secondary"
              onClick={() => setOptionsOpen((v) => !v)}
              leftIcon={optionsOpen ? <X className="h-4 w-4" /> : <Sliders className="h-4 w-4" />}
            >
              {optionsOpen ? 'Cancel' : options.length === 0 ? 'Set up options' : 'Edit options'}
            </Button>
          </Stack>
        </CardHeader>
        {!optionsOpen && options.length > 0 && (
          <CardContent>
            <Stack gap={3}>
              {options.map((option) => (
                <OptionPreview key={option.id} option={option} />
              ))}
            </Stack>
          </CardContent>
        )}
        {optionsOpen && (
          <CardContent>
            <OptionsEditor
              productId={productId}
              productTitle={productTitle}
              initialOptions={options}
              onSaved={() => {
                setOptionsOpen(false);
                router.refresh();
              }}
              onCancel={() => setOptionsOpen(false)}
            />
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <Stack direction="row" align="center" justify="between" wrap gap={3}>
            <Stack gap={1}>
              <Stack direction="row" align="center" gap={2}>
                <Boxes className="h-4 w-4 text-[var(--module-active)]" />
                <Heading level={3}>Variants</Heading>
                <Badge variant="outline">
                  {activeVariants.length} active
                  {archivedVariants.length > 0 ? ` · ${archivedVariants.length} archived` : ''}
                </Badge>
              </Stack>
              <CardDescription>
                One row per purchasable SKU. Each variant ties to one value per option (or none for
                option-less products). Price + inventory policy edit inline.
              </CardDescription>
            </Stack>
            <Button
              variant="module"
              onClick={() => setNewVariantOpen((v) => !v)}
              leftIcon={newVariantOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            >
              {newVariantOpen ? 'Cancel' : 'Add variant'}
            </Button>
          </Stack>
        </CardHeader>
        {newVariantOpen && (
          <CardContent>
            <NewVariantForm
              productId={productId}
              options={options}
              onCreated={() => {
                setNewVariantOpen(false);
                router.refresh();
              }}
              onCancel={() => setNewVariantOpen(false)}
            />
          </CardContent>
        )}
        <CardContent className="p-0">
          {activeVariants.length === 0 && archivedVariants.length === 0 ? (
            <Stack
              gap={2}
              align="center"
              className="border-t border-[var(--color-border-default)] py-10 text-center"
            >
              <Boxes className="h-5 w-5 text-[var(--color-text-muted)]" />
              <Text size="sm" variant="muted">
                No variants yet. Add at least one before publishing.
              </Text>
            </Stack>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead className="text-right">Price (cents)</TableHead>
                  <TableHead>Inventory policy</TableHead>
                  <TableHead className="text-right">Images</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...activeVariants, ...archivedVariants].map((variant) => (
                  <VariantRowEditor
                    key={variant.id}
                    variant={variant}
                    productId={productId}
                    valuesById={valuesById}
                    onChanged={() => router.refresh()}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

function OptionPreview({ option }: { option: OptionRow }) {
  return (
    <Stack
      gap={2}
      className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] p-3"
    >
      <Stack direction="row" align="center" gap={2}>
        <Text size="sm" weight="medium">
          {option.name}
        </Text>
        <Badge variant="outline" className="text-xs">
          {option.displayType}
        </Badge>
        <Text size="xs" variant="muted">
          {option.values.length} value{option.values.length === 1 ? '' : 's'}
        </Text>
      </Stack>
      <Stack direction="row" gap={2} wrap>
        {option.values.map((v) => (
          <Stack
            key={v.id}
            direction="row"
            align="center"
            gap={1}
            className="rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2 py-1"
          >
            {v.swatchHex && (
              <span
                aria-hidden
                className="inline-block h-3 w-3 rounded-sm border border-[var(--color-border-default)]"
                style={{ backgroundColor: v.swatchHex }}
              />
            )}
            <Text size="xs">{v.value}</Text>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

interface VariantRowProps {
  variant: VariantRow;
  productId: string;
  valuesById: Map<string, { option: OptionRow; value: OptionValueRow }>;
  onChanged: () => void;
}

function VariantRowEditor({ variant, productId, valuesById, onChanged }: VariantRowProps) {
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [priceDraft, setPriceDraft] = React.useState(variant.priceCents.toString());

  const optionsLabel = variant.optionValueIds
    .map((vid) => {
      const entry = valuesById.get(vid);
      return entry ? `${entry.option.name}: ${entry.value.value}` : null;
    })
    .filter(Boolean)
    .join(' · ');

  function commit(payload: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const result = await updateVariantAction(variant.id, productId, payload);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onChanged();
    });
  }

  function onPriceBlur() {
    const next = Number.parseInt(priceDraft, 10);
    if (!Number.isFinite(next) || next < 0) {
      setError('Price must be a non-negative integer (cents)');
      setPriceDraft(variant.priceCents.toString());
      return;
    }
    if (next === variant.priceCents) return;
    commit({ priceCents: next });
  }

  function makeDefault() {
    setError(null);
    startTransition(async () => {
      const result = await setDefaultVariantAction(variant.id, productId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onChanged();
    });
  }

  async function archive() {
    const ok = await confirm({
      title: `Archive variant ${variant.sku}?`,
      description:
        'Carts referencing this variant will fail to checkout. You can restore it from the archived list.',
      confirmLabel: 'Archive variant',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await archiveVariantAction(variant.id, productId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      onChanged();
    });
  }

  return (
    <TableRow className={variant.deletedAt ? 'opacity-50' : undefined}>
      <TableCell>
        <Stack gap={1}>
          <Stack direction="row" align="center" gap={2}>
            <Text size="sm" weight="medium">
              {variant.sku}
            </Text>
            {variant.isDefault && (
              <Badge variant="module" className="text-xs">
                default
              </Badge>
            )}
            {variant.deletedAt && (
              <Badge variant="warning" className="text-xs">
                archived
              </Badge>
            )}
          </Stack>
          {variant.title && (
            <Text size="xs" variant="muted">
              {variant.title}
            </Text>
          )}
        </Stack>
      </TableCell>
      <TableCell>
        <Text size="sm" variant="muted">
          {optionsLabel || '—'}
        </Text>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={priceDraft}
          onChange={(e) => setPriceDraft(e.target.value)}
          onBlur={onPriceBlur}
          disabled={pending || !!variant.deletedAt}
          className="h-8 w-28 text-right"
          aria-label={`Price for ${variant.sku}`}
        />
      </TableCell>
      <TableCell>
        <select
          value={variant.inventoryPolicy}
          onChange={(e) => commit({ inventoryPolicy: e.target.value })}
          disabled={pending || !!variant.deletedAt}
          aria-label={`Inventory policy for ${variant.sku}`}
          className="flex h-8 rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-2 text-xs text-[var(--color-text-primary)]"
        >
          <option value="deny">Deny when out</option>
          <option value="continue">Continue selling</option>
          <option value="preorder">Preorder</option>
        </select>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Text size="sm" variant="muted">
          {variant.imageCount}
        </Text>
      </TableCell>
      <TableCell className="text-right">
        <Stack direction="row" gap={1} justify="end">
          {!variant.deletedAt && !variant.isDefault && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={makeDefault}
              disabled={pending}
              leftIcon={<Star className="h-3.5 w-3.5" />}
              title="Make default"
            >
              Default
            </Button>
          )}
          {!variant.deletedAt && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void archive()}
              disabled={pending}
              leftIcon={<ArrowDownAZ className="h-3.5 w-3.5" />}
            >
              Archive
            </Button>
          )}
        </Stack>
        {error && (
          <Text size="xs" variant="danger" className="mt-1">
            {error}
          </Text>
        )}
      </TableCell>
    </TableRow>
  );
}

export { ChevronDown, ChevronRight };
