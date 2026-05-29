import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  Grid,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';
import {
  CreditCard,
  Globe,
  KeyRound,
  Plug,
  Settings as SettingsIcon,
  Shield,
  Users,
} from 'lucide-react';

interface SettingsGroup {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  ready: boolean;
}

const GROUPS: SettingsGroup[] = [
  {
    icon: <SettingsIcon className="h-4 w-4" />,
    title: 'General',
    description: 'Store name, locale, currency, time zone.',
    href: '/settings/general',
    ready: true,
  },
  {
    icon: <Users className="h-4 w-4" />,
    title: 'Team',
    description: 'Invite staff, assign roles, audit access.',
    href: '/settings',
    ready: false,
  },
  {
    icon: <CreditCard className="h-4 w-4" />,
    title: 'Billing & modules',
    description: 'Subscription, invoices, module activation.',
    href: '/settings',
    ready: false,
  },
  {
    icon: <Globe className="h-4 w-4" />,
    title: 'Domains',
    description: 'Custom domains, DNS, SSL status.',
    href: '/settings',
    ready: false,
  },
  {
    icon: <KeyRound className="h-4 w-4" />,
    title: 'AI Integrations',
    description: 'Issue scoped API keys for Claude, ChatGPT, and Copilot.',
    href: '/settings/ai-integrations',
    ready: true,
  },
  {
    icon: <Plug className="h-4 w-4" />,
    title: 'Integrations',
    description: 'Stripe, shipping carriers, accounting, ERPs.',
    href: '/settings',
    ready: false,
  },
  {
    icon: <Shield className="h-4 w-4" />,
    title: 'Security',
    description: 'MFA, session policy, IP allowlist, audit log.',
    href: '/settings',
    ready: false,
  },
];

export default function SettingsPage() {
  return (
    <Container size="xl">
      <Stack gap={8} className="py-10">
        <Stack gap={2}>
          <Heading level={1}>Settings</Heading>
          <Text variant="muted">
            Manage your store, team, and integrations. Each section will land here as the platform
            comes online.
          </Text>
        </Stack>

        <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
          {GROUPS.map((g) => (
            <Card key={g.title}>
              <CardHeader>
                <Stack direction="row" align="center" gap={2}>
                  <span aria-hidden className="text-[var(--color-text-secondary)]">
                    {g.icon}
                  </span>
                  <CardTitle>{g.title}</CardTitle>
                  {!g.ready && <Badge variant="outline">Soon</Badge>}
                </Stack>
                <CardDescription>{g.description}</CardDescription>
              </CardHeader>
              <CardContent />
              <CardFooter>
                {g.ready ? (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={g.href}>Open</Link>
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" disabled>
                    Open
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </Grid>
      </Stack>
    </Container>
  );
}
