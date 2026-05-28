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
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';
import { ArrowLeft } from 'lucide-react';
import { createPage } from '../actions';

export default function NewPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createPage(formData);
      if (!result.ok || !result.data) {
        setError(result.error ?? 'Could not create page.');
        return;
      }
      router.push(`/cms/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/cms">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to pages
            </Link>
          </Button>
          <Heading level={1}>New page</Heading>
        </Stack>

        <form onSubmit={onSubmit} noValidate>
          <Card>
            <CardHeader>
              <Heading level={3}>Page basics</Heading>
              <CardDescription>You can edit everything after creation.</CardDescription>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Stack gap={2}>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" required />
                </Stack>
                <Stack gap={2}>
                  <Label htmlFor="slug">Slug (optional)</Label>
                  <Input id="slug" name="slug" placeholder="auto-derived from title" />
                  <Text size="xs" variant="muted">
                    Lowercase letters, numbers, and dashes only.
                  </Text>
                </Stack>
                <Stack gap={2}>
                  <Label htmlFor="content">Content (optional)</Label>
                  <Textarea id="content" name="content" rows={6} />
                </Stack>

                {error && (
                  <Text size="sm" variant="danger" role="alert" aria-live="polite">
                    {error}
                  </Text>
                )}
              </Stack>
            </CardContent>
            <CardFooter>
              <Button type="button" variant="ghost" asChild>
                <Link href="/cms">Cancel</Link>
              </Button>
              <Button type="submit" variant="module" disabled={pending} loading={pending}>
                Create page
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Stack>
    </Container>
  );
}
