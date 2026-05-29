// Tenant-activation bootstrap.
//
// When a tenant activates the CRM module, seed:
//   • the default sales pipeline (DEFAULT_PIPELINE_TEMPLATE) with its stages
//   • the built-in segment templates (high-value, at-risk, b2b-fleet,
//     new-customers)
//
// Both bootstrap functions are idempotent (slug-keyed lookups), so a
// re-activation or a duplicate event is a safe no-op. We intentionally do
// NOT wrap this in gateHandler — gateHandler short-circuits on disabled
// tenants, but we ARE the consumer that runs only when the module just
// turned on. Module-cache invalidation also happens here (slimmer than
// pulling registry.ts into the loop). On `module.deactivated` we keep the
// rows around — disabling is reversible and merchants would be upset to
// lose their edited pipeline on a brief disable.

import { invalidateModuleCache } from '@sparx/auth';

import * as pipelineService from '../services/pipeline-service';
import * as segmentService from '../services/segment-service';
import type { ConsumerContext } from './registry';

export function registerModuleActivationConsumers(ctx: ConsumerContext): (() => void)[] {
  return [
    ctx.bus.subscribe('module.activated', async (event) => {
      const slug = (event.payload as { module?: string } | null)?.module;
      if (slug !== 'crm') return;
      // Drop the cached "is CRM enabled?" answer first, otherwise the
      // service-layer's withTenant() calls below would race the cache and
      // potentially see the old (disabled) answer. Bootstrap doesn't use
      // the gate (it's a system action), but downstream side effects
      // (audit logger, publishCrmEvent) might.
      invalidateModuleCache(event.tenantId, 'crm');
      const serviceCtx = { tenantId: event.tenantId, userId: undefined };
      await pipelineService.bootstrapDefaultPipeline(serviceCtx);
      await segmentService.bootstrapBuiltInSegments(serviceCtx);
    }),
  ];
}
