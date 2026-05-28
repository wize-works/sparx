// Built-in CRM templates.
//
// Phase 1 ships the default pipeline template — applied per-tenant on
// signup (onboarding worker) rather than under the platform tenant like
// content types, because each tenant gets their own editable copy.
// Built-in segments land in Phase 4.

export { DEFAULT_PIPELINE_TEMPLATE } from './pipeline.js';
export type { PipelineTemplate, PipelineStageTemplate } from './pipeline.js';
