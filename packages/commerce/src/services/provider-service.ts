// providerService — marketplace catalog + per-tenant installations +
// webhook ingress dispatch. Concrete provider packages register at boot
// via @sparx/integration-framework's registry; this service mediates
// every read/write a tenant can perform against the marketplace.
//
// Encrypted credentials: the `configEncrypted` jsonb column stores
// Secret-Manager paths only. Secret values are resolved on demand by
// the worker that consumes the provider — never persisted on the row.

import {
  InstallProviderInput,
  type ProviderEnvironment,
  type ProviderInstallStatus,
  type ProviderKind,
  type ProviderMetadata,
  ProviderWebhookEventInput,
  SetProviderEnabledInput,
  TestProviderInput,
  UpdateProviderConfigInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, ProviderInstallation, TxClient } from '@sparx/db';
import { getProvider, listProviders, type ProviderBundle } from '@sparx/integration-framework';

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

// ─── Marketplace catalog ─────────────────────────────────────────────

export function listAvailable(filter: { kind?: ProviderKind } = {}): Promise<ProviderMetadata[]> {
  const bundles = listProviders(filter);
  return Promise.resolve(bundles.map(toMetadata));
}

export function getMetadata(providerSlug: string): Promise<ProviderMetadata | null> {
  const bundle = getProvider(providerSlug);
  return Promise.resolve(bundle ? toMetadata(bundle) : null);
}

// ─── Per-tenant installations ────────────────────────────────────────

export interface InstallationRow {
  id: string;
  providerSlug: string;
  kind: ProviderKind;
  environment: ProviderEnvironment;
  enabled: boolean;
  status: ProviderInstallStatus;
  label: string | null;
  providerAccountId: string | null;
  lastHealthCheckAt: string | null;
  lastHealthStatus: string | null;
  errorCount: number;
  installedAt: string;
}

export async function listInstallations(
  ctx: ServiceContext,
  filter: { kind?: ProviderKind; enabled?: boolean } = {}
): Promise<InstallationRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.providerInstallation.findMany({
      where: {
        uninstalledAt: null,
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.enabled !== undefined ? { enabled: filter.enabled } : {}),
      },
      orderBy: [{ kind: 'asc' }, { providerSlug: 'asc' }],
      take: 200,
    });
    return rows.map(serializeInstallation);
  });
}

export async function getInstallation(
  ctx: ServiceContext,
  installationId: string
): Promise<InstallationRow | null> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.providerInstallation.findFirst({ where: { id: installationId } });
    return row ? serializeInstallation(row) : null;
  });
}

/**
 * Resolve the active installation of `kind` for this tenant. Used by
 * cart/checkout/order flows to pick the provider to call. Throws
 * CommerceNotFoundError when nothing is installed so callers can render
 * a "configure a provider first" message.
 */
export async function resolveActive(
  ctx: ServiceContext,
  kind: ProviderKind
): Promise<InstallationRow> {
  const row = await withTenant(ctx, async (tx) =>
    tx.providerInstallation.findFirst({
      where: { kind, enabled: true, status: 'active', uninstalledAt: null },
      orderBy: { installedAt: 'desc' },
    })
  );
  if (!row) throw new CommerceNotFoundError('ProviderInstallation', `kind=${kind}`);
  return serializeInstallation(row);
}

export async function install(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ installationId: string; status: ProviderInstallStatus }> {
  const input = InstallProviderInput.parse(rawInput);

  const bundle = getProvider(input.providerSlug);
  if (!bundle) {
    throw new CommerceValidationError(
      `Unknown provider slug "${input.providerSlug}". Make sure the provider package is registered.`
    );
  }
  if (!bundle.metadata.kinds.includes(input.kind)) {
    throw new CommerceValidationError(
      `Provider ${input.providerSlug} does not implement kind="${input.kind}". Supported: ${bundle.metadata.kinds.join(', ')}`
    );
  }

  const status: ProviderInstallStatus = 'pending_verification';

  const result = await withTenant(ctx, async (tx) => {
    const existing = await tx.providerInstallation.findFirst({
      where: {
        providerSlug: input.providerSlug,
        environment: input.environment,
        label: input.label ?? null,
        uninstalledAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      throw new CommerceConflictError(
        `${input.providerSlug} (${input.environment}) is already installed under this label`
      );
    }
    const created = await tx.providerInstallation.create({
      data: {
        tenantId: ctx.tenantId,
        providerSlug: input.providerSlug,
        kind: input.kind,
        environment: input.environment,
        enabled: true,
        status,
        label: input.label ?? null,
        configEncrypted: input.config as Prisma.InputJsonValue,
        scopes: bundle.metadata.requiredScopes,
      },
      select: { id: true },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.provider.installed',
      entityType: 'ProviderInstallation',
      entityId: created.id,
      diff: {
        after: {
          providerSlug: input.providerSlug,
          kind: input.kind,
          environment: input.environment,
        },
      },
    });
    return created.id;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'provider.installed',
    data: {
      installationId: result,
      providerSlug: input.providerSlug,
      kind: input.kind,
      environment: input.environment,
    },
  });

  return { installationId: result, status };
}

export async function updateConfig(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = UpdateProviderConfigInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const before = await tx.providerInstallation.findFirst({
      where: { id: input.installationId, uninstalledAt: null },
    });
    if (!before) throw new CommerceNotFoundError('ProviderInstallation', input.installationId);
    await tx.providerInstallation.update({
      where: { id: input.installationId },
      data: { configEncrypted: input.config as Prisma.InputJsonValue },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.provider.config_updated',
      entityType: 'ProviderInstallation',
      entityId: input.installationId,
      diff: null,
    });
  });
}

export async function setEnabled(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = SetProviderEnabledInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const before = await tx.providerInstallation.findFirst({
      where: { id: input.installationId, uninstalledAt: null },
    });
    if (!before) throw new CommerceNotFoundError('ProviderInstallation', input.installationId);
    await tx.providerInstallation.update({
      where: { id: input.installationId },
      data: {
        enabled: input.enabled,
        status: input.enabled ? before.status : 'disabled',
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: input.enabled ? 'commerce.provider.enabled' : 'commerce.provider.disabled',
      entityType: 'ProviderInstallation',
      entityId: input.installationId,
      diff: { after: { enabled: input.enabled } },
    });
  });
}

export async function uninstall(ctx: ServiceContext, installationId: string): Promise<void> {
  let providerSlug = '';
  let kind: ProviderKind = 'payment';

  await withTenant(ctx, async (tx) => {
    const before = await tx.providerInstallation.findFirst({
      where: { id: installationId, uninstalledAt: null },
    });
    if (!before) throw new CommerceNotFoundError('ProviderInstallation', installationId);
    providerSlug = before.providerSlug;
    kind = before.kind as ProviderKind;
    await tx.providerInstallation.update({
      where: { id: installationId },
      data: { enabled: false, status: 'disabled', uninstalledAt: new Date() },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.provider.uninstalled',
      entityType: 'ProviderInstallation',
      entityId: installationId,
      diff: null,
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'provider.uninstalled',
    data: { installationId, providerSlug, kind },
  });
}

export async function test(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ ok: boolean; details: string }> {
  const input = TestProviderInput.parse(rawInput);
  const installation = await getInstallation(ctx, input.installationId);
  if (!installation) {
    throw new CommerceNotFoundError('ProviderInstallation', input.installationId);
  }
  const bundle = getProvider(installation.providerSlug);
  if (!bundle) {
    return {
      ok: false,
      details: `Provider package "${installation.providerSlug}" is not registered at runtime.`,
    };
  }
  // The actual probe lives in the provider plugin; until those bridge
  // methods land we report a coarse "metadata present" signal so the
  // dashboard install dialog has something to render.
  return {
    ok: true,
    details: `Provider metadata loaded (slug=${installation.providerSlug}, vendor=${bundle.metadata.vendor}).`,
  };
}

/** Health-check sweep — called by the provider-webhook-worker on a
 *  schedule. Updates `lastHealthCheckAt` + emits `provider.health_changed`
 *  when the status flips. */
export async function recordHealth(
  ctx: ServiceContext,
  input: {
    installationId: string;
    status: ProviderInstallStatus;
    detail?: string;
  }
): Promise<void> {
  let statusChanged = false;
  let priorStatus: ProviderInstallStatus = 'pending_configuration';

  await withTenant(ctx, async (tx) => {
    const before = await tx.providerInstallation.findFirst({
      where: { id: input.installationId },
    });
    if (!before) throw new CommerceNotFoundError('ProviderInstallation', input.installationId);
    priorStatus = before.status as ProviderInstallStatus;
    statusChanged = priorStatus !== input.status;

    await tx.providerInstallation.update({
      where: { id: input.installationId },
      data: {
        lastHealthCheckAt: new Date(),
        lastHealthStatus: input.status,
        lastHealthDetail: input.detail ?? null,
        status: input.status,
        ...(input.status === 'errored'
          ? { errorCount: { increment: 1 }, lastErrorAt: new Date() }
          : {}),
      },
    });
  });

  if (statusChanged) {
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'provider.health_changed',
      data: {
        installationId: input.installationId,
        priorStatus,
        nextStatus: input.status,
        detail: input.detail,
      },
    });
  }
}

// ─── Webhook ingress ─────────────────────────────────────────────────

/**
 * Idempotently record a verified webhook. Caller (provider-webhook-worker)
 * already validated the signature via `bundle.payment.verifyWebhook` (or
 * the equivalent for other kinds). We persist the raw payload + return
 * the canonical eventId so duplicate provider retries are a no-op.
 */
export async function ingestWebhook(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ accepted: boolean; eventId: string }> {
  const input = ProviderWebhookEventInput.parse(rawInput);

  return withTenant(ctx, async (tx) => {
    const installation = await assertInstallationActive(tx, input.installationId);
    if (installation.providerSlug !== input.providerSlug) {
      throw new CommerceValidationError(
        `Webhook providerSlug ${input.providerSlug} does not match installation ${installation.providerSlug}`
      );
    }
    // Idempotency — duplicate provider retries land on the unique index
    // (providerSlug, providerEventId).
    const existing = await tx.providerWebhookEvent.findFirst({
      where: {
        providerSlug: input.providerSlug,
        providerEventId: input.providerEventId,
      },
      select: { id: true },
    });
    if (existing) return { accepted: false, eventId: existing.id };

    const created = await tx.providerWebhookEvent.create({
      data: {
        tenantId: ctx.tenantId,
        installationId: input.installationId,
        providerSlug: input.providerSlug,
        providerEventId: input.providerEventId,
        providerEventType: input.providerEventType,
        signatureVerifiedAt: new Date(input.signatureVerifiedAt),
        rawPayload: input.rawPayload as Prisma.InputJsonValue,
        status: 'received',
      },
      select: { id: true },
    });
    return { accepted: true, eventId: created.id };
  });
}

// ─── helpers ─────────────────────────────────────────────────────────

async function assertInstallationActive(
  tx: TxClient,
  installationId: string
): Promise<ProviderInstallation> {
  const row = await tx.providerInstallation.findFirst({
    where: { id: installationId, uninstalledAt: null },
  });
  if (!row) throw new CommerceNotFoundError('ProviderInstallation', installationId);
  return row;
}

function serializeInstallation(row: ProviderInstallation): InstallationRow {
  return {
    id: row.id,
    providerSlug: row.providerSlug,
    kind: row.kind as ProviderKind,
    environment: row.environment as ProviderEnvironment,
    enabled: row.enabled,
    status: row.status as ProviderInstallStatus,
    label: row.label,
    providerAccountId: row.providerAccountId,
    lastHealthCheckAt: row.lastHealthCheckAt?.toISOString() ?? null,
    lastHealthStatus: row.lastHealthStatus,
    errorCount: row.errorCount,
    installedAt: row.installedAt.toISOString(),
  };
}

function toMetadata(bundle: ProviderBundle): ProviderMetadata {
  return {
    slug: bundle.metadata.slug,
    displayName: bundle.metadata.displayName,
    description: bundle.metadata.description,
    vendor: bundle.metadata.vendor,
    logoMediaUrl: bundle.metadata.logoMediaUrl,
    kinds: bundle.metadata.kinds,
    supportedCurrencies: bundle.metadata.supportedCurrencies,
    supportedCountries: bundle.metadata.supportedCountries,
    sandboxAvailable: bundle.metadata.sandboxAvailable,
    whitelabelOf: bundle.metadata.whitelabelOf,
    configSchemaJson: bundle.metadata.configSchemaJson,
    webhookPathTemplate: bundle.metadata.webhookPathTemplate,
    requiredScopes: bundle.metadata.requiredScopes,
  };
}
