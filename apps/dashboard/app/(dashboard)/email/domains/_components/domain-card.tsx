'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Star, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Code,
  Stack,
  Text,
  toast,
  type BadgeProps,
} from '@sparx/ui';

import { DnsRecordsTable } from './dns-records-table';
import { removeDomainAction, setDefaultDomainAction, verifyDomainAction } from '../actions';
import type { SendingDomainRow } from '../../_lib/types';

const STATE_BADGE: Record<
  SendingDomainRow['state'],
  { variant: BadgeProps['color']; label: string }
> = {
  verified: { variant: 'success', label: 'Verified' },
  pending: { variant: 'outline', label: 'Pending DNS' },
  verifying: { variant: 'warning', label: 'Verifying' },
  failed: { variant: 'danger', label: 'Failed' },
  disabled: { variant: 'default', label: 'Disabled' },
};

const STATE_HINT: Record<SendingDomainRow['state'], string> = {
  pending: 'Add the DNS records below at your registrar, then click Verify.',
  verifying:
    'DNS records not detected yet — propagation can take up to 48 hours. Verify again later.',
  verified: 'This domain is verified and ready to send.',
  failed: 'Verification failed. Double-check the records match exactly, then verify again.',
  disabled: 'This domain is disabled.',
};

export function DomainCard({ domain }: { domain: SendingDomainRow }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(domain.state !== 'verified');
  const badge = STATE_BADGE[domain.state];

  function verify() {
    startTransition(async () => {
      const result = await verifyDomainAction(domain.id);
      if (result.ok) {
        if (result.data.state === 'verified') toast.success(`${domain.domain} is verified.`);
        else toast.message('DNS not detected yet — try again after records propagate.');
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function makeDefault() {
    startTransition(async () => {
      const result = await setDefaultDomainAction(domain.id);
      if (result.ok) toast.success(`${domain.domain} is now the default sender.`);
      else toast.error(result.error.message);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeDomainAction(domain.id);
      if (result.ok) toast.success(`${domain.domain} removed.`);
      else toast.error(result.error.message);
    });
  }

  return (
    <Card variant="module">
      <CardHeader>
        <Stack direction="row" align="center" justify="between" gap={3} className="flex-wrap">
          <Stack direction="row" align="center" gap={2}>
            <Code>{domain.domain}</Code>
            <Badge color={badge.variant}>{badge.label}</Badge>
            {domain.isDefault ? <Badge color="module">Default</Badge> : null}
            <Badge variant="outline">{domain.region.toUpperCase()}</Badge>
          </Stack>
          <Stack direction="row" align="center" gap={2}>
            {domain.state !== 'verified' ? (
              <Button
                color="module"
                size="sm"
                onClick={verify}
                loading={pending}
                disabled={pending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Verify
              </Button>
            ) : null}
            {domain.state === 'verified' && !domain.isDefault ? (
              <Button
                color="module"
                variant="outline"
                size="sm"
                onClick={makeDefault}
                disabled={pending}
              >
                <Star className="h-3.5 w-3.5" />
                Make default
              </Button>
            ) : null}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Remove domain" disabled={pending}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {domain.domain}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the domain from Mailgun and Sparx. Email can no longer be sent from
                    it until you add and verify it again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={remove}>Remove domain</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Stack>
        </Stack>
      </CardHeader>
      <CardContent>
        <Stack gap={3}>
          <Text size="sm" variant="muted">
            {STATE_HINT[domain.state]}
          </Text>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            className="w-fit"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            DNS records
          </Button>
          {open ? <DnsRecordsTable records={domain.dnsRecords} /> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
