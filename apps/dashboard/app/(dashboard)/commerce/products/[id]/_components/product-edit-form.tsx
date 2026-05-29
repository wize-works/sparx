'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Heading,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';

import { updateProductAction } from '../../../product-actions';

interface ProductOverview {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  productType: string | null;
  vendor: string | null;
  tags: string[];
  fulfillmentType: string;
  hazmatClass: string;
  requiresShipping: boolean;
  taxClass: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

// Overview-tab edit form. Submits a partial UpdateProductInput — only
// fields the merchant touched are sent because the server treats
// `undefined` as "leave alone" (the Zod schema is .partial()).

export function ProductEditForm({ product }: { product: ProductOverview }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSavedAt(null);

    const form = new FormData(e.currentTarget);
    const input = {
      title: nonEmpty(form.get('title')),
      handle: nonEmpty(form.get('handle')),
      description: stringOrNull(form.get('description')),
      productType: stringOrNull(form.get('productType')),
      vendor: stringOrNull(form.get('vendor')),
      tags: nonEmpty(form.get('tags'))
        ?.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      fulfillmentType: nonEmpty(form.get('fulfillmentType')),
      hazmatClass: nonEmpty(form.get('hazmatClass')),
      requiresShipping: form.get('requiresShipping') === 'on',
      taxClass: stringOrNull(form.get('taxClass')),
      seoTitle: stringOrNull(form.get('seoTitle')),
      seoDescription: stringOrNull(form.get('seoDescription')),
    };

    startTransition(async () => {
      const result = await updateProductAction(product.id, input);
      if (!result.ok) {
        if (result.error.code === 'VALIDATION_ERROR' && result.error.details?.length) {
          const fe: Record<string, string> = {};
          for (const d of result.error.details) fe[d.field] = d.message;
          setFieldErrors(fe);
        }
        setError(result.error.message);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={4}>
        <Card>
          <CardHeader>
            <Heading level={3}>Basics</Heading>
            <CardDescription>Title, handle, description.</CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack gap={2}>
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" defaultValue={product.title} />
                <FieldError msg={fieldErrors.title} />
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="handle">Handle</Label>
                <Input id="handle" name="handle" defaultValue={product.handle} />
                <FieldError msg={fieldErrors.handle} />
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  rows={6}
                  defaultValue={product.description ?? ''}
                />
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Heading level={3}>Organization</Heading>
            <CardDescription>Type, vendor, tags, tax class.</CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack direction="row" gap={4}>
                <Stack gap={2} className="flex-1">
                  <Label htmlFor="productType">Product type</Label>
                  <Input
                    id="productType"
                    name="productType"
                    defaultValue={product.productType ?? ''}
                  />
                </Stack>
                <Stack gap={2} className="flex-1">
                  <Label htmlFor="vendor">Vendor</Label>
                  <Input id="vendor" name="vendor" defaultValue={product.vendor ?? ''} />
                </Stack>
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="tags">Tags</Label>
                <Textarea id="tags" name="tags" rows={2} defaultValue={product.tags.join(', ')} />
                <Text size="xs" variant="muted">
                  Comma-separated. Up to 50 tags.
                </Text>
                <FieldError msg={fieldErrors['tags.0'] ?? fieldErrors.tags} />
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="taxClass">Tax class</Label>
                <Input
                  id="taxClass"
                  name="taxClass"
                  defaultValue={product.taxClass ?? ''}
                  placeholder="standard | food | digital | apparel"
                />
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Heading level={3}>Shipping &amp; fulfillment</Heading>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack direction="row" gap={4}>
                <Stack gap={2} className="flex-1">
                  <Label htmlFor="fulfillmentType">Fulfillment</Label>
                  <select
                    id="fulfillmentType"
                    name="fulfillmentType"
                    defaultValue={product.fulfillmentType}
                    className="flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
                  >
                    <option value="physical">Physical goods</option>
                    <option value="digital">Digital download</option>
                    <option value="service">Service / booking</option>
                    <option value="configurable">Configurable (built-to-order)</option>
                    <option value="bundle">Bundle / kit</option>
                    <option value="subscription">Subscription</option>
                  </select>
                </Stack>
                <Stack gap={2} className="flex-1">
                  <Label htmlFor="hazmatClass">Hazmat class</Label>
                  <select
                    id="hazmatClass"
                    name="hazmatClass"
                    defaultValue={product.hazmatClass}
                    className="flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:outline-none"
                  >
                    <option value="none">None</option>
                    <option value="flammable_liquid">Flammable liquid</option>
                    <option value="flammable_solid">Flammable solid</option>
                    <option value="gas">Compressed gas</option>
                    <option value="oxidizer">Oxidizer</option>
                    <option value="toxic">Toxic</option>
                    <option value="corrosive">Corrosive</option>
                    <option value="radioactive">Radioactive</option>
                    <option value="misc">Miscellaneous</option>
                  </select>
                </Stack>
              </Stack>
              <Stack direction="row" align="center" gap={2}>
                <input
                  type="checkbox"
                  id="requiresShipping"
                  name="requiresShipping"
                  defaultChecked={product.requiresShipping}
                  className="h-4 w-4"
                />
                <Label htmlFor="requiresShipping">Requires shipping</Label>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Heading level={3}>SEO</Heading>
            <CardDescription>What search engines see.</CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack gap={2}>
                <Label htmlFor="seoTitle">Page title</Label>
                <Input id="seoTitle" name="seoTitle" defaultValue={product.seoTitle ?? ''} />
              </Stack>
              <Stack gap={2}>
                <Label htmlFor="seoDescription">Meta description</Label>
                <Textarea
                  id="seoDescription"
                  name="seoDescription"
                  rows={3}
                  defaultValue={product.seoDescription ?? ''}
                />
                <Text size="xs" variant="muted">
                  Aim for 150–160 characters.
                </Text>
              </Stack>
            </Stack>
          </CardContent>
          {error && (
            <CardContent>
              <Text size="sm" variant="danger" role="alert" aria-live="polite">
                {error}
              </Text>
            </CardContent>
          )}
          <CardFooter>
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
            <Button type="submit" variant="module" disabled={pending} loading={pending}>
              Save changes
            </Button>
          </CardFooter>
        </Card>
      </Stack>
    </form>
  );
}

function FieldError({ msg }: { msg: string | undefined }) {
  if (!msg) return null;
  return (
    <Text size="xs" variant="danger">
      {msg}
    </Text>
  );
}

function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stringOrNull(value: FormDataEntryValue | null): string | null | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
