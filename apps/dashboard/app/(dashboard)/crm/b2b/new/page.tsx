'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  Heading,
  Input,
  Label,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';

import { createB2bAccountAction } from '../../b2b-actions';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]';

export default function NewB2bAccountPage() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const input = {
      companyName: nonEmpty(form.get('companyName')),
      taxId: nonEmpty(form.get('taxId')),
      website: nonEmpty(form.get('website')),
      pricingTier: nonEmpty(form.get('pricingTier')),
      creditLimit: numOrZero(form.get('creditLimit')),
      discountPercent: numOrZero(form.get('discountPercent')),
      status: nonEmpty(form.get('status')) ?? 'active',
      paymentTerms: nonEmpty(form.get('paymentTerms')),
      fleetSize: form.get('fleetSize') ? Number(form.get('fleetSize')) : undefined,
      notes: nonEmpty(form.get('notes')),
    };

    startTransition(async () => {
      const result = await createB2bAccountAction(input);
      if (result.ok) {
        router.push(`/crm/b2b/${result.data.id}`);
        router.refresh();
        return;
      }
      setError(result.error.message);
    });
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button variant="link" size="sm" asChild>
            <Link href="/crm/b2b">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to B2B accounts
            </Link>
          </Button>
          <Heading level={1}>New B2B account</Heading>
          <Text variant="muted">
            Track a wholesale or fleet customer's pricing, credit, and engine profile so commerce
            modules can quote, ship, and invoice them consistently.
          </Text>
        </Stack>

        <form onSubmit={onSubmit} noValidate>
          <Card>
            <CardHeader>
              <CardTitle>Account details</CardTitle>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Stack gap={2}>
                  <Label htmlFor="companyName">Company name</Label>
                  <Input id="companyName" name="companyName" required />
                </Stack>
                <Stack direction="row" gap={4}>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="taxId">Tax ID</Label>
                    <Input id="taxId" name="taxId" />
                  </Stack>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" name="website" type="url" placeholder="https://example.com" />
                  </Stack>
                </Stack>
                <Stack direction="row" gap={4}>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="pricingTier">Pricing tier</Label>
                    <Input id="pricingTier" name="pricingTier" placeholder="bronze, silver, gold…" />
                  </Stack>
                  <Stack gap={2} className="w-40">
                    <Label htmlFor="status">Status</Label>
                    <select id="status" name="status" defaultValue="active" className={SELECT_CLASS}>
                      <option value="active">Active</option>
                      <option value="on_hold">On hold</option>
                      <option value="closed">Closed</option>
                    </select>
                  </Stack>
                </Stack>
                <Stack direction="row" gap={4}>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="creditLimit">Credit limit</Label>
                    <Input id="creditLimit" name="creditLimit" type="number" min="0" step="0.01" defaultValue={0} />
                  </Stack>
                  <Stack gap={2} className="w-40">
                    <Label htmlFor="discountPercent">Discount %</Label>
                    <Input
                      id="discountPercent"
                      name="discountPercent"
                      type="number"
                      min="0"
                      max="100"
                      defaultValue={0}
                    />
                  </Stack>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="paymentTerms">Payment terms</Label>
                    <select id="paymentTerms" name="paymentTerms" defaultValue="" className={SELECT_CLASS}>
                      <option value="">(unspecified)</option>
                      <option value="due_on_receipt">Due on receipt</option>
                      <option value="net_15">Net 15</option>
                      <option value="net_30">Net 30</option>
                      <option value="net_45">Net 45</option>
                      <option value="net_60">Net 60</option>
                      <option value="net_90">Net 90</option>
                    </select>
                  </Stack>
                  <Stack gap={2} className="w-32">
                    <Label htmlFor="fleetSize">Fleet size</Label>
                    <Input id="fleetSize" name="fleetSize" type="number" min="0" />
                  </Stack>
                </Stack>
                <Stack gap={2}>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" rows={4} />
                </Stack>

                {error && (
                  <Text size="sm" variant="danger" role="alert" aria-live="polite">
                    {error}
                  </Text>
                )}
              </Stack>
            </CardContent>
            <CardFooter>
              <Button variant="ghost" asChild>
                <Link href="/crm/b2b">Cancel</Link>
              </Button>
              <Button type="submit" variant="module" disabled={pending} loading={pending}>
                Create B2B account
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

function numOrZero(value: FormDataEntryValue | null): number {
  const s = typeof value === 'string' ? value.trim() : '';
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
