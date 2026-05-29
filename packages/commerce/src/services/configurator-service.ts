// configuratorService — bundle + option-matrix-with-rules engine.
// Resolves a ConfigurationSelection from the storefront into a
// ResolvedConfiguration the cart can store as a line item.

import type {
  ConfigurationSelection,
  CreateBundleInput,
  CreateConfigurationTemplateInput,
  ResolvedConfiguration,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

// ─── Bundles ──────────────────────────────────────────────────────────

export function createBundle(
  _ctx: ServiceContext,
  _input: CreateBundleInput
): Promise<{ id: string }> {
  return notImplemented('configuratorService.createBundle');
}

export function getBundle(_ctx: ServiceContext, _id: string): Promise<unknown> {
  return notImplemented('configuratorService.getBundle');
}

// ─── Configurator templates ───────────────────────────────────────────

export function createTemplate(
  _ctx: ServiceContext,
  _input: CreateConfigurationTemplateInput
): Promise<{ id: string }> {
  return notImplemented('configuratorService.createTemplate');
}

export function getTemplate(_ctx: ServiceContext, _id: string): Promise<unknown> {
  return notImplemented('configuratorService.getTemplate');
}

export function listTemplatesForProduct(
  _ctx: ServiceContext,
  _productId: string
): Promise<unknown[]> {
  return notImplemented('configuratorService.listTemplatesForProduct');
}

// ─── Resolution ───────────────────────────────────────────────────────
//
// Deterministic given a (template, selections) pair. Pure read — does
// not write a Cart row. The cart service calls this and stores the
// ResolvedConfiguration on CartItem.configurationPayload.

export function resolve(
  _ctx: ServiceContext,
  _selection: ConfigurationSelection
): Promise<ResolvedConfiguration> {
  return notImplemented('configuratorService.resolve');
}

/** Validates a selection without resolving prices — used by the
 *  configurator step UI to surface errors before "Add to cart". */
export function validate(
  _ctx: ServiceContext,
  _selection: ConfigurationSelection
): Promise<{ ok: boolean; errors: string[] }> {
  return notImplemented('configuratorService.validate');
}

/** Routes a configurator selection too complex for the rule grammar
 *  into the CRM Quote workflow. Emits configuration.requested. */
export function requestQuote(
  _ctx: ServiceContext,
  _input: { selection: ConfigurationSelection; customerId?: string; notes?: string }
): Promise<{ quoteId: string }> {
  return notImplemented('configuratorService.requestQuote');
}
