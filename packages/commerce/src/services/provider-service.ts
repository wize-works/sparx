// providerService — marketplace + tenant installation surface. Concrete
// provider packages register their metadata at boot; the marketplace UI
// reads from this registry. Per-tenant config is encrypted via Google
// Secret Manager.

import type {
  InstallProviderInput,
  ProviderEnvironment,
  ProviderInstallStatus,
  ProviderKind,
  ProviderMetadata,
  SetProviderEnabledInput,
  TestProviderInput,
  UpdateProviderConfigInput,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

// ─── Marketplace catalog (registry of all known providers) ────────────

export function listAvailable(_filter: { kind?: ProviderKind } = {}): Promise<ProviderMetadata[]> {
  return notImplemented('providerService.listAvailable');
}

export function getMetadata(_providerSlug: string): Promise<ProviderMetadata | null> {
  return notImplemented('providerService.getMetadata');
}

// ─── Per-tenant installations ─────────────────────────────────────────

export interface InstallationRow {
  id: string;
  providerSlug: string;
  kind: ProviderKind;
  environment: ProviderEnvironment;
  enabled: boolean;
  status: ProviderInstallStatus;
  label: string | null;
  lastHealthCheckAt: string | null;
  installedAt: string;
}

export function listInstallations(
  _ctx: ServiceContext,
  _filter: { kind?: ProviderKind; enabled?: boolean } = {}
): Promise<InstallationRow[]> {
  return notImplemented('providerService.listInstallations');
}

export function getInstallation(
  _ctx: ServiceContext,
  _installationId: string
): Promise<InstallationRow | null> {
  return notImplemented('providerService.getInstallation');
}

/** Resolve the active installation of `kind` for this tenant. Used by
 *  cart/checkout/order flows to pick the provider to call. Throws
 *  CommerceNotFoundError when nothing is installed. */
export function resolveActive(_ctx: ServiceContext, _kind: ProviderKind): Promise<InstallationRow> {
  return notImplemented('providerService.resolveActive');
}

export function install(
  _ctx: ServiceContext,
  _input: InstallProviderInput
): Promise<{ installationId: string; status: ProviderInstallStatus }> {
  return notImplemented('providerService.install');
}

export function updateConfig(
  _ctx: ServiceContext,
  _input: UpdateProviderConfigInput
): Promise<void> {
  return notImplemented('providerService.updateConfig');
}

export function setEnabled(_ctx: ServiceContext, _input: SetProviderEnabledInput): Promise<void> {
  return notImplemented('providerService.setEnabled');
}

export function uninstall(_ctx: ServiceContext, _installationId: string): Promise<void> {
  return notImplemented('providerService.uninstall');
}

export function test(
  _ctx: ServiceContext,
  _input: TestProviderInput
): Promise<{ ok: boolean; details: string }> {
  return notImplemented('providerService.test');
}

/** Health check sweep — called by the provider-webhook-worker on a
 *  schedule, updates `lastHealthCheckAt` + emits `provider.health_changed`
 *  when the status flips. */
export function recordHealth(
  _ctx: ServiceContext,
  _input: { installationId: string; status: ProviderInstallStatus; detail?: string }
): Promise<void> {
  return notImplemented('providerService.recordHealth');
}

// ─── Webhook ingress ─────────────────────────────────────────────────

/** Validates a provider webhook by its signature, idempotently records
 *  the event, and dispatches to the right downstream handler. */
export function ingestWebhook(
  _ctx: ServiceContext,
  _input: {
    installationId: string;
    providerSlug: string;
    rawBody: string;
    signature: string;
  }
): Promise<{ accepted: boolean; eventId: string }> {
  return notImplemented('providerService.ingestWebhook');
}
