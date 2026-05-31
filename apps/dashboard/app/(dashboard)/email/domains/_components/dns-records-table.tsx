'use client';

import {
  Badge,
  Code,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { CopyButton } from './copy-button';
import type { DnsRecord } from '../../_lib/types';

function validBadge(valid: string) {
  if (valid === 'valid') return <Badge color="success">valid</Badge>;
  if (valid === 'invalid') return <Badge color="danger">invalid</Badge>;
  return <Badge variant="outline">unknown</Badge>;
}

// Renders the exact DNS records the merchant must publish at their registrar.
// Values are shown verbatim (the SPF string in particular must be copied
// exactly — Mailgun's verifier rejects any extra mechanisms).
export function DnsRecordsTable({ records }: { records: DnsRecord[] }) {
  if (records.length === 0) {
    return (
      <Text size="sm" variant="muted">
        No DNS records yet — they appear once the domain is provisioned.
      </Text>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Host / Name</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((r, i) => (
          <TableRow key={`${r.recordType}-${r.name}-${i}`}>
            <TableCell>
              <Badge variant="outline">{r.recordType}</Badge>
            </TableCell>
            <TableCell>
              <Stack direction="row" align="center" gap={1}>
                <Code>{r.name}</Code>
                <CopyButton value={r.name} label="host" />
              </Stack>
            </TableCell>
            <TableCell>
              <Stack direction="row" align="center" gap={1}>
                <Code className="break-all">{r.value}</Code>
                <CopyButton value={r.value} label="value" />
              </Stack>
            </TableCell>
            <TableCell>{validBadge(r.valid)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
