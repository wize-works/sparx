'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  Heading,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';
import { Save, Trash2 } from 'lucide-react';
import { deleteAuthor, updateAuthor } from '../actions';

export interface EditableAuthor {
  id: string;
  displayName: string;
  slug: string;
  bio: string;
}

export function AuthorEditForm({ author }: { author: EditableAuthor }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateAuthor(author.id, data);
      if (!result.ok) {
        setError(result.error ?? 'Could not save author.');
        return;
      }
      setMessage('Saved.');
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(`Delete author "${author.displayName}"?`)) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteAuthor(author.id);
      if (!result.ok) {
        setError(result.error ?? 'Could not delete.');
        return;
      }
      router.push('/cms/authors');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={5}>
        <Card>
          <CardHeader>
            <Heading level={3}>Details</Heading>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack gap={1}>
                <Label htmlFor="display_name">Display name</Label>
                <Input
                  id="display_name"
                  name="display_name"
                  defaultValue={author.displayName}
                  required
                />
              </Stack>
              <Stack gap={1}>
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" name="slug" defaultValue={author.slug} required />
                <Text size="xs" variant="muted">
                  Unique per tenant — used in author URLs.
                </Text>
              </Stack>
              <Stack gap={1}>
                <Label htmlFor="bio">Bio</Label>
                <Textarea id="bio" name="bio" defaultValue={author.bio} rows={4} />
              </Stack>
            </Stack>
          </CardContent>
          <CardFooter>
            <Stack direction="row" align="center" gap={3}>
              <Button
                type="submit"
                variant="module"
                leftIcon={<Save className="h-4 w-4" />}
                disabled={pending}
                loading={pending}
              >
                Save changes
              </Button>
              <Button
                type="button"
                variant="ghost"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={onDelete}
                disabled={pending}
              >
                Delete
              </Button>
              {error && (
                <Text size="sm" variant="danger" role="alert" aria-live="polite">
                  {error}
                </Text>
              )}
              {message && (
                <Text size="sm" variant="success" aria-live="polite">
                  {message}
                </Text>
              )}
            </Stack>
          </CardFooter>
        </Card>
      </Stack>
    </form>
  );
}
