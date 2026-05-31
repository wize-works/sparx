'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button, Card, CardContent, Input, Label, Stack, Text, Textarea, toast } from '@sparx/ui';

import { updateEmailSettingsAction } from './actions';
import type { EmailSettingsView } from '../_lib/types';

interface SettingsFormProps {
  initial: EmailSettingsView;
}

export function SettingsForm({ initial }: SettingsFormProps) {
  const [pending, startTransition] = useTransition();
  const [fromName, setFromName] = useState(initial.fromName ?? '');
  const [fromAddress, setFromAddress] = useState(initial.fromAddress ?? '');
  const [replyTo, setReplyTo] = useState(initial.replyTo ?? '');
  const [physicalAddress, setPhysicalAddress] = useState(initial.physicalAddress ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});

    // No brand fields here on purpose — email brand (color, fonts, logo) is
    // inherited from the storefront theme set in Site Builder, never re-entered
    // per channel. brandingOverride is left untouched (the PATCH is partial).
    const input = {
      fromName: fromName.trim() || null,
      fromAddress: fromAddress.trim() || null,
      replyTo: replyTo.trim() || null,
      physicalAddress: physicalAddress.trim() || null,
    };

    startTransition(async () => {
      const result = await updateEmailSettingsAction(input);
      if (result.ok) {
        toast.success('Email settings saved.');
      } else if (result.error.details?.length) {
        setFieldErrors(Object.fromEntries(result.error.details.map((d) => [d.field, d.message])));
        toast.error('Please fix the highlighted fields.');
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={5} className="max-w-2xl">
        <Stack gap={2}>
          <Label htmlFor="fromName">From name</Label>
          <Input
            id="fromName"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Acme Store"
            disabled={pending}
          />
          <Text size="sm" variant="muted">
            The display name recipients see in their inbox.
          </Text>
          {fieldErrors.fromName ? (
            <Text size="sm" variant="danger">
              {fieldErrors.fromName}
            </Text>
          ) : null}
        </Stack>

        <Stack gap={2}>
          <Label htmlFor="fromAddress">From address</Label>
          <Input
            id="fromAddress"
            type="email"
            value={fromAddress}
            onChange={(e) => setFromAddress(e.target.value)}
            placeholder="orders@yourstore.com"
            disabled={pending}
          />
          <Text size="sm" variant="muted">
            Must be on a verified sending domain to send from your own brand.
          </Text>
          {fieldErrors.fromAddress ? (
            <Text size="sm" variant="danger">
              {fieldErrors.fromAddress}
            </Text>
          ) : null}
        </Stack>

        <Stack gap={2}>
          <Label htmlFor="replyTo">Reply-to address</Label>
          <Input
            id="replyTo"
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="support@yourstore.com"
            disabled={pending}
          />
          {fieldErrors.replyTo ? (
            <Text size="sm" variant="danger">
              {fieldErrors.replyTo}
            </Text>
          ) : null}
        </Stack>

        <Stack gap={2}>
          <Label htmlFor="physicalAddress">Physical mailing address</Label>
          <Textarea
            id="physicalAddress"
            value={physicalAddress}
            onChange={(e) => setPhysicalAddress(e.target.value)}
            placeholder={'Acme Store\n123 Main St\nVisalia, CA 93291'}
            rows={3}
            disabled={pending}
          />
          <Text size="sm" variant="muted">
            Required by CAN-SPAM / GDPR — shown in the footer of every email.
          </Text>
        </Stack>

        <Card variant="ghost">
          <CardContent>
            <Stack gap={2}>
              <Text size="sm" weight="medium">
                Brand is inherited from Site Builder
              </Text>
              <Text size="sm" variant="muted">
                Email colors, fonts, and logo come from your storefront theme — there&apos;s nothing
                to set per channel. Update your brand once and every transactional and marketing
                email adopts it automatically.
              </Text>
              <Button variant="link" size="sm" asChild>
                <Link href="/sitebuilder/themes">Manage brand in Site Builder →</Link>
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Stack direction="row" gap={2}>
          <Button type="submit" variant="module" loading={pending} disabled={pending}>
            Save settings
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
