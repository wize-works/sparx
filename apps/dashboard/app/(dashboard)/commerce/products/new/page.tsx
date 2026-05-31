'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Container,
  Heading,
  Input,
  Label,
  NativeSelect,
  PageHeader,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';

import { createProductAction } from '../../product-actions';

// New-product form. Phase 1.1 captures only the catalog basics —
// variants, options, fitment, media, pricing each land in their own
// tabs on the product detail page once the row exists. This mirrors
// Shopify's "create the shell, then fill it" UX rather than a single
// 18-step wizard.

export default function NewProductPage() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const titleRaw = form.get('title');
    const input = {
      title: typeof titleRaw === 'string' ? titleRaw.trim() : '',
      handle: nonEmpty(form.get('handle')),
      description: nonEmpty(form.get('description')),
      status: (nonEmpty(form.get('status')) as 'draft' | 'active' | undefined) ?? 'draft',
      productType: nonEmpty(form.get('productType')),
      vendor: nonEmpty(form.get('vendor')),
      fulfillmentType:
        (nonEmpty(form.get('fulfillmentType')) as
          | 'physical'
          | 'digital'
          | 'service'
          | 'configurable'
          | 'bundle'
          | 'subscription'
          | undefined) ?? 'physical',
      hazmatClass:
        (nonEmpty(form.get('hazmatClass')) as
          | 'none'
          | 'flammable_liquid'
          | 'flammable_solid'
          | 'gas'
          | 'oxidizer'
          | 'toxic'
          | 'corrosive'
          | 'radioactive'
          | 'misc'
          | undefined) ?? 'none',
      requiresShipping: form.get('requiresShipping') === 'on',
      taxClass: nonEmpty(form.get('taxClass')),
      tags: nonEmpty(form.get('tags'))
        ?.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    startTransition(async () => {
      const result = await createProductAction(input);
      if (result.ok) {
        router.push(`/commerce/products/${result.data.id}`);
        router.refresh();
        return;
      }
      if (result.error.code === 'VALIDATION_ERROR' && result.error.details?.length) {
        const fe: Record<string, string> = {};
        for (const d of result.error.details) fe[d.field] = d.message;
        setFieldErrors(fe);
      }
      setError(result.error.message);
    });
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New product"
          description="Create the catalog row first; add variants, options, media, pricing, and fitment from the product detail tabs. Anything not set here can be edited later — the only required field is the title."
        />

        <form onSubmit={onSubmit} noValidate>
          <Stack gap={4}>
            <Card>
              <CardHeader>
                <Heading level={3}>Basics</Heading>
                <CardDescription>Title and storefront slug.</CardDescription>
              </CardHeader>
              <CardContent>
                <Stack gap={4}>
                  <Stack gap={2}>
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" name="title" required placeholder="Premium dog food, 25 lb" />
                    <FieldError msg={fieldErrors.title} />
                  </Stack>
                  <Stack gap={2}>
                    <Label htmlFor="handle">Handle (optional)</Label>
                    <Input
                      id="handle"
                      name="handle"
                      placeholder="auto-derived from the title if blank"
                    />
                    <Text size="xs" variant="muted">
                      Storefront path: <code>/products/&lt;handle&gt;</code>. Lowercase, dashes
                      only.
                    </Text>
                    <FieldError msg={fieldErrors.handle} />
                  </Stack>
                  <Stack gap={2}>
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" rows={5} />
                    <Text size="xs" variant="muted">
                      Rich HTML allowed — the storefront sanitizes on render.
                    </Text>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Heading level={3}>Organization</Heading>
                <CardDescription>Status, type, vendor, tags.</CardDescription>
              </CardHeader>
              <CardContent>
                <Stack gap={4}>
                  <Stack direction="row" gap={4}>
                    <Stack gap={2} className="flex-1">
                      <Label htmlFor="status">Status</Label>
                      <NativeSelect id="status" name="status" defaultValue="draft">
                        <option value="draft">Draft</option>
                        <option value="active">Active (publish now)</option>
                      </NativeSelect>
                    </Stack>
                    <Stack gap={2} className="flex-1">
                      <Label htmlFor="productType">Product type</Label>
                      <Input
                        id="productType"
                        name="productType"
                        placeholder="Apparel, Auto Part, Food…"
                      />
                    </Stack>
                  </Stack>
                  <Stack direction="row" gap={4}>
                    <Stack gap={2} className="flex-1">
                      <Label htmlFor="vendor">Vendor</Label>
                      <Input id="vendor" name="vendor" placeholder="Acme Co." />
                    </Stack>
                    <Stack gap={2} className="flex-1">
                      <Label htmlFor="taxClass">Tax class</Label>
                      <Input
                        id="taxClass"
                        name="taxClass"
                        placeholder="standard | food | digital | apparel"
                      />
                    </Stack>
                  </Stack>
                  <Stack gap={2}>
                    <Label htmlFor="tags">Tags</Label>
                    <Textarea
                      id="tags"
                      name="tags"
                      rows={2}
                      placeholder="bestseller, fleet, gluten-free (comma-separated)"
                    />
                    <Text size="xs" variant="muted">
                      Alphanumeric, dashes, and underscores. Up to 50 tags.
                    </Text>
                    <FieldError msg={fieldErrors['tags.0'] ?? fieldErrors.tags} />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Heading level={3}>Shipping &amp; fulfillment</Heading>
                <CardDescription>
                  Drives downstream routing — freight carriers, hazmat docs, digital-only delivery.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Stack gap={4}>
                  <Stack direction="row" gap={4}>
                    <Stack gap={2} className="flex-1">
                      <Label htmlFor="fulfillmentType">Fulfillment</Label>
                      <NativeSelect
                        id="fulfillmentType"
                        name="fulfillmentType"
                        defaultValue="physical"
                      >
                        <option value="physical">Physical goods</option>
                        <option value="digital">Digital download</option>
                        <option value="service">Service / booking</option>
                        <option value="configurable">Configurable (built-to-order)</option>
                        <option value="bundle">Bundle / kit</option>
                        <option value="subscription">Subscription</option>
                      </NativeSelect>
                    </Stack>
                    <Stack gap={2} className="flex-1">
                      <Label htmlFor="hazmatClass">Hazmat class</Label>
                      <NativeSelect id="hazmatClass" name="hazmatClass" defaultValue="none">
                        <option value="none">None</option>
                        <option value="flammable_liquid">Flammable liquid</option>
                        <option value="flammable_solid">Flammable solid</option>
                        <option value="gas">Compressed gas</option>
                        <option value="oxidizer">Oxidizer</option>
                        <option value="toxic">Toxic</option>
                        <option value="corrosive">Corrosive</option>
                        <option value="radioactive">Radioactive</option>
                        <option value="misc">Miscellaneous</option>
                      </NativeSelect>
                    </Stack>
                  </Stack>
                  <Stack direction="row" align="center" gap={2}>
                    <input
                      type="checkbox"
                      id="requiresShipping"
                      name="requiresShipping"
                      defaultChecked
                      className="h-4 w-4"
                    />
                    <Label htmlFor="requiresShipping">Requires shipping</Label>
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
                <Button type="button" variant="ghost" asChild>
                  <Link href="/commerce/products">Cancel</Link>
                </Button>
                <Button type="submit" color="module" disabled={pending} loading={pending}>
                  Create product
                </Button>
              </CardFooter>
            </Card>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}

function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function FieldError({ msg }: { msg: string | undefined }) {
  if (!msg) return null;
  return (
    <Text size="xs" variant="danger">
      {msg}
    </Text>
  );
}
