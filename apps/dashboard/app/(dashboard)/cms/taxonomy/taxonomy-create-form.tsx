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
  Checkbox,
  Heading,
  Input,
  Label,
  Stack,
  Text,
} from '@sparx/ui';
import { Plus } from 'lucide-react';
import { createTaxonomy } from './actions';

export function TaxonomyCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [hierarchical, setHierarchical] = React.useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const form = e.currentTarget;
    // <Checkbox> writes to React state, not native FormData. Inject the value
    // before the server action reads it.
    const data = new FormData(form);
    if (hierarchical) data.set('hierarchical', 'on');
    else data.delete('hierarchical');
    startTransition(async () => {
      const result = await createTaxonomy(data);
      if (!result.ok) {
        setError(result.error ?? 'Could not create taxonomy.');
        return;
      }
      form.reset();
      setHierarchical(false);
      setMessage('Taxonomy created.');
      router.refresh();
    });
  }

  return (
    <Card variant="module">
      <CardHeader>
        <Heading level={3}>Add taxonomy</Heading>
        <CardDescription>
          The <code>key</code> is the stable identifier the API uses (e.g.{' '}
          <code>blog_category</code>).
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent>
          <Stack gap={4}>
            <Stack direction="row" gap={3}>
              <Stack gap={1} className="flex-1">
                <Label htmlFor="key" required>
                  Key
                </Label>
                <Input id="key" name="key" placeholder="blog_category" required aria-required />
              </Stack>
              <Stack gap={1} className="flex-1">
                <Label htmlFor="name" required>
                  Name
                </Label>
                <Input id="name" name="name" placeholder="Category" required aria-required />
              </Stack>
              <Stack gap={1} className="flex-1">
                <Label htmlFor="plural_name" required>
                  Plural
                </Label>
                <Input
                  id="plural_name"
                  name="plural_name"
                  placeholder="Categories"
                  required
                  aria-required
                />
              </Stack>
            </Stack>
            <Stack direction="row" align="center" gap={2}>
              <Checkbox
                id="hierarchical"
                checked={hierarchical}
                onCheckedChange={(next) => setHierarchical(next === true)}
              />
              <Label htmlFor="hierarchical">Allow parent / child term nesting</Label>
            </Stack>
          </Stack>
        </CardContent>
        <CardFooter>
          <Stack direction="row" align="center" gap={3}>
            <Button
              type="submit"
              color="module"
              leftIcon={<Plus className="h-4 w-4" />}
              disabled={pending}
              loading={pending}
            >
              Add taxonomy
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
  );
}
