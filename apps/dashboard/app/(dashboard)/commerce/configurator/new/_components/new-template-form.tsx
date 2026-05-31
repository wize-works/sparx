'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input, Label, Stack, Text, Textarea } from '@sparx/ui';

import { createTemplateAction } from '../../../configurator-actions';

export interface ProductOption {
  id: string;
  title: string;
  handle: string;
  status: string;
}

const STARTER_PAYLOAD = {
  layout: {
    steps: [{ key: 'main', label: 'Configure', optionKeys: ['size'] }],
  },
  options: [
    {
      key: 'size',
      label: 'Size',
      type: 'single_choice',
      required: true,
      position: 0,
      choices: [
        { key: 'small', label: 'Small', position: 0 },
        { key: 'large', label: 'Large', position: 1, priceDeltaCents: 1000 },
      ],
    },
  ],
  rules: [],
  addOns: [],
};

export function NewTemplateForm({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [productId, setProductId] = React.useState('');
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [json, setJson] = React.useState(() => JSON.stringify(STARTER_PAYLOAD, null, 2));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!productId) {
      setError('Pick a product');
      return;
    }
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON');
      return;
    }
    const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const payload = {
      productId,
      name: name.trim(),
      description: description.trim() || undefined,
      layout: obj.layout ?? {},
      options: obj.options ?? [],
      rules: obj.rules ?? [],
      addOns: obj.addOns ?? [],
    };
    startTransition(async () => {
      const result = await createTemplateAction(payload);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(`/commerce/configurator/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={4}>
        <Stack gap={1}>
          <Label htmlFor="productId">Product *</Label>
          <select
            id="productId"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
          >
            <option value="">— select a product —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.status})
              </option>
            ))}
          </select>
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="name">Template name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Default configuration"
          />
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="json">Definition (JSON)</Label>
          <Textarea
            id="json"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={20}
            className="font-mono text-xs"
          />
          <Text size="xs" variant="muted">
            Must validate against CreateConfigurationTemplateInput in @sparx/commerce-schemas. The
            starter has one option with two choices — edit, then iterate after save.
          </Text>
        </Stack>
        {error && (
          <Text size="sm" className="text-[var(--color-danger)]">
            {error}
          </Text>
        )}
        <Stack direction="row" gap={2} justify="end">
          <Button color="module" type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create template'}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
