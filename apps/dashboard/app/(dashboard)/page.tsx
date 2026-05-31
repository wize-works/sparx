import Link from 'next/link';
import { requireSession, type ModuleSlug } from '@sparx/auth';
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
import { api } from '@/lib/api-rest-client';
import { OverviewChartCard, SAMPLE_REVENUE_14D } from './_components/overview-charts';

// First real dashboard page. Minimal but representative — Stats row + active
// modules grid + an empty-state placeholder for tasks. All DB-backed bits
// resolve through api-rest (`/v1/dashboard/home`, `/v1/tenant/onboarding/progress`).

interface ModuleSummary {
  id: SparxModule;
  label: string;
  description: string;
  metric: string;
  href: string;
}

interface ModuleEntry {
  slug: ModuleSlug;
  id: SparxModule;
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export const dynamic = 'force-dynamic';

// Single source of metadata for every module that can appear on the home
// dashboard. The Active grid pulls from this filtered by enabled flag; the
// Discover grid pulls from this filtered by the opposite. Slug values match
// the ModuleSlug enum so they line up with /settings/modules.
const MODULE_REGISTRY: ModuleEntry[] = [
  {
    slug: 'storefront',
    id: 'storefront',
    href: '/sitebuilder',
    label: 'Storefront',
    description: 'Themes, sections, visual editor',
    icon: <LayoutTemplate className="h-4 w-4" />,
  },
  {
    slug: 'commerce',
    id: 'commerce',
    href: '/commerce',
    label: 'Commerce',
    description: 'Products, orders, checkout',
    icon: <ShoppingCart className="h-4 w-4" />,
  },
  {
    slug: 'cms',
    id: 'cms',
    href: '/cms',
    label: 'CMS',
    description: 'Pages, blog posts, media library',
    icon: <Layers className="h-4 w-4" />,
  },
  {
    slug: 'crm',
    id: 'crm',
    href: '/crm',
    label: 'CRM',
    description: 'Customers, pipeline, automation',
    icon: <Users className="h-4 w-4" />,
  },
  {
    slug: 'email',
    id: 'email',
    href: '/email',
    label: 'Email',
    description: 'Templates, broadcasts, flows',
    icon: <Mail className="h-4 w-4" />,
  },
  {
    slug: 'b2b',
    id: 'b2b',
    href: '/b2b',
    label: 'B2B',
    description: 'Wholesale, fleet, net terms',
    icon: <Building2 className="h-4 w-4" />,
  },
  {
    slug: 'dropship',
    id: 'dropship',
    href: '/dropship',
    label: 'Dropship',
    description: 'Suppliers, routing, reconciliation',
    icon: <Truck className="h-4 w-4" />,
  },
  {
    slug: 'ai',
    id: 'ai',
    href: '/ai',
    label: 'AI',
    description: 'MCP server, copilots, agents',
    icon: <Sparkles className="h-4 w-4" />,
  },
];

interface HomeResponse {
  modules: { slug: string; enabled: boolean; metric: string | null }[];
}

function joinHome(home: HomeResponse): {
  active: ModuleSummary[];
  inactive: ModuleEntry[];
} {
  const byslug = new Map(home.modules.map((m) => [m.slug, m]));
  const active: ModuleSummary[] = [];
  const inactive: ModuleEntry[] = [];
  for (const entry of MODULE_REGISTRY) {
    const state = byslug.get(entry.slug);
    if (state?.enabled) {
      active.push({
        id: entry.id,
        label: entry.label,
        description: entry.description,
        metric: state.metric ?? '—',
        href: entry.href,
      });
    } else {
      inactive.push(entry);
    }
  }
  return { active, inactive };
}

export default async function DashboardHome() {
  const { user } = await requireSession();
  const [home, onboarding] = await Promise.all([
    api.get<HomeResponse>('/v1/dashboard/home'),
    loadOnboardingProgress(user.tenantId),
  ]);
  const { active: activeModules, inactive: discoverModules } = joinHome(home);

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

        <Grid cols={1} mdCols={2} gap={4}>
          <OverviewChartCard
            title="Revenue"
            description="Net revenue, last 14 days"
            data={SAMPLE_REVENUE_14D}
            series={[{ key: 'revenue', label: 'Revenue', color: 'commerce' }]}
            type="area"
            format="currency"
          />
          <OverviewChartCard
            title="Orders"
            description="Orders placed, last 14 days"
            data={SAMPLE_REVENUE_14D}
            series={[{ key: 'orders', label: 'Orders', color: 'commerce' }]}
            type="bar"
            format="number"
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
                      <Badge color="module">Active</Badge>
                      <Text size="xs" variant="muted">
                        {m.metric}
                      </Text>
                    </Stack>
                  </CardContent>
                  <CardFooter>
                    <Button color="module" size="sm" asChild>
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
            {discoverModules.map((m) => (
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
                <Button variant="outline" size="sm" asChild>
                  <Link href="/cms/pages">Set up your first page</Link>
                </Button>
              }
            />
          </Card>
        </Stack>

        <Stack direction="row" align="center" gap={1}>
          <Text size="xs" variant="muted">
            Want to see every <Code>@sparx/ui</Code> component?
          </Text>
          <Button color="primary" variant="link" size="xs" asChild>
            <Link href="/showcase">Visit /showcase</Link>
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
