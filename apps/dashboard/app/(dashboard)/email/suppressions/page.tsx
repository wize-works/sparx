import { ShieldOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sparx/ui';

import { api } from '@/lib/api-rest-client';
import { EmailShell } from '../_components/email-shell';
import { AddSuppressionForm } from './_components/add-suppression-form';
import { SuppressionsTable } from './_components/suppressions-table';
import type { SuppressionRow } from '../_lib/types';

export const dynamic = 'force-dynamic';

export default async function SuppressionsPage() {
  const { data: items, meta } = await api.getPaged<SuppressionRow[]>('/v1/email/suppressions');
  const total = typeof meta?.total === 'number' ? meta.total : items.length;

  return (
    <EmailShell
      current="suppressions"
      icon={<ShieldOff className="h-5 w-5" />}
      title="Suppressions"
      description="Addresses that are never emailed. Bounces, complaints, and unsubscribes are added automatically; you can also suppress addresses manually."
    >
      <Card>
        <CardHeader>
          <CardTitle>Suppress an address</CardTitle>
          <CardDescription>
            Add one or many addresses to the do-not-send list. Choose whether to block all email or
            just marketing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddSuppressionForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suppressed addresses ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          <SuppressionsTable items={items} />
        </CardContent>
      </Card>
    </EmailShell>
  );
}
