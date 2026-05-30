'use client';

import { useState, useTransition } from 'react';
import { Button, ColorPicker, Input, Label, Stack, Text, Textarea, toast } from '@sparx/ui';

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
  const [brandColor, setBrandColor] = useState(
    initial.brandingOverride.colors?.primary ?? '#6366F1'
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});

    const input = {
      fromName: fromName.trim() || null,
      fromAddress: fromAddress.trim() || null,
      replyTo: replyTo.trim() || null,
      physicalAddress: physicalAddress.trim() || null,
      brandingOverride: {
        ...initial.brandingOverride,
        colors: { primary: brandColor },
      },
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

        <Stack gap={2}>
          <Label htmlFor="brandColor">Brand color</Label>
          <ColorPicker value={brandColor} onChange={setBrandColor} disabled={pending} />
          <Text size="sm" variant="muted">
            Used for buttons and links until your storefront theme is published, after which email
            adopts your storefront brand automatically.
          </Text>
        </Stack>

        <Stack direction="row" gap={2}>
          <Button type="submit" variant="module" loading={pending} disabled={pending}>
            Save settings
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
