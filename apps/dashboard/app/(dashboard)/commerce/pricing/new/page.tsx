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
  PageHeader,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';

import { createPriceListAction } from '../../pricing-actions';

const CHANNELS = ['storefront', 'b2b_portal', 'admin', 'subscription'] as const;

export default function NewPriceListPage() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const channelRaw = stringOr(form.get('channel'), '');
    const input = {
      name: stringOr(form.get('name'), ''),
      description: nonEmpty(form.get('description')),
      currency: stringOr(form.get('currency'), 'USD').toUpperCase(),
      channel: channelRaw === '' ? undefined : channelRaw,
      priority: Number(stringOr(form.get('priority'), '0')) || 0,
    };

    startTransition(async () => {
      const result = await createPriceListAction(input);
      if (!result.ok) {
        setError(result.error.message);
        const map: Record<string, string> = {};
        for (const d of result.error.details ?? []) map[d.field] = d.message;
        setFieldErrors(map);
        return;
      }
      router.push(`/commerce/pricing/${result.data.id}`);
    });
  }

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New price list"
          description="Targeting (segment, B2B account) can be set after the list exists. Per-variant entries are managed from the detail page."
        />

        <form onSubmit={onSubmit}>
          <Card>
            <CardHeader>
              <Heading level={3}>Basics</Heading>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Stack gap={1}>
                  <Label htmlFor="name">
                    Name<span className="text-[var(--color-danger)]">*</span>
                  </Label>
                  <Input id="name" name="name" required />
                  {fieldErrors.name && (
                    <Text size="xs" className="text-[var(--color-danger)]">
                      {fieldErrors.name}
                    </Text>
                  )}
                </Stack>
                <Stack gap={1}>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" rows={3} />
                </Stack>
                <Stack direction="row" gap={3} wrap>
                  <Stack gap={1} className="w-[8rem]">
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      name="currency"
                      defaultValue="USD"
                      maxLength={3}
                      required
                    />
                  </Stack>
                  <Stack gap={1} className="min-w-[12rem]">
                    <Label htmlFor="channel">Channel</Label>
                    <select
                      id="channel"
                      name="channel"
                      defaultValue=""
                      className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
                    >
                      <option value="">all channels</option>
                      {CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Stack>
                  <Stack gap={1} className="w-[8rem]">
                    <Label htmlFor="priority">Priority</Label>
                    <Input id="priority" name="priority" defaultValue="0" />
                  </Stack>
                </Stack>
                <CardDescription>
                  Status starts as <strong>draft</strong> — flip it to active from the list page
                  once you&apos;ve added entries.
                </CardDescription>
              </Stack>
            </CardContent>
            <CardFooter>
              <Stack direction="row" gap={2} justify="between" align="center" className="w-full">
                {error && (
                  <Text size="sm" className="text-[var(--color-danger)]">
                    {error}
                  </Text>
                )}
                <Stack direction="row" gap={2} className="ml-auto">
                  <Button variant="ghost" asChild>
                    <Link href="/commerce/pricing">Cancel</Link>
                  </Button>
                  <Button color="module" type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Create price list'}
                  </Button>
                </Stack>
              </Stack>
            </CardFooter>
          </Card>
        </form>
      </Stack>
    </Container>
  );
}

function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function stringOr(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}
