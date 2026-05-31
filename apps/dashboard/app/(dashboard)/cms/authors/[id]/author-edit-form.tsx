'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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
  const [errorField, setErrorField] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    setMessage(null);
    const data = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateAuthor(author.id, data);
      if (!result.ok) {
        setError(result.error ?? 'Could not save author.');
        setErrorField(result.field ?? null);
        return;
      }
      setMessage('Saved.');
      router.refresh();
    });
  }

  function executeDelete() {
    setConfirmDelete(false);
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

  const slugError = errorField === 'slug' ? error : null;
  const generalError = errorField ? null : error;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={5}>
        <Card variant="module">
          <CardHeader>
            <Heading level={3}>Details</Heading>
          </CardHeader>
          <CardContent>
            <Stack gap={4}>
              <Stack gap={1}>
                <Label htmlFor="display_name" required>
                  Display name
                </Label>
                <Input
                  id="display_name"
                  name="display_name"
                  defaultValue={author.displayName}
                  required
                  aria-required
                />
              </Stack>
              <Stack gap={1}>
                <Label htmlFor="slug" required>
                  Slug
                </Label>
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={author.slug}
                  required
                  aria-required
                  aria-invalid={slugError ? true : undefined}
                  aria-describedby={slugError ? 'slug-error' : undefined}
                />
                {slugError ? (
                  <Text id="slug-error" size="xs" variant="danger" role="alert" aria-live="polite">
                    {slugError}
                  </Text>
                ) : (
                  <Text size="xs" variant="muted">
                    Unique per tenant — used in author URLs.
                  </Text>
                )}
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
                color="module"
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
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
              >
                Delete
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
        </Card>
      </Stack>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete author?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{author.displayName}</strong> will be removed. Any blog posts attributed to
              this author will keep their byline as a frozen string but lose the link back to the
              author record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete}>Delete author</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
