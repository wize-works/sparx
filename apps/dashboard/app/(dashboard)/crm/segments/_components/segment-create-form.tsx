'use client';

// New-segment form, surface-aware (§13.1). The SAME component renders:
//   - `surface="page"`   inside the /new route's Container + PageHeader
//   - `surface="overlay"` inside the `@detail` drawer/modal chrome
//
// The rule editor is a visual AND/OR/NOT tree builder over the SegmentRule
// shape — see ./rule-builder. previewCount runs against the live rule object
// so "X of Y match" reads against whatever the user has constructed in the
// tree. On success the overlay swaps to the new record's detail view (create
// flows into view); the page pushes to the record.

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Eye } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Heading,
  Input,
  Label,
  Stack,
  Text,
} from '@sparx/ui';

import { createSegmentAction, previewSegmentCountAction } from '../../segment-actions';
import { type Rule, RuleBuilder, defaultRule } from './rule-builder';

interface SegmentCreateFormProps {
  surface: 'page' | 'overlay';
}

export function SegmentCreateForm({ surface }: SegmentCreateFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [rule, setRule] = React.useState<Rule>(defaultRule);
  const [preview, setPreview] = React.useState<{
    matches: number;
    sampled: number;
    total: number;
  } | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  // After create: in an overlay, transition the token to the new record's
  // detail (preserving drawer vs modal); on a page, navigate to it.
  function onCreated(id: string) {
    if (surface === 'overlay') {
      const next = new URLSearchParams(searchParams ?? '');
      const mode = next.has('modal') ? 'modal' : 'drawer';
      next.delete('drawer');
      next.delete('modal');
      next.set(mode, `segment:${id}`);
      router.replace(`${pathname ?? '/'}?${next.toString()}`);
      router.refresh();
      return;
    }
    router.push(`/crm/segments/${id}`);
    router.refresh();
  }

  function closeOverlay() {
    const next = new URLSearchParams(searchParams ?? '');
    next.delete('drawer');
    next.delete('modal');
    const qs = next.toString();
    router.replace(qs ? `${pathname ?? '/'}?${qs}` : (pathname ?? '/'));
  }

  function runPreview() {
    setError(null);
    setPreviewing(true);
    startTransition(async () => {
      const result = await previewSegmentCountAction(rule);
      setPreviewing(false);
      if (!result.ok) {
        setError(result.error.message);
        setPreview(null);
        return;
      }
      setPreview(result.data);
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const input = {
      name: nonEmpty(form.get('name')),
      slug: nonEmpty(form.get('slug')),
      description: nonEmpty(form.get('description')),
      color: nonEmpty(form.get('color')),
      rules: rule,
    };
    startTransition(async () => {
      const result = await createSegmentAction(input);
      if (result.ok) {
        onCreated(result.data.id);
        return;
      }
      setError(result.error.message);
    });
  }

  return (
    <Stack gap={6}>
      {surface === 'overlay' && (
        <Stack gap={1}>
          <Heading level={2}>New segment</Heading>
          <Text size="sm" variant="muted">
            Segments are materialized incrementally; this rule is evaluated on every event that
            could change a customer&apos;s projection (orders, opens, clicks, B2B updates).
          </Text>
        </Stack>
      )}

      <form onSubmit={onSubmit} noValidate>
        <Stack gap={6}>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Stack direction="row" gap={4}>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" name="name" required placeholder="High-value customers" />
                  </Stack>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="slug">Slug</Label>
                    <Input
                      id="slug"
                      name="slug"
                      required
                      placeholder="high-value-customers"
                      pattern="^[a-z][a-z0-9-]*$"
                    />
                  </Stack>
                </Stack>
                <Stack gap={2}>
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" />
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Stack direction="row" align="center" justify="between">
                <CardTitle>Rule</CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={runPreview}
                  disabled={pending || previewing}
                  loading={previewing}
                  leftIcon={!previewing ? <Eye className="h-3.5 w-3.5" /> : undefined}
                >
                  Preview count
                </Button>
              </Stack>
            </CardHeader>
            <CardContent>
              <Stack gap={3}>
                <RuleBuilder value={rule} onChange={setRule} />
                {preview && (
                  <Stack
                    direction="row"
                    align="center"
                    gap={2}
                    className="rounded-md border border-[var(--color-border-default)] bg-[var(--module-active-soft)] p-3"
                  >
                    <Text size="sm">
                      <span className="font-medium tabular-nums">{preview.matches}</span> of{' '}
                      <span className="tabular-nums">{preview.sampled}</span> sampled match
                    </Text>
                    <Text size="xs" variant="muted">
                      ({preview.total} customers total)
                    </Text>
                  </Stack>
                )}
              </Stack>
            </CardContent>
            <CardFooter>
              {surface === 'overlay' ? (
                <Button type="button" variant="ghost" onClick={closeOverlay}>
                  Cancel
                </Button>
              ) : (
                <Button type="button" variant="ghost" asChild>
                  <Link href="/crm/segments">Cancel</Link>
                </Button>
              )}
              <Button type="submit" color="module" disabled={pending} loading={pending}>
                Create segment
              </Button>
            </CardFooter>
          </Card>

          {error && (
            <Text size="sm" variant="danger" role="alert" aria-live="polite">
              {error}
            </Text>
          )}
        </Stack>
      </form>
    </Stack>
  );
}

function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
