import Link from 'next/link';
import {
  Globe,
  LayoutTemplate,
  Send,
  Settings as SettingsIcon,
  ShieldOff,
  Workflow,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Code,
  Grid,
  Heading,
  Stack,
} from '@sparx/ui';

import { api } from '@/lib/api-rest-client';
import { EmailShell } from './_components/email-shell';
import { OverviewStats } from './_components/overview-stats';
import { TestSendForm } from './test-send-form';
import { readLastDevSend } from './actions';
import type { OverviewResult } from './_lib/types';

export const dynamic = 'force-dynamic';

const SURFACES = [
  {
    href: '/email/broadcasts',
    icon: Send,
    title: 'Broadcasts',
    description: 'Compose a segment-targeted campaign, preview it, and schedule or send.',
  },
  {
    href: '/email/automations',
    icon: Workflow,
    title: 'Automations',
    description: 'Order, cart-abandon, win-back, and B2B flows triggered by platform events.',
  },
  {
    href: '/email/templates',
    icon: LayoutTemplate,
    title: 'Templates',
    description: 'Branded transactional + marketing templates with live preview and test send.',
  },
  {
    href: '/email/domains',
    icon: Globe,
    title: 'Sending domains',
    description: 'Send from your own domain — automatic DKIM, SPF, and DMARC via Mailgun.',
  },
  {
    href: '/email/suppressions',
    icon: ShieldOff,
    title: 'Suppressions',
    description: 'Unsubscribes, bounces, and complaints — kept in sync with Mailgun.',
  },
  {
    href: '/email/settings',
    icon: SettingsIcon,
    title: 'Settings',
    description: 'Sender identity, reply-to, physical address, and brand defaults.',
  },
] as const;

export default async function EmailOverviewPage() {
  const [lastSend, overview] = await Promise.all([
    readLastDevSend(),
    api.get<OverviewResult>('/v1/email/analytics/overview?days=30').catch(() => null),
  ]);
  const provider = (process.env.SPARX_EMAIL_PROVIDER ?? 'console').toLowerCase();

  return (
    <EmailShell
      current="overview"
      icon={<Send className="h-5 w-5" />}
      title="Email"
      description={
        <>
          Transactional, automated, and broadcast email through Mailgun. Active provider:{' '}
          <Code>{provider}</Code>.
        </>
      }
      actions={<Badge variant="module">Active</Badge>}
    >
      {overview ? <OverviewStats overview={overview} /> : null}

      <Stack gap={3}>
        <Heading level={3}>Surfaces</Heading>
        <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
          {SURFACES.map(({ href, icon: Icon, title, description }) => (
            <Card key={href} variant="module">
              <CardHeader>
                <Stack direction="row" align="center" gap={2}>
                  <Icon className="h-4 w-4 text-[var(--module-active)]" />
                  <CardTitle>{title}</CardTitle>
                </Stack>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="module-outline" size="sm" asChild>
                  <Link href={href}>Open {title.toLowerCase()}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </Grid>
      </Stack>

      <Card>
        <CardHeader>
          <CardTitle>Send a test email</CardTitle>
          <CardDescription>
            Renders a production template against the active provider and reports the delivery id.
            In dev (console provider) the email content is also logged to stdout.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TestSendForm devLastSend={lastSend} />
        </CardContent>
      </Card>
    </EmailShell>
  );
}
