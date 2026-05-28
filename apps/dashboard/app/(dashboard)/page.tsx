import Link from 'next/link';
import { requireSession } from '@sparx/auth';
import { withTenant } from '@sparx/db';
import { OnboardingBanner } from './_components/onboarding-banner';
import { loadOnboardingProgress } from './welcome/onboarding';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Code,
  Container,
  EmptyState,
  Grid,
  Heading,
  ModuleProvider,
  Stack,
  Stat,
  Text,
  type SparxModule,
} from '@sparx/ui';
import {
  Building2,
  Layers,
  LayoutTemplate,
  Mail,
  Package,
  Plus,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
} from 'lucide-react';

// First real dashboard page. Minimal but representative — Stats row + active
// modules grid + an empty-state placeholder for tasks. Pages will be filled
// in as the rest of the platform comes online; this is the merchant home
// that doc 23 §6 calls out as `(dashboard)/page.tsx`.

interface ModuleSummary {
  id: SparxModule;
  label: string;
  description: string;
  metric: string;
  href: string;
}

export const dynamic = 'force-dynamic';

const COMING_SOON: { href: string; label: string; description: string; icon: React.ReactNode }[] = [
  { href: '/sitebuilder', label: 'Sitebuilder', description: 'Themes, sections, visual editor', icon: <LayoutTemplate className="h-4 w-4" /> },
  { href: '/commerce', label: 'Commerce', description: 'Products, orders, checkout', icon: <ShoppingCart className="h-4 w-4" /> },
  { href: '/crm', label: 'CRM', description: 'Customers, pipeline, automation', icon: <Users className="h-4 w-4" /> },
  { href: '/email', label: 'Email', description: 'Templates, broadcasts, flows', icon: <Mail className="h-4 w-4" /> },
  { href: '/b2b', label: 'B2B', description: 'Wholesale, fleet, net terms', icon: <Building2 className="h-4 w-4" /> },
  { href: '/dropship', label: 'Dropship', description: 'Suppliers, routing, reconciliation', icon: <Truck className="h-4 w-4" /> },
  { href: '/ai', label: 'AI', description: 'MCP server, copilots, agents', icon: <Sparkles className="h-4 w-4" /> },
];

async function loadActiveModules(tenantId: string): Promise<ModuleSummary[]> {
  const pageCount = await withTenant({ tenantId }, (tx) => tx.page.count());
  return [
    {
      id: 'cms',
      label: 'CMS',
      description: 'Pages, blog posts, media library',
      metric: `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`,
      href: '/cms',
    },
  ];
}

export default async function DashboardHome() {
  const { user } = await requireSession();
  const [activeModules, onboarding] = await Promise.all([
    loadActiveModules(user.tenantId),
    loadOnboardingProgress(user.tenantId),
  ]);

  return (
    <Container size="xl">
      <Stack gap={8} className="py-8">
        <Stack direction="row" align="end" justify="between">
          <Stack gap={1}>
            <Heading level={1}>Good morning</Heading>
            <Text variant="muted">Here&apos;s a quick snapshot of your store.</Text>
          </Stack>
          <Button leftIcon={<Plus className="h-4 w-4" />}>New product</Button>
        </Stack>

        <OnboardingBanner progress={onboarding} />

        <Grid cols={1} mdCols={2} lgCols={4} gap={4}>
          <Stat
            label="Revenue (30d)"
            value="$12,408"
            delta={{ value: '+12.4%', trend: 'up' }}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <Stat
            label="Orders (30d)"
            value="184"
            delta={{ value: '+8 today', trend: 'up' }}
            icon={<Package className="h-4 w-4" />}
          />
          <Stat
            label="New customers"
            value="42"
            delta={{ value: '+3.2%', trend: 'up' }}
            icon={<Users className="h-4 w-4" />}
          />
          <Stat
            label="Storage"
            value="48 GB"
            delta={{ value: 'of 100', trend: 'neutral' }}
            icon={<Layers className="h-4 w-4" />}
          />
        </Grid>

        <Stack gap={3}>
          <Stack direction="row" align="end" justify="between">
            <Heading level={3}>Active modules</Heading>
            <Text size="xs" variant="muted">
              {activeModules.length} of 8 modules active
            </Text>
          </Stack>
          <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
            {activeModules.map((m) => (
              <ModuleProvider key={m.id} module={m.id}>
                <Card variant="module">
                  <CardHeader>
                    <CardDescription>{m.description}</CardDescription>
                    <CardTitle>{m.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Stack direction="row" align="center" gap={2}>
                      <Badge variant="module">Active</Badge>
                      <Text size="xs" variant="muted">
                        {m.metric}
                      </Text>
                    </Stack>
                  </CardContent>
                  <CardFooter>
                    <Button variant="module" size="sm" asChild>
                      <Link href={m.href}>Open</Link>
                    </Button>
                  </CardFooter>
                </Card>
              </ModuleProvider>
            ))}
          </Grid>
        </Stack>

        <Stack gap={3}>
          <Heading level={3}>Discover</Heading>
          <Grid cols={1} mdCols={3} gap={4}>
            {COMING_SOON.map((m) => (
              <Link key={m.label} href={m.href} className="block">
                <Card variant="subtle">
                  <Stack gap={2}>
                    <Stack direction="row" align="center" gap={2}>
                      <span aria-hidden className="text-[var(--color-text-secondary)]">
                        {m.icon}
                      </span>
                      <Text weight="medium">{m.label}</Text>
                      <Badge variant="outline">Preview</Badge>
                    </Stack>
                    <Text size="xs" variant="muted">
                      {m.description}
                    </Text>
                  </Stack>
                </Card>
              </Link>
            ))}
          </Grid>
        </Stack>

        <Stack gap={3}>
          <Heading level={3}>Tasks</Heading>
          <Card padding="none">
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="No tasks for today"
              description="When you have things to do, they'll show up here."
              action={
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/cms">Set up your first page</Link>
                </Button>
              }
            />
          </Card>
        </Stack>

        <Stack direction="row" align="center" gap={1}>
          <Text size="xs" variant="muted">
            Want to see every <Code>@sparx/ui</Code> component?
          </Text>
          <Button variant="link" size="xs" asChild>
            <Link href="/showcase">Visit /showcase</Link>
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
