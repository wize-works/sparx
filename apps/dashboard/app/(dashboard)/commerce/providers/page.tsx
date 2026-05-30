import Link from 'next/link';
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  PackageOpen,
  Plug,
  Puzzle,
  Receipt,
  Truck,
  Wallet,
} from 'lucide-react';

import { isModuleEnabled, requireSession } from '@sparx/auth';
import { providerService } from '@sparx/commerce';
import type {
  ProviderInstallStatus,
  ProviderKind,
  ProviderMetadata,
} from '@sparx/commerce-schemas';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { ensureProvidersRegistered } from '../../../../lib/providers-bootstrap';
import { ModuleStub } from '../../../../components/module-stub';
import { EntityRowLink } from '../../_components/entity-row-link';

export const dynamic = 'force-dynamic';

const KIND_ORDER: ProviderKind[] = [
  'payment',
  'tax',
  'shipping',
  'subscription_billing',
  'dropship',
];

const KIND_ICON: Record<ProviderKind, typeof Wallet> = {
  payment: Wallet,
  tax: Receipt,
  shipping: Truck,
  subscription_billing: Plug,
  dropship: Puzzle,
  identity: Plug,
};

const KIND_LABEL: Record<ProviderKind, string> = {
  payment: 'Payment',
  tax: 'Tax',
  shipping: 'Shipping',
  subscription_billing: 'Subscription billing',
  dropship: 'Dropship',
  identity: 'Identity',
};

export default async function ProvidersPage() {
  ensureProvidersRegistered();

  const session = await requireSession();
  const enabled = await isModuleEnabled(session.user.tenantId, 'commerce');
  if (!enabled) {
    return (
      <ModuleStub
        icon={<PackageOpen className="h-5 w-5" />}
        title="Commerce"
        tagline="Payment, tax, shipping marketplace."
        description="Activate the Commerce module from Billing to install providers."
        features={[]}
      />
    );
  }

  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };
  const [available, installed] = await Promise.all([
    providerService.listAvailable(),
    providerService.listInstallations(ctx),
  ]);

  const installedByKind = new Map<ProviderKind, typeof installed>();
  for (const inst of installed) {
    const list = installedByKind.get(inst.kind) ?? [];
    list.push(inst);
    installedByKind.set(inst.kind, list);
  }

  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Plug className="h-5 w-5" />
            <Heading level={1}>Providers</Heading>
            <Badge variant="module">
              {installed.length} installed · {available.length} available
            </Badge>
          </Stack>
          <Text variant="muted">
            Pick a payment / tax / shipping / subscription provider per environment. Sparx-branded
            options wrap a real provider underneath (Stripe for Sparx Pay, Shippo for Sparx
            Shipping) so a merchant who doesn&apos;t want to manage carrier accounts can still
            transact. Sandbox installs run real provider calls against the provider&apos;s test
            environment.
          </Text>
        </Stack>

        {KIND_ORDER.map((kind) => (
          <KindSection
            key={kind}
            kind={kind}
            available={available.filter((p) => p.kinds.includes(kind))}
            installed={installedByKind.get(kind) ?? []}
          />
        ))}
      </Stack>
    </Container>
  );
}

function KindSection({
  kind,
  available,
  installed,
}: {
  kind: ProviderKind;
  available: ProviderMetadata[];
  installed: Awaited<ReturnType<typeof providerService.listInstallations>>;
}) {
  const Icon = KIND_ICON[kind];

  return (
    <Card>
      <CardHeader>
        <Stack gap={1}>
          <Stack direction="row" align="center" gap={2}>
            <Icon className="h-4 w-4" />
            <Heading level={3}>{KIND_LABEL[kind]}</Heading>
            <Badge variant="outline">{installed.length} installed</Badge>
          </Stack>
          <CardDescription>{KIND_DESCRIPTION[kind]}</CardDescription>
        </Stack>
      </CardHeader>
      <CardContent>
        <Stack gap={5}>
          {installed.length > 0 && (
            <Stack gap={2}>
              <Heading level={4}>Installed</Heading>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Label</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Health</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installed.map((inst) => (
                    <TableRow key={inst.id}>
                      <TableCell>
                        <EntityRowLink
                          href={`/commerce/providers/${inst.id}`}
                          entityType="provider-installation"
                          entityId={inst.id}
                          className="font-medium hover:text-[var(--module-active)]"
                        >
                          {inst.providerSlug}
                        </EntityRowLink>
                      </TableCell>
                      <TableCell>
                        {inst.label ?? (
                          <Text size="xs" variant="muted">
                            —
                          </Text>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={inst.environment === 'production' ? 'success' : 'warning'}>
                          {inst.environment}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={inst.status} />
                      </TableCell>
                      <TableCell>
                        {inst.lastHealthCheckAt
                          ? new Date(inst.lastHealthCheckAt).toLocaleString()
                          : 'never'}
                        {inst.errorCount > 0 && (
                          <Badge variant="warning" className="ml-2">
                            {inst.errorCount} errors
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Stack>
          )}

          <Stack gap={2}>
            <Heading level={4}>Available to install</Heading>
            {available.length === 0 ? (
              <EmptyState
                icon={<Icon className="h-5 w-5" />}
                title={`No ${KIND_LABEL[kind].toLowerCase()} providers available`}
                description="Provider bundles register at server boot."
              />
            ) : (
              <Stack gap={2}>
                {available.map((p) => (
                  <ProviderCard key={p.slug} provider={p} kind={kind} />
                ))}
              </Stack>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ProviderCard({ provider, kind }: { provider: ProviderMetadata; kind: ProviderKind }) {
  return (
    <Stack
      direction="row"
      align="start"
      justify="between"
      gap={4}
      className="rounded border border-[var(--color-border-default)] p-4"
    >
      <Stack gap={1} className="min-w-0 flex-1">
        <Stack direction="row" align="center" gap={2}>
          <Text className="font-medium">{provider.displayName}</Text>
          {provider.whitelabelOf && (
            <Badge variant="outline" className="text-xs">
              powered by {provider.whitelabelOf}
            </Badge>
          )}
          {provider.sandboxAvailable && (
            <Badge variant="outline" className="text-xs">
              sandbox
            </Badge>
          )}
        </Stack>
        <Text size="sm" variant="muted">
          {provider.description}
        </Text>
        <Stack direction="row" gap={1} wrap className="pt-1">
          {provider.supportedCountries.slice(0, 8).map((c) => (
            <Badge key={c} variant="outline" className="text-xs">
              {c}
            </Badge>
          ))}
          {provider.supportedCountries.length > 8 && (
            <Badge variant="outline" className="text-xs">
              +{provider.supportedCountries.length - 8}
            </Badge>
          )}
        </Stack>
      </Stack>
      <Stack gap={1}>
        <Button asChild>
          <Link href={`/commerce/providers/install?slug=${provider.slug}&kind=${kind}`}>
            Install
          </Link>
        </Button>
      </Stack>
    </Stack>
  );
}

function StatusBadge({ status }: { status: ProviderInstallStatus }) {
  const map: Record<
    ProviderInstallStatus,
    { icon: typeof CircleCheck; variant: 'success' | 'warning' | 'outline' }
  > = {
    active: { icon: CircleCheck, variant: 'success' },
    pending_configuration: { icon: CircleDashed, variant: 'outline' },
    pending_oauth: { icon: CircleDashed, variant: 'outline' },
    pending_verification: { icon: CircleDashed, variant: 'outline' },
    errored: { icon: CircleAlert, variant: 'warning' },
    disabled: { icon: CircleAlert, variant: 'outline' },
  };
  const entry = map[status];
  const Icon = entry.icon;
  return (
    <Badge variant={entry.variant}>
      <Icon className="mr-1 inline h-3 w-3" />
      {status}
    </Badge>
  );
}

const KIND_DESCRIPTION: Record<ProviderKind, string> = {
  payment:
    'Charges cards / wallets / ACH. A merchant must install at least one before checkout can process payment.',
  tax: 'Real-time tax calculation. Wins over the manual fallback rates in Commerce → Tax.',
  shipping:
    'Live carrier rates + label purchase. Without one installed the storefront uses manual rates from Commerce → Shipping.',
  subscription_billing:
    'Schedules recurring charges for subscriptions. Most payment providers double as the subscription engine.',
  dropship:
    'Supplier catalog ingest + order forwarding. Dropship products route their fulfillment through the supplier API.',
  identity:
    'External identity / OAuth. Reserved for a future module — Better Auth handles Sparx-side identity today.',
};
