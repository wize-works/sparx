'use client';

// New-segment page. The rule editor is a JSON textarea — the visual
// rule builder is a follow-up. previewCount runs server-side on debounce
// so you can see "X of Y match" before saving.

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  Heading,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';

import { createSegmentAction, previewSegmentCountAction } from '../../segment-actions';

const EXAMPLE_RULE = JSON.stringify(
  {
    kind: 'predicate',
    field: 'customer.totalSpent',
    op: 'gte',
    value: 5000,
  },
  null,
  2
);

export default function NewSegmentPage() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [rule, setRule] = React.useState<string>(EXAMPLE_RULE);
  const [preview, setPreview] = React.useState<{
    matches: number;
    sampled: number;
    total: number;
  } | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  function runPreview() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rule);
    } catch {
      setError('Rule is not valid JSON');
      return;
    }
    setPreviewing(true);
    startTransition(async () => {
      const result = await previewSegmentCountAction(parsed);
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
    let parsedRule: unknown;
    try {
      parsedRule = JSON.parse(rule);
    } catch {
      setError('Rule is not valid JSON');
      return;
    }
    const form = new FormData(e.currentTarget);
    const input = {
      name: nonEmpty(form.get('name')),
      slug: nonEmpty(form.get('slug')),
      description: nonEmpty(form.get('description')),
      color: nonEmpty(form.get('color')),
      rules: parsedRule,
    };

    startTransition(async () => {
      const result = await createSegmentAction(input);
      if (result.ok) {
        router.push(`/crm/segments/${result.data.id}`);
        router.refresh();
        return;
      }
      setError(result.error.message);
    });
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/crm/segments">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to segments
            </Link>
          </Button>
          <Heading level={1}>New segment</Heading>
          <Text variant="muted">
            Segments are materialized incrementally; this rule is evaluated on every event that
            could change a customer's projection (orders, opens, clicks, B2B updates).
          </Text>
        </Stack>

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
                  <Textarea
                    value={rule}
                    onChange={(e) => setRule(e.target.value)}
                    rows={14}
                    className="font-mono text-xs"
                    spellCheck={false}
                  />
                  <Text size="xs" variant="muted">
                    Predicate leaves: <code>{'{ kind, field, op, value }'}</code>. Compose with{' '}
                    <code>{'{ kind: "and"|"or", children: [...] }'}</code> or{' '}
                    <code>{'{ kind: "not", child: {...} }'}</code>. See the docs for the field +
                    operator whitelist.
                  </Text>
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
                <Button variant="ghost" asChild>
                  <Link href="/crm/segments">Cancel</Link>
                </Button>
                <Button type="submit" variant="module" disabled={pending} loading={pending}>
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
    </Container>
  );
}

function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
