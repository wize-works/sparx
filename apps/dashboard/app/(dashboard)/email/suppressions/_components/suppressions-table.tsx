'use client';

import { useTransition } from 'react';
import { ShieldOff, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Code,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
  type BadgeProps,
} from '@sparx/ui';

import { removeSuppressionAction } from '../actions';
import type { SuppressionRow } from '../../_lib/types';

const SCOPE_BADGE: Record<SuppressionRow['scope'], BadgeProps['variant']> = {
  all: 'default',
  marketing: 'soft',
  transactional: 'outline',
};

const REASON_BADGE: Record<SuppressionRow['reason'], BadgeProps['variant']> = {
  bounce: 'danger',
  complaint: 'danger',
  unsubscribe: 'warning',
  manual: 'default',
};

function RemoveButton({ id, email }: { id: string; email: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Remove ${email}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeSuppressionAction(id);
          if (result.ok) toast.success(`${email} removed from suppressions.`);
          else toast.error(result.error.message);
        })
      }
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

export function SuppressionsTable({ items }: { items: SuppressionRow[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShieldOff className="h-5 w-5" />}
        title="No suppressed addresses"
        description="Bounces, complaints, and unsubscribes will appear here automatically, and you can add addresses manually above."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Scope</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Added</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Code>{row.email}</Code>
            </TableCell>
            <TableCell>
              <Badge variant={SCOPE_BADGE[row.scope]}>{row.scope}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={REASON_BADGE[row.reason]}>{row.reason}</Badge>
            </TableCell>
            <TableCell>{row.source ?? '—'}</TableCell>
            <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
            <TableCell>
              <RemoveButton id={row.id} email={row.email} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
