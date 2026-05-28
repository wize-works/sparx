import { Mail } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Code,
  Container,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';
import { TestSendForm } from './test-send-form';
import { readLastDevSend } from './actions';

export const dynamic = 'force-dynamic';

export default async function EmailPage() {
  const lastSend = await readLastDevSend();
  const provider = (process.env.SPARX_EMAIL_PROVIDER ?? 'console').toLowerCase();

  return (
    <Container size="xl">
      <Stack gap={8} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Mail className="h-5 w-5 text-[var(--module-active)]" />
            <Heading level={1}>Email</Heading>
            <Badge variant="module">Active</Badge>
          </Stack>
          <Text variant="muted">
            Transactional email runs through <Code>@sparx/email</Code>. Provider:{' '}
            <Code>{provider}</Code>. Welcome + password reset templates ship today; broadcasts +
            automations land with the email-worker service.
          </Text>
        </Stack>

        <Card>
          <CardHeader>
            <Heading level={3}>Send a test email</Heading>
            <CardDescription>
              Renders the production template against the active provider and reports the delivery
              id. In dev (console provider) the email content is also logged to stdout.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TestSendForm devLastSend={lastSend} />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
