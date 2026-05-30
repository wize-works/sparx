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
  CardDescription,
  CardFooter,
  CardHeader,
  EmptyState,
  Heading,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';
import { ListTree, Plus, Trash2 } from 'lucide-react';
import { createTerm, deleteTerm } from '../actions';

export interface Term {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parent_term_id: string | null;
}

export function TermsManager({
  taxonomyKey,
  hierarchical,
  terms,
}: {
  taxonomyKey: string;
  hierarchical: boolean;
  terms: Term[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [parentId, setParentId] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState<Term | null>(null);

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    // Select writes to React state, not FormData.
    if (parentId) data.set('parent_term_id', parentId);
    else data.delete('parent_term_id');
    startTransition(async () => {
      const result = await createTerm(taxonomyKey, data);
      if (!result.ok) {
        setError(result.error ?? 'Could not create term.');
        return;
      }
      form.reset();
      setParentId('');
      setMessage('Term created.');
      router.refresh();
    });
  }

  function executeDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteTerm(taxonomyKey, target.id);
      if (!result.ok) {
        setError(result.error ?? 'Could not delete term.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <Stack gap={5}>
      <Card variant="module">
        <CardHeader>
          <Heading level={3}>Add term</Heading>
          <CardDescription>
            Slug auto-derives from the name when blank.
            {hierarchical && (
              <>
                {' '}
                Pick <em>(top level)</em> for a root-level term.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <form onSubmit={onCreate}>
          <CardContent>
            <Stack gap={4}>
              <Stack direction="row" gap={3}>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="name" required>
                    Name
                  </Label>
                  <Input id="name" name="name" required aria-required />
                </Stack>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="slug">Slug (optional)</Label>
                  <Input id="slug" name="slug" />
                </Stack>
                {hierarchical && (
                  <Stack gap={1} className="flex-1">
                    <Label htmlFor="parent_term_id">Parent</Label>
                    <Select
                      value={parentId || 'top'}
                      onValueChange={(v) => setParentId(v === 'top' ? '' : v)}
                    >
                      <SelectTrigger id="parent_term_id" aria-label="Parent term">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="top">— (top level)</SelectItem>
                        {terms.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Stack>
                )}
              </Stack>
              <Stack gap={1}>
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" name="description" rows={2} />
              </Stack>
            </Stack>
          </CardContent>
          <CardFooter>
            <Stack direction="row" align="center" gap={3}>
              <Button
                type="submit"
                variant="module"
                leftIcon={<Plus className="h-4 w-4" />}
                disabled={pending}
                loading={pending}
              >
                Add term
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
        </form>
      </Card>

      <Card variant="module">
        <CardHeader>
          <Heading level={3}>Terms</Heading>
        </CardHeader>
        <CardContent>
          {terms.length === 0 ? (
            <EmptyState
              icon={<ListTree className="h-5 w-5" />}
              title="No terms yet"
              description="Add your first term above. Tagging entries with a term groups them on storefront index pages and feeds."
            />
          ) : (
            <Stack gap={2}>
              {terms.map((t) => (
                <Stack
                  key={t.id}
                  direction="row"
                  align="center"
                  justify="between"
                  className="rounded-md border border-[var(--color-border-default)] px-3 py-2"
                >
                  <Stack gap={0}>
                    <Text size="sm">{t.name}</Text>
                    <Text size="xs" variant="muted">
                      <code>{t.slug}</code>
                      {t.parent_term_id ? ` · parent ${t.parent_term_id.slice(0, 8)}` : ''}
                      {t.description ? ` · ${t.description.slice(0, 60)}` : ''}
                    </Text>
                  </Stack>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    leftIcon={<Trash2 className="h-3 w-3" />}
                    onClick={() => setPendingDelete(t)}
                    disabled={pending}
                  >
                    Remove
                  </Button>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete term?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{pendingDelete?.name}</strong> will be removed. Entries currently tagged with
              it will be untagged — they stay published, but the term link is dropped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete}>Delete term</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
}
