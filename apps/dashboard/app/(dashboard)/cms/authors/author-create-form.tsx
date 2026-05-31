'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
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
import { UserPlus } from 'lucide-react';
import { createAuthor } from './actions';

export function AuthorCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [errorField, setErrorField] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    setMessage(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await createAuthor(data);
      if (!result.ok) {
        setError(result.error ?? 'Could not create author.');
        setErrorField(result.field ?? null);
        return;
      }
      form.reset();
      setMessage('Author created.');
      router.refresh();
    });
  }

  const slugError = errorField === 'slug' ? error : null;
  const generalError = errorField ? null : error;

  return (
    <Card variant="module">
      <CardHeader>
        <Heading level={3}>Add author</Heading>
        <CardDescription>
          Slug auto-derives from the display name when omitted; must be unique within the tenant.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent>
          <Stack gap={4}>
            <Stack direction="row" gap={3}>
              <Stack gap={1} className="flex-1">
                <Label htmlFor="display_name" required>
                  Display name
                </Label>
                <Input
                  id="display_name"
                  name="display_name"
                  placeholder="Jane Doe"
                  required
                  aria-required
                />
              </Stack>
              <Stack gap={1} className="flex-1">
                <Label htmlFor="slug">Slug (optional)</Label>
                <Input
                  id="slug"
                  name="slug"
                  placeholder="jane-doe"
                  aria-invalid={slugError ? true : undefined}
                  aria-describedby={slugError ? 'slug-error' : undefined}
                />
                {slugError && (
                  <Text id="slug-error" size="xs" variant="danger" role="alert" aria-live="polite">
                    {slugError}
                  </Text>
                )}
              </Stack>
            </Stack>
            <Stack gap={1}>
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" name="bio" rows={3} placeholder="Short author blurb…" />
            </Stack>
          </Stack>
        </CardContent>
        <CardFooter>
          <Stack direction="row" align="center" gap={3}>
            <Button
              type="submit"
              color="module"
              leftIcon={<UserPlus className="h-4 w-4" />}
              disabled={pending}
              loading={pending}
            >
              Add author
            </Button>
            {generalError && (
              <Text size="sm" variant="danger" role="alert" aria-live="polite">
                {generalError}
              </Text>
            )}
            {message && (
              <Text size="sm" variant="success" aria-live="polite">
                {message}
              </Text>
            )}
          </Stack>
        </CardFooter>
      </form>
    </Card>
  );
}
