// Built-in CRM templates. Each tenant gets their own editable copy on CRM
// activation (decision: same pattern as the default pipeline template,
// rather than the cms-schemas content-type pattern of "one row per
// platform tenant" — merchants need to be able to rename and reweight
// these without affecting other tenants).

export { DEFAULT_PIPELINE_TEMPLATE } from './pipeline';
export type { PipelineTemplate, PipelineStageTemplate } from './pipeline';
export { BUILT_IN_SEGMENT_TEMPLATES } from './segments';
export type { SegmentTemplate } from './segments';
