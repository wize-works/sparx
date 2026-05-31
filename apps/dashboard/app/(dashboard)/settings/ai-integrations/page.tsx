// AI Integrations settings — issue, list, and revoke scoped API keys for
// the MCP transport (mcp.sparx.works). Server component fetches the list;
// the client-side IssueKeyForm + RevokeKeyButton live in ./_components.

import Link from 'next/link';
import { ArrowLeft, KeyRound } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';

import { listApiKeysForCurrentTenant } from './actions';
import { IssueKeyForm } from './_components/issue-key-form';
import { ApiKeyRow } from './_components/api-key-row';

export const dynamic = 'force-dynamic';

export default async function AiIntegrationsPage() {
  const keys = await listApiKeysForCurrentTenant();
  const live = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Button color="primary" variant="link" size="sm" asChild>
            <Link href="/settings">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to settings
            </Link>
          </Button>
          <Stack direction="row" align="center" gap={2}>
            <KeyRound className="h-5 w-5" />
            <Heading level={1}>AI Integrations</Heading>
          </Stack>
          <Text variant="muted">
            Issue API keys for Claude Desktop, ChatGPT custom GPTs, or Microsoft Copilot. Each key
            is scoped — grant only the permissions the assistant needs. Keys are shown once at
            issuance; copy and store securely.
          </Text>
        </Stack>

        <Card>
          <CardHeader>
            <CardTitle>Issue a new key</CardTitle>
          </CardHeader>
          <CardContent>
            <IssueKeyForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active keys ({live.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {live.length === 0 ? (
              <Text size="sm" variant="muted">
                No active keys yet. Use the form above to issue one.
              </Text>
            ) : (
              <Stack gap={2}>
                {live.map((k) => (
                  <ApiKeyRow key={k.id} apiKey={k} />
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        {revoked.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Revoked ({revoked.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Stack gap={2}>
                {revoked.map((k) => (
                  <ApiKeyRow key={k.id} apiKey={k} />
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
