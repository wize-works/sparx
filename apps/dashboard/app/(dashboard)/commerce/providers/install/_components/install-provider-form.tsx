'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import type { ProviderEnvironment, ProviderKind } from '@sparx/commerce-schemas';
import { Button, Input, Label, Stack, Text, Textarea } from '@sparx/ui';

import { formString } from '../../../../../../lib/forms';
import { installProviderAction } from '../../../provider-actions';

interface JsonSchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  pattern?: string;
  maxLength?: number;
}

interface JsonSchema {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchemaProperty>;
}

export function InstallProviderForm({
  providerSlug,
  kind,
  displayName,
  configSchemaJson,
  sandboxAvailable,
  webhookPathTemplate,
}: {
  providerSlug: string;
  kind: ProviderKind;
  displayName: string;
  configSchemaJson: string;
  sandboxAvailable: boolean;
  webhookPathTemplate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const schema = React.useMemo<JsonSchema>(() => {
    try {
      return JSON.parse(configSchemaJson) as JsonSchema;
    } catch {
      return {};
    }
  }, [configSchemaJson]);

  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const propertyKeys = Object.keys(properties);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const environment = formString(form, 'environment', 'production') as ProviderEnvironment;
    const label = formString(form, 'label').trim();

    const config: Record<string, unknown> = {};
    for (const key of propertyKeys) {
      const raw = form.get(`config:${key}`);
      const propType = properties[key]?.type;
      if (propType === 'boolean') {
        config[key] = raw === 'on';
      } else if (typeof raw !== 'string') {
        continue;
      } else {
        const str = raw.trim();
        if (str.length === 0) continue;
        config[key] = str;
      }
    }

    startTransition(async () => {
      const result = await installProviderAction({
        providerSlug,
        kind,
        environment,
        config,
        ...(label ? { label } : {}),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(`/commerce/providers/${result.data.installationId}`);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={4}>
        <Stack direction="row" gap={3} wrap>
          <Stack gap={1} className="min-w-[12rem]">
            <Label htmlFor="environment">Environment *</Label>
            <select
              id="environment"
              name="environment"
              defaultValue={sandboxAvailable ? 'sandbox' : 'production'}
              className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
            >
              {sandboxAvailable && <option value="sandbox">sandbox</option>}
              <option value="production">production</option>
            </select>
          </Stack>
          <Stack gap={1} className="min-w-[14rem]">
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              name="label"
              placeholder={`${displayName} — primary`}
              maxLength={127}
            />
            <Text size="xs" variant="muted">
              Distinguishes multiple installs of the same provider (e.g. US vs EU entity).
            </Text>
          </Stack>
        </Stack>

        <Stack gap={3} className="rounded border border-[var(--color-border-default)] p-4">
          <Text size="sm" className="font-medium">
            Provider configuration
          </Text>
          {propertyKeys.length === 0 ? (
            <Text size="sm" variant="muted">
              No configuration fields declared.
            </Text>
          ) : (
            propertyKeys.map((key) => {
              const prop = properties[key]!;
              const isRequired = required.has(key);
              return (
                <Stack key={key} gap={1}>
                  <Label htmlFor={`config:${key}`}>
                    {prop.title ?? key}
                    {isRequired && <span className="text-[var(--color-danger)]"> *</span>}
                  </Label>
                  {prop.type === 'boolean' ? (
                    <label className="flex items-center gap-2">
                      <input
                        id={`config:${key}`}
                        name={`config:${key}`}
                        type="checkbox"
                        defaultChecked={prop.default === true}
                      />
                      <Text size="sm" variant="muted">
                        {prop.description ?? 'Enable'}
                      </Text>
                    </label>
                  ) : prop.description && prop.description.length > 80 ? (
                    <Textarea
                      id={`config:${key}`}
                      name={`config:${key}`}
                      rows={2}
                      required={isRequired}
                      defaultValue={typeof prop.default === 'string' ? prop.default : undefined}
                      className="font-mono text-xs"
                    />
                  ) : (
                    <Input
                      id={`config:${key}`}
                      name={`config:${key}`}
                      required={isRequired}
                      pattern={prop.pattern}
                      maxLength={prop.maxLength}
                      defaultValue={
                        typeof prop.default === 'string' || typeof prop.default === 'number'
                          ? String(prop.default)
                          : undefined
                      }
                    />
                  )}
                  {prop.type !== 'boolean' && prop.description && (
                    <Text size="xs" variant="muted">
                      {prop.description}
                    </Text>
                  )}
                </Stack>
              );
            })
          )}
        </Stack>

        <Stack gap={1} className="rounded bg-[var(--color-bg-subtle)] p-3">
          <Text size="xs" className="font-medium">
            Webhook path
          </Text>
          <Text size="xs" className="font-mono text-[var(--color-text-muted)]">
            {webhookPathTemplate}
          </Text>
          <Text size="xs" variant="muted">
            After install, paste this URL into the provider&apos;s webhook configuration so
            callbacks land at the right tenant.
          </Text>
        </Stack>

        {error && (
          <Text size="sm" className="text-[var(--color-danger)]">
            {error}
          </Text>
        )}
        <Stack direction="row" gap={2} justify="end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Installing…' : 'Install provider'}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
