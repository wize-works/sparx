import { Users } from 'lucide-react';

import { requireSession } from '@sparx/auth';
import { customerService } from '@sparx/crm';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { CrmTabs } from '../_components/crm-tabs';
import { MergeCandidatesGroup } from './_components/merge-candidates-group';

// Find-duplicates landing — surfaces groups of customers that share an email
// or share (last name, company). Picks the most-recently-updated of each
// group as the suggested primary so a merge defaults to a sensible target.

export const dynamic = 'force-dynamic';

export default async function DuplicatesPage() {
  const session = await requireSession();
  const groups = await customerService.findLikelyDuplicates(
    { tenantId: session.user.tenantId, userId: session.user.id },
    { limit: 5000 }
  );

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <CrmTabs current="duplicates" />
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={3}>
            <Heading level={1}>Find duplicates</Heading>
            <Badge variant="module">
              {groups.length} group{groups.length === 1 ? '' : 's'}
            </Badge>
          </Stack>
          <Text variant="muted">
            Customers grouped by shared email, or by matching last name + company. Merge folds
            duplicates into a chosen primary — all activities, deals, and tasks reattach
            automatically.
          </Text>
        </Stack>

        {groups.length === 0 ? (
          <Card padding="none">
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title="No duplicates found"
              description="The CRM scanned the most-recently-updated customers and didn't find any obvious duplicates."
            />
          </Card>
        ) : (
          <Stack gap={4}>
            {groups.map((group, idx) => (
              <Card key={`${group.reason}-${idx}`}>
                <CardHeader>
                  <Stack direction="row" align="center" gap={2}>
                    <CardTitle>
                      {group.reason === 'email' ? 'Shared email' : 'Same last name + company'}
                    </CardTitle>
                    <Badge variant="outline">{group.customers.length} records</Badge>
                  </Stack>
                </CardHeader>
                <CardContent>
                  <MergeCandidatesGroup customers={group.customers} />
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
