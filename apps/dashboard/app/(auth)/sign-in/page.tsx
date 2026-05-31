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
import { authClient } from '@sparx/auth/client';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message ?? 'Invalid email or password.');
      setSubmitting(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <Heading level={2}>Sign in</Heading>
        <CardDescription>Welcome back. Sign in to your merchant account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <Stack gap={4}>
            <Stack gap={2}>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Stack>
            <Stack gap={2}>
              <Stack direction="row" align="center" justify="between">
                <Label htmlFor="password">Password</Label>
                <Link href="/forgot-password">
                  <Text size="xs" variant="muted">
                    Forgot password?
                  </Text>
                </Link>
              </Stack>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Stack>

            {error && (
              <Text size="sm" variant="danger" role="alert" aria-live="polite">
                {error}
              </Text>
            )}

            <Button type="submit" disabled={submitting} loading={submitting}>
              Sign in
            </Button>
          </Stack>
        </form>
      </CardContent>
      <CardFooter>
        <Stack direction="row" align="center" gap={1}>
          <Text size="sm" variant="muted">
            New here?
          </Text>
          <Button color="primary" variant="link" size="sm" asChild>
            <Link href="/sign-up">Create an account</Link>
          </Button>
        </Stack>
      </CardFooter>
    </Card>
  );
}
