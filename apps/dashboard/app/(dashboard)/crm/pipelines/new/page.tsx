'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

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
} from '@sparx/ui';

import { createPipelineAction } from '../../pipeline-actions';

// New-pipeline form. Stages are added separately from the edit page after
// creation — keeping create simple lets the user pick a template later.

export default function NewPipelinePage() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const input = {
      name: nonEmpty(form.get('name')),
      slug: nonEmpty(form.get('slug')),
      isDefault: form.get('isDefault') === 'on',
      sortOrder: 0,
    };

    startTransition(async () => {
      const result = await createPipelineAction(input);
      if (result.ok) {
        router.push(`/crm/pipelines/${result.data.id}/edit`);
        router.refresh();
        return;
      }
      setError(result.error.message);
    });
  }

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/crm/pipelines">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to pipelines
            </Link>
          </Button>
          <Heading level={1}>New pipeline</Heading>
          <Text variant="muted">
            Create the pipeline shell now; add stages on the edit screen next.
          </Text>
        </Stack>

        <form onSubmit={onSubmit} noValidate>
          <Card>
            <CardHeader>
              <CardTitle>Pipeline details</CardTitle>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Stack gap={2}>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required placeholder="Fleet contract renewals" />
                </Stack>
                <Stack gap={2}>
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    name="slug"
                    required
                    placeholder="fleet-contract-renewals"
                    pattern="^[a-z][a-z0-9-]*$"
                  />
                  <Text size="xs" variant="muted">
                    Lowercase kebab-case. Used as the URL identifier.
                  </Text>
                </Stack>
                <Stack direction="row" align="center" gap={2}>
                  <input type="checkbox" id="isDefault" name="isDefault" className="h-4 w-4" />
                  <Label htmlFor="isDefault">Make this the default pipeline</Label>
                </Stack>

                {error && (
                  <Text size="sm" variant="danger" role="alert" aria-live="polite">
                    {error}
                  </Text>
                )}
              </Stack>
            </CardContent>
            <CardFooter>
              <Button variant="ghost" asChild>
                <Link href="/crm/pipelines">Cancel</Link>
              </Button>
              <Button type="submit" variant="module" disabled={pending} loading={pending}>
                Create pipeline
              </Button>
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
  return trimmed.length > 0 ? trimmed : undefined;
}
