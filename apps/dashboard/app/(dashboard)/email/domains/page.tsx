import { Globe } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Stack,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';
import { EmailShell } from '../_components/email-shell';
import { AddDomainForm } from './_components/add-domain-form';
import { DomainCard } from './_components/domain-card';
import type { SendingDomainRow } from '../_lib/types';

export const dynamic = 'force-dynamic';

export default async function DomainsPage() {
  const domains = await api.get<SendingDomainRow[]>('/v1/email/domains');

  return (
    <EmailShell
      width="full"
      icon={<Globe className="h-5 w-5" />}
      title="Sending domains"
      description="Send from your own domain with automatic DKIM, SPF, and DMARC. Until a domain is verified, email sends from the shared Sparx domain."
    >
      <Card>
        <CardHeader>
          <CardTitle>Add a sending domain</CardTitle>
          <CardDescription>
            Enter the domain (or subdomain) you want to send from. Sparx provisions it in Mailgun
            and shows the exact DNS records to publish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddDomainForm />
        </CardContent>
      </Card>

      {domains.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-5 w-5" />}
          title="No sending domains yet"
          description="Add your first domain above to start sending from your own brand."
        />
      ) : (
        <Stack gap={4}>
          {domains.map((domain) => (
            <DomainCard key={domain.id} domain={domain} />
          ))}
        </Stack>
      )}
    </EmailShell>
  );
}
