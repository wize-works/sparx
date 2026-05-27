'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
} from '@sparx/ui';
import { signUpAction } from '../actions';

export default function SignUpPage() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);

    startTransition(async () => {
      const result = await signUpAction(formData);
      if (!result.ok) {
        setError(result.error ?? 'Could not create account.');
        return;
      }
      router.push('/');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <Heading level={2}>Create your Sparx account</Heading>
        <CardDescription>
          Start a 14-day free trial — no card required. You can add modules from billing anytime.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <Stack gap={4}>
            <Stack gap={2}>
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </Stack>
            <Stack gap={2}>
              <Label htmlFor="storeName">Store name</Label>
              <Input
                id="storeName"
                name="storeName"
                autoComplete="organization"
                placeholder="Acme Diesel"
                required
              />
            </Stack>
            <Stack gap={2}>
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Stack>
            <Stack gap={2}>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <Text size="xs" variant="muted">
                At least 8 characters.
              </Text>
            </Stack>

            {error && (
              <Text size="sm" variant="danger" role="alert" aria-live="polite">
                {error}
              </Text>
            )}

            <Button type="submit" disabled={pending} loading={pending}>
              Create account
            </Button>
          </Stack>
        </form>
      </CardContent>
      <CardFooter>
        <Stack direction="row" align="center" gap={1}>
          <Text size="sm" variant="muted">
            Already have an account?
          </Text>
          <Button variant="link" size="sm" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </Stack>
      </CardFooter>
    </Card>
  );
}
