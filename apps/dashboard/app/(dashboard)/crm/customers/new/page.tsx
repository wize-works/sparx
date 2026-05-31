'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

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
  NativeSelect,
} from '@sparx/ui';

import { createCustomerAction } from '../../actions';

// New-customer form. The action consumes the structured object directly
// (not FormData) because @sparx/crm-schemas owns the validation contract —
// we let Zod do its work server-side. This keeps the form free of any
// duplicate client-side schema and trusts the server as the source of truth.

export default function NewCustomerPage() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const input = {
      type: (form.get('type') as 'prospect' | 'retail' | 'b2b' | null) ?? 'prospect',
      firstName: nonEmpty(form.get('firstName')),
      lastName: nonEmpty(form.get('lastName')),
      email: nonEmpty(form.get('email')),
      phone: nonEmpty(form.get('phone')),
      company: nonEmpty(form.get('company')),
      jobTitle: nonEmpty(form.get('jobTitle')),
      // tags entered as comma-separated freeform; service-side schema
      // validates alphanumeric+-+_ — we pre-trim here.
      tags: nonEmpty(form.get('tags'))
        ?.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      doNotContact: form.get('doNotContact') === 'on',
    };

    startTransition(async () => {
      const result = await createCustomerAction(input);
      if (result.ok) {
        router.push(`/crm/customers/${result.data.id}`);
        router.refresh();
        return;
      }
      if (result.error.code === 'VALIDATION_ERROR' && result.error.details?.length) {
        const fe: Record<string, string> = {};
        for (const d of result.error.details) fe[d.field] = d.message;
        setFieldErrors(fe);
      }
      setError(result.error.message);
    });
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button color="primary" variant="link" size="sm" asChild>
            <Link href="/crm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to CRM
            </Link>
          </Button>
          <Heading level={1}>New customer</Heading>
          <Text variant="muted">
            Add a contact manually. Prospects can later be promoted to retail or B2B with no row
            migration.
          </Text>
        </Stack>

        <form onSubmit={onSubmit} noValidate>
          <Card>
            <CardHeader>
              <Heading level={3}>Profile</Heading>
              <CardDescription>
                Only the type is required — the rest is fillable later.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Stack gap={2}>
                  <Label htmlFor="type">Type</Label>
                  {/* Native select rather than @sparx/ui Select — that
                      component wraps Radix and needs controlled state /
                      onValueChange; native works directly with FormData. */}
                  <NativeSelect id="type" name="type" defaultValue="prospect">
                    <option value="prospect">Prospect</option>
                    <option value="retail">Retail customer</option>
                    <option value="b2b">B2B contact</option>
                  </NativeSelect>
                </Stack>

                <Stack direction="row" gap={4}>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="firstName">First name</Label>
                    <Input id="firstName" name="firstName" />
                    <FieldError msg={fieldErrors.firstName} />
                  </Stack>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input id="lastName" name="lastName" />
                    <FieldError msg={fieldErrors.lastName} />
                  </Stack>
                </Stack>

                <Stack gap={2}>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="jane@example.com" />
                  <FieldError msg={fieldErrors.email} />
                </Stack>

                <Stack gap={2}>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" name="phone" type="tel" />
                </Stack>

                <Stack direction="row" gap={4}>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="company">Company</Label>
                    <Input id="company" name="company" />
                  </Stack>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="jobTitle">Job title</Label>
                    <Input id="jobTitle" name="jobTitle" />
                  </Stack>
                </Stack>

                <Stack gap={2}>
                  <Label htmlFor="tags">Tags</Label>
                  <Textarea
                    id="tags"
                    name="tags"
                    rows={2}
                    placeholder="vip, fleet, gillett (comma-separated)"
                  />
                  <Text size="xs" variant="muted">
                    Alphanumeric, underscores, and dashes only. Max 50 tags, 63 chars each.
                  </Text>
                  <FieldError msg={fieldErrors['tags.0'] ?? fieldErrors.tags} />
                </Stack>

                <Stack direction="row" align="center" gap={2}>
                  <input
                    type="checkbox"
                    id="doNotContact"
                    name="doNotContact"
                    className="h-4 w-4"
                  />
                  <Label htmlFor="doNotContact">Do not contact</Label>
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
                <Link href="/crm">Cancel</Link>
              </Button>
              <Button type="submit" color="module" disabled={pending} loading={pending}>
                Create customer
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

function FieldError({ msg }: { msg: string | undefined }) {
  if (!msg) return null;
  return (
    <Text size="xs" variant="danger">
      {msg}
    </Text>
  );
}
