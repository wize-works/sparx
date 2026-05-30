import { Workflow } from 'lucide-react';
import { Card, CardContent, EmptyState, Stack, Text } from '@sparx/ui';

import { api } from '@/lib/api-rest-client';
import { EmailShell } from '../_components/email-shell';
import { AutomationsList } from './_components/automations-list';
import { BootstrapButton } from './_components/bootstrap-button';
import type { AutomationRow } from '../_lib/types';

export const dynamic = 'force-dynamic';

export default async function AutomationsPage() {
  const automations = await api.get<AutomationRow[]>('/v1/email/automations');

  return (
    <EmailShell
      current="automations"
      icon={<Workflow className="h-5 w-5" />}
      title="Automations"
      description="Event-triggered flows. Default automations fire on commerce and CRM events; toggle and tune each one."
    >
      {automations.length === 0 ? (
        <Card>
          <CardContent>
            <Stack gap={4} align="center" className="py-6">
              <EmptyState
                icon={<Workflow className="h-5 w-5" />}
                title="No automations yet"
                description="Provision the default automations (order confirmed, shipped, abandoned cart, win-back, and more) to get started. You can tune or disable each one."
              />
              <BootstrapButton />
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Stack gap={4}>
          <Text size="sm" variant="muted">
            Some automations send only once their content template ships; configuration is saved
            either way.
          </Text>
          <AutomationsList automations={automations} />
        </Stack>
      )}
    </EmailShell>
  );
}
