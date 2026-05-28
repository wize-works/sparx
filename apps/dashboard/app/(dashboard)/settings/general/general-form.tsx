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
  CardTitle,
  Input,
  Label,
  Stack,
  Text,
} from '@sparx/ui';
import { updateGeneralSettings } from './actions';

export interface GeneralFormProps {
  tenant: {
    name: string;
    email: string;
    slug: string;
    plan: string;
  };
}

export function GeneralForm({ tenant }: GeneralFormProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateGeneralSettings(formData);
      if (!result.ok) {
        setError(result.error ?? 'Could not save changes.');
        return;
      }
      setMessage('Settings saved.');
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>How your store identifies itself across Sparx.</CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap={4}>
            <Stack gap={2}>
              <Label htmlFor="name">Store name</Label>
              <Input id="name" name="name" defaultValue={tenant.name} required />
            </Stack>
            <Stack gap={2}>
              <Label htmlFor="email">Contact email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={tenant.email}
                required
              />
              <Text size="xs" variant="muted">
                Receives billing and account notifications.
              </Text>
            </Stack>
            <Stack gap={2}>
              <Label htmlFor="slug">Store URL</Label>
              <Input id="slug" name="slug" defaultValue={tenant.slug} disabled />
              <Text size="xs" variant="muted">
                The slug your tenant is keyed by. Contact support to change.
              </Text>
            </Stack>
            <Stack gap={2}>
              <Label htmlFor="plan">Plan</Label>
              <Input id="plan" name="plan" defaultValue={tenant.plan} disabled />
            </Stack>

            {error && (
              <Text size="sm" variant="danger" role="alert" aria-live="polite">
                {error}
              </Text>
            )}
            {message && (
              <Text size="sm" variant="success" role="status" aria-live="polite">
                {message}
              </Text>
            )}
          </Stack>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending} loading={pending}>
            Save changes
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
